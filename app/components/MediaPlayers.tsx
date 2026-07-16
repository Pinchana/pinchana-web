"use client";

/* Authenticated preview images cannot use the server-side Next image optimizer. */
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faMusic,
  faPause,
  faPlay,
  faVolumeHigh,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import {useTranslations} from "next-intl";

type SharedPlayerProps = {
  playerId: string;
  active: boolean;
  enabled?: boolean;
  volume: number;
  muted: boolean;
  onActivate: (playerId: string) => void;
  onVolumeChange: (volume: number) => void;
  onMutedChange: (muted: boolean) => void;
};

type TransportOptions = SharedPlayerProps & {
  mediaRef: RefObject<HTMLMediaElement | null>;
};

type PlayerIconProps = {
  name: "play" | "pause" | "volume" | "mute" | "expand" | "compress" | "music";
};

const PLAYER_ICONS = {
  play: faPlay,
  pause: faPause,
  volume: faVolumeHigh,
  mute: faVolumeXmark,
  expand: faExpand,
  compress: faCompress,
  music: faMusic,
};

function PlayerIcon({ name }: PlayerIconProps) {
  return <FontAwesomeIcon icon={PLAYER_ICONS[name]} />;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function useMediaTransport({
  mediaRef,
  playerId,
  active,
  enabled = true,
  volume,
  muted,
  onActivate,
  onVolumeChange,
  onMutedChange,
}: TransportOptions) {
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = volume;
    media.muted = muted;
  }, [mediaRef, muted, volume]);

  useEffect(() => {
    if (active && enabled) return;
    mediaRef.current?.pause();
  }, [active, enabled, mediaRef]);

  const togglePlayback = useCallback(() => {
    const media = mediaRef.current;
    if (!media || error || !enabled) return;
    if (media.paused) {
      onActivate(playerId);
      void media.play().catch(() => setError(true));
    } else {
      media.pause();
    }
  }, [enabled, error, mediaRef, onActivate, playerId]);

  const seekTo = useCallback((nextTime: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.max(0, Math.min(nextTime, media.duration));
    setCurrentTime(media.currentTime);
  }, [mediaRef]);

  const changeVolume = useCallback((nextVolume: number) => {
    const normalized = Math.max(0, Math.min(1, nextVolume));
    onVolumeChange(normalized);
    if (normalized > 0 && muted) onMutedChange(false);
  }, [muted, onMutedChange, onVolumeChange]);

  const toggleMuted = useCallback(() => {
    if (muted) {
      onMutedChange(false);
    } else if (volume === 0) {
      onVolumeChange(0.75);
      onMutedChange(false);
    } else {
      onMutedChange(true);
    }
  }, [muted, onMutedChange, onVolumeChange, volume]);

  const mediaEvents = {
    onLoadedMetadata: () => {
      const media = mediaRef.current;
      if (!media) return;
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      setCurrentTime(media.currentTime);
      setError(false);
    },
    onDurationChange: () => {
      const nextDuration = mediaRef.current?.duration ?? 0;
      setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
    },
    onTimeUpdate: () => setCurrentTime(mediaRef.current?.currentTime ?? 0),
    onPlay: () => {
      onActivate(playerId);
      setPlaying(true);
      setBuffering(false);
    },
    onPlaying: () => {
      setPlaying(true);
      setBuffering(false);
    },
    onPause: () => setPlaying(false),
    onWaiting: () => setBuffering(true),
    onCanPlay: () => setBuffering(false),
    onEnded: () => {
      setPlaying(false);
      setCurrentTime(0);
      if (mediaRef.current) mediaRef.current.currentTime = 0;
    },
    onError: () => {
      setPlaying(false);
      setBuffering(false);
      setError(true);
    },
  };

  return {
    buffering,
    changeVolume,
    currentTime,
    duration,
    error,
    mediaEvents,
    playing,
    seekTo,
    toggleMuted,
    togglePlayback,
  };
}

type TimelineProps = {
  currentTime: number;
  duration: number;
  disabled?: boolean;
  compact?: boolean;
  onSeek: (time: number) => void;
};

