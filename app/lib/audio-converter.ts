type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

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

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

async function localAssetUrl(path: string, type: string): Promise<string> {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
}

async function getFFmpeg(onStatus?: (message: string) => void): Promise<FFmpegInstance> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onStatus?.("Loading audio engine (31 MB)…");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      const [coreURL, wasmURL] = await Promise.all([
        localAssetUrl("/ffmpeg/ffmpeg-core.js", "text/javascript"),
        localAssetUrl("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
      ]);
      try {
        await ffmpeg.load({
          classWorkerURL: new URL("/ffmpeg/ffmpeg-worker.js", window.location.origin).href,
          coreURL,
          wasmURL,
        });
      } catch (error) {
        URL.revokeObjectURL(coreURL);
        URL.revokeObjectURL(wasmURL);
        throw error;
      }
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw new AudioConversionError(error instanceof Error ? error.message : String(error));
    });
  }
  return ffmpegPromise;
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
