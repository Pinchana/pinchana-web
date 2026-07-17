type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

import { FFMPEG_CORE_URL, FFMPEG_WASM_URL } from "@/app/generated/ffmpeg-assets";

export class AudioStreamUnavailableError extends Error {
  constructor() {
    super("This media does not contain a usable audio stream.");
    this.name = "AudioStreamUnavailableError";
  }
}

export class AudioConversionError extends Error {
  constructor(detail?: string) {
    super(detail ? `Audio conversion failed: ${detail}` : "Audio conversion failed in this browser.");
    this.name = "AudioConversionError";
  }
}

export class GifConversionError extends Error {
  constructor(detail?: string) {
    super(detail ? `GIF conversion failed: ${detail}` : "GIF conversion failed in this browser.");
    this.name = "GifConversionError";
  }
}

export class BrowserFFmpegUnavailableError extends Error {
  constructor(detail?: string) {
    super(detail ? `Browser media conversion is unavailable: ${detail}` : "Browser media conversion is unavailable.");
    this.name = "BrowserFFmpegUnavailableError";
  }
}

let ffmpegPromise: Promise<FFmpegInstance> | null = null;
let wasmPreflightPromise: Promise<void> | null = null;

async function ensureWebAssemblyAvailable(): Promise<void> {
  if (!wasmPreflightPromise) {
    wasmPreflightPromise = (async () => {
      if (typeof WebAssembly === "undefined" || typeof WebAssembly.compile !== "function") {
        throw new BrowserFFmpegUnavailableError("WebAssembly is not supported.");
      }
      try {
        await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new BrowserFFmpegUnavailableError(detail);
      }
    })().catch((error) => {
      wasmPreflightPromise = null;
      throw error;
    });
  }
  return wasmPreflightPromise;
}

async function getFFmpeg(onStatus?: (message: string) => void): Promise<FFmpegInstance> {
  await ensureWebAssemblyAvailable();
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus?.("Loading audio engine (31 MB)…");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: new URL(FFMPEG_CORE_URL, window.location.origin).href,
        wasmURL: new URL(FFMPEG_WASM_URL, window.location.origin).href,
      });
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

export async function convertToGif(
  source: Blob,
  sourceExtension: string,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const id = crypto.randomUUID();
  const safeExtension = sourceExtension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "mp4";
  const inputName = `input-${id}.${safeExtension}`;
  const outputName = `loop-${id}.gif`;
  const logs: string[] = [];
  let ffmpeg: FFmpegInstance | null = null;
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 8) logs.shift();
  };
  const handleProgress = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      onProgress?.(Math.round(progress * 100));
    }
  };

  try {
    ffmpeg = await getFFmpeg();
    ffmpeg.on("log", onLog);
    ffmpeg.on("progress", handleProgress);
    await ffmpeg.writeFile(inputName, new Uint8Array(await source.arrayBuffer()));
    const exitCode = await ffmpeg.exec([
      "-loglevel", "error",
      "-i", inputName,
      "-filter_complex", "fps=12,scale='min(960,iw)':-2:flags=lanczos,split[frames][palette_source];[palette_source]palettegen=max_colors=128:stats_mode=diff[palette];[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
      "-loop", "0",
      outputName,
    ]);
    if (exitCode !== 0) {
      throw new GifConversionError(logs.at(-1) || "FFmpeg exited before producing a GIF.");
    }
    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new GifConversionError("FFmpeg produced an empty GIF.");
    }
    return new Blob([Uint8Array.from(output).buffer], { type: "image/gif" });
  } catch (error) {
    if (error instanceof GifConversionError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new GifConversionError(logs.at(-1) || detail);
  } finally {
    if (ffmpeg) {
      ffmpeg.off("log", onLog);
      ffmpeg.off("progress", handleProgress);
      await Promise.allSettled([
        ffmpeg.deleteFile(inputName),
        ffmpeg.deleteFile(outputName),
      ]);
    }
  }
}

export async function convertToMp3(
  source: Blob,
  sourceExtension: string,
  onStatus?: (message: string) => void,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onStatus);
  const id = crypto.randomUUID();
  const safeExtension = sourceExtension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "media";
  const inputName = `input-${id}.${safeExtension}`;
  const outputName = `audio-${id}.mp3`;
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 8) logs.shift();
  };
  const onProgress = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
      onStatus?.(`Converting audio · ${Math.round(progress * 100)}%`);
    }
  };

  try {
    ffmpeg.on("log", onLog);
    ffmpeg.on("progress", onProgress);
    onStatus?.("Preparing audio source…");
    await ffmpeg.writeFile(inputName, new Uint8Array(await source.arrayBuffer()));
    onStatus?.("Converting audio…");
    const exitCode = await ffmpeg.exec([
      "-loglevel", "error",
      "-i", inputName,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-q:a", "2",
      outputName,
    ]);
    if (exitCode !== 0) {
      const detail = logs.at(-1) || "FFmpeg exited before producing an MP3.";
      if (logs.some((line) => /matches no streams|does not contain any stream|stream map.*no streams/i.test(line))) {
        throw new AudioStreamUnavailableError();
      }
      throw new AudioConversionError(detail);
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array) || output.byteLength === 0) {
      throw new AudioStreamUnavailableError();
    }
    return new Blob([Uint8Array.from(output).buffer], { type: "audio/mpeg" });
  } catch (error) {
    if (error instanceof AudioStreamUnavailableError || error instanceof AudioConversionError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new AudioConversionError(logs.at(-1) || detail);
  } finally {
    ffmpeg.off("log", onLog);
    ffmpeg.off("progress", onProgress);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}