function Timeline({ currentTime, duration, disabled = false, compact = false, onSeek }: TimelineProps) {
  const t = useTranslations("player");
  const progress = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
  const style = { "--player-progress": `${progress}%` } as CSSProperties;
  return (
    <div className={`player-timeline ${compact ? "is-compact" : ""}`}>
      <span>{formatTime(currentTime)}</span>
      <input
        type="range"
        min="0"
        max={duration || 0}
        step="0.01"
        value={duration ? Math.min(currentTime, duration) : 0}
        style={style}
        disabled={disabled || !duration}
        aria-label={t("seek")}
        aria-valuetext={t("time", {current: formatTime(currentTime), duration: formatTime(duration)})}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
      <span>{formatTime(duration)}</span>
    </div>
  );
}

type VolumeControlProps = {
  volume: number;
  muted: boolean;
  compact?: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMuted: () => void;
};

function VolumeControl({ volume, muted, compact = false, onVolumeChange, onToggleMuted }: VolumeControlProps) {
  const t = useTranslations("player");
  return (
    <div className={`player-volume ${compact ? "is-compact" : ""}`}>
      <button type="button" onClick={onToggleMuted} aria-label={muted || volume === 0 ? t("unmute") : t("mute")}>
        <PlayerIcon name={muted || volume === 0 ? "mute" : "volume"} />
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={muted ? 0 : volume}
        aria-label={t("volume")}
        onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

export type VideoPlayerProps = SharedPlayerProps & {
  src: string;
  poster?: string;
  width?: number;
  height?: number;
  label: string;
};

export function VideoPlayer({ src, poster, width, height, label, ...shared }: VideoPlayerProps) {
  const t = useTranslations("player");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);
  const revealOnlyTap = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const transport = useMediaTransport({ ...shared, mediaRef: videoRef });

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current === null) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const revealControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);
    if (transport.playing) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2_500);
    }
  }, [clearHideTimer, transport.playing]);

  useEffect(() => {
    clearHideTimer();
    if (transport.playing) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2_500);
    }
    return clearHideTimer;
  }, [clearHideTimer, transport.playing]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!wrapper || !video) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else {
        video.webkitEnterFullscreen?.();
      }
    } catch {
      video.webkitEnterFullscreen?.();
    }
  }, []);

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      transport.togglePlayback();
    } else if (key === "arrowleft") {
      event.preventDefault();
      transport.seekTo(transport.currentTime - 5);
    } else if (key === "arrowright") {
      event.preventDefault();
      transport.seekTo(transport.currentTime + 5);
    } else if (key === "arrowup") {
      event.preventDefault();
      transport.changeVolume(shared.volume + 0.05);
    } else if (key === "arrowdown") {
      event.preventDefault();
      transport.changeVolume(shared.volume - 0.05);
    } else if (key === "m") {
      event.preventDefault();
      transport.toggleMuted();
    } else if (key === "f") {
      event.preventDefault();
      void toggleFullscreen();
    } else {
      return;
    }
    revealControls();
  };

  const controlsShown = controlsVisible || !transport.playing || transport.buffering;

  const handlePointerDown = (pointerType: string) => {
    revealOnlyTap.current = pointerType === "touch" && transport.playing && !controlsShown;
    revealControls();
  };

  const handleVideoClick = () => {
    if (revealOnlyTap.current) {
      revealOnlyTap.current = false;
      return;
    }
    transport.togglePlayback();
  };

  return (
    <div
      ref={wrapperRef}
      className="custom-video-player"
      data-controls={controlsShown ? "visible" : "hidden"}
      data-playing={transport.playing}
      tabIndex={0}
      aria-label={t("videoPlayer", {label})}
      onKeyDown={handleKeyboard}
      onPointerMove={revealControls}
      onPointerDown={(event) => handlePointerDown(event.pointerType)}
      onFocusCapture={revealControls}
      onMouseLeave={() => { if (transport.playing) setControlsVisible(false); }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        width={width}
        height={height}
        playsInline
        preload="metadata"
        onClick={handleVideoClick}
        {...transport.mediaEvents}
      />

      {transport.error ? (
        <div className="player-error" role="status">{t("videoUnavailable")}</div>
      ) : (
        <>
          {transport.buffering ? <span className="player-buffering" aria-label={t("buffering")} /> : null}
          {!transport.playing ? (
            <button className="video-center-play" type="button" onClick={transport.togglePlayback} aria-label={t("playVideo")}>
              <PlayerIcon name="play" />
            </button>
          ) : null}
          <div className="video-controls">
            <Timeline
              currentTime={transport.currentTime}
              duration={transport.duration}
              disabled={transport.error}
              onSeek={transport.seekTo}
            />
            <div className="video-control-row">
              <button type="button" onClick={transport.togglePlayback} aria-label={transport.playing ? t("pauseVideo") : t("playVideo")}>
                <PlayerIcon name={transport.playing ? "pause" : "play"} />
              </button>
              <VolumeControl
                volume={shared.volume}
                muted={shared.muted}
                onVolumeChange={transport.changeVolume}
                onToggleMuted={transport.toggleMuted}
              />
              <span className="video-control-spacer" />
              <button type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? t("exitFullscreen") : t("enterFullscreen")}>
                <PlayerIcon name={fullscreen ? "compress" : "expand"} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export type AudioPlayerProps = SharedPlayerProps & {
  src: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
};

export function AudioPlayer({ src, title, subtitle, coverUrl, ...shared }: AudioPlayerProps) {
  const t = useTranslations("player");
  const audioRef = useRef<HTMLAudioElement>(null);
  const transport = useMediaTransport({ ...shared, mediaRef: audioRef });

  return (
    <div className="custom-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" {...transport.mediaEvents} />
      <div className="audio-player-art" aria-hidden="true">
        {coverUrl ? <img src={coverUrl} alt="" /> : <PlayerIcon name="music" />}
      </div>
      <div className="audio-player-copy">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      {transport.error ? (
        <div className="player-error is-inline" role="status">{t("audioUnavailable")}</div>
      ) : (
        <div className="audio-player-transport">
          <button className="audio-primary-action" type="button" onClick={transport.togglePlayback} aria-label={transport.playing ? t("pauseAudio") : t("playAudio")}>
            {transport.buffering ? <span className="player-buffering is-small" /> : <PlayerIcon name={transport.playing ? "pause" : "play"} />}
          </button>
          <Timeline currentTime={transport.currentTime} duration={transport.duration} disabled={transport.error} onSeek={transport.seekTo} />
          <VolumeControl
            volume={shared.volume}
            muted={shared.muted}
            onVolumeChange={transport.changeVolume}
            onToggleMuted={transport.toggleMuted}
          />
        </div>
      )}
    </div>
  );
}

export type CompactAudioPlayerProps = SharedPlayerProps & {
  src: string;
  label: string;
};

export function CompactAudioPlayer({ src, label, ...shared }: CompactAudioPlayerProps) {
  const t = useTranslations("player");
  const audioRef = useRef<HTMLAudioElement>(null);
  const transport = useMediaTransport({ ...shared, mediaRef: audioRef });

  return (
    <div className="compact-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" {...transport.mediaEvents} />
      <button type="button" onClick={transport.togglePlayback} aria-label={transport.playing ? t("pauseLabel", {label}) : t("playLabel", {label})}>
        {transport.buffering ? <span className="player-buffering is-small" /> : <PlayerIcon name={transport.playing ? "pause" : "play"} />}
      </button>
      <Timeline currentTime={transport.currentTime} duration={transport.duration} disabled={transport.error} compact onSeek={transport.seekTo} />
      <VolumeControl
        volume={shared.volume}
        muted={shared.muted}
        compact
        onVolumeChange={transport.changeVolume}
        onToggleMuted={transport.toggleMuted}
      />
      {transport.error ? <span className="compact-player-error" role="status">{t("previewUnavailable")}</span> : null}
    </div>
  );
}
