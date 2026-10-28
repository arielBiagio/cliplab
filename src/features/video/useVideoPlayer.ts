import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackState, VideoSource } from './types';

interface ScrubSession {
  wasPlaying: boolean;
  startTime: number;
  targetTime: number;
  ending: boolean;
}

export function useVideoPlayer(
  file: File | null,
  onReady: (ready: boolean) => void,
  initialTime = 0,
  onPositionChange?: (time: number, immediately: boolean) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubRef = useRef<ScrubSession | null>(null);
  const scrubFrameRef = useRef<number | null>(null);
  const scrubWaitingRef = useRef(false);
  const [state, setState] = useState<PlaybackState>({
    status: file ? 'loading' : 'empty',
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    isLooping: false,
    isMuted: false,
    isSeeking: false,
    error: null,
  });

  const playSafely = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const source = video.src;
    try {
      await video.play();
      if (video.isConnected && video.src === source)
        setState((previous) => ({ ...previous, error: null }));
    } catch {
      if (video.isConnected && video.src === source) {
        setState((previous) => ({
          ...previous,
          isPlaying: false,
          error: 'Playback was interrupted. Press Play to try again.',
        }));
      }
    }
  }, []);

  const clearScrub = useCallback(() => {
    if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
    scrubFrameRef.current = null;
    scrubWaitingRef.current = false;
    scrubRef.current = null;
  }, []);

  const flushScrub = useCallback(() => {
    const video = videoRef.current;
    const scrub = scrubRef.current;
    if (!video || !scrub || video.seeking || scrubWaitingRef.current) return;

    // Keep only the latest target and let an in-flight seek finish before replacing it.
    if (Math.abs(video.currentTime - scrub.targetTime) > 0.001) {
      scrubWaitingRef.current = true;
      video.currentTime = scrub.targetTime;
      return;
    }

    if (scrub.ending) {
      scrubRef.current = null;
      setState((previous) => ({
        ...previous,
        currentTime: video.currentTime,
        isSeeking: false,
      }));
      if (scrub.wasPlaying && video.currentTime < video.duration) void playSafely();
    }
  }, [playSafely]);

  const scheduleScrub = useCallback(() => {
    if (scrubFrameRef.current !== null || scrubWaitingRef.current) return;
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      flushScrub();
    });
  }, [flushScrub]);

  useEffect(() => {
    const video = videoRef.current;
    if (!file || !video) return;
    const source: VideoSource = { file, objectUrl: URL.createObjectURL(file) };
    let active = true;
    let notifiedReady = false;
    let positionRestored = false;
    const sync = (event?: Event) => {
      if (!active) return;
      setState((previous) => ({
        ...previous,
        currentTime: scrubRef.current?.targetTime ?? video.currentTime,
        isPlaying: !video.paused && !video.ended,
        isMuted: video.muted,
      }));
      if (positionRestored)
        onPositionChange?.(video.currentTime, event?.type === 'pause' || event?.type === 'ended');
    };
    const seeked = () => {
      sync();
      if (!active || !scrubRef.current) return;
      if (scrubFrameRef.current !== null) cancelAnimationFrame(scrubFrameRef.current);
      scrubWaitingRef.current = true;
      // Allow a paint between decoded positions instead of immediately seeking again.
      scrubFrameRef.current = requestAnimationFrame(() => {
        scrubFrameRef.current = requestAnimationFrame(() => {
          scrubFrameRef.current = null;
          if (!active) return;
          scrubWaitingRef.current = false;
          flushScrub();
        });
      });
    };
    const metadata = () => {
      if (!active) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        if (!positionRestored) {
          positionRestored = true;
          video.pause();
          const time = Number.isFinite(initialTime)
            ? Math.min(video.duration, Math.max(0, initialTime))
            : 0;
          if (time > 0) video.currentTime = time;
        }
        setState((previous) => ({
          ...previous,
          status: 'ready',
          duration: video.duration,
          currentTime: video.currentTime,
          error: null,
        }));
        if (!notifiedReady) {
          notifiedReady = true;
          onReady(true);
        }
      } else fail();
    };
    const fail = () => {
      if (!active) return;
      clearScrub();
      video.pause();
      setState((previous) => ({
        ...previous,
        status: 'error',
        isPlaying: false,
        isSeeking: false,
        error: 'This video could not be played. Try an MP4 (H.264) or WebM file.',
      }));
      onReady(false);
      notifiedReady = false;
    };
    const events = ['timeupdate', 'play', 'pause', 'ended', 'volumechange'] as const;
    events.forEach((name) => video.addEventListener(name, sync));
    video.addEventListener('seeked', seeked);
    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('durationchange', metadata);
    video.addEventListener('error', fail);
    video.src = source.objectUrl;
    video.load();
    return () => {
      active = false;
      clearScrub();
      events.forEach((name) => video.removeEventListener(name, sync));
      video.removeEventListener('seeked', seeked);
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('durationchange', metadata);
      video.removeEventListener('error', fail);
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(source.objectUrl);
    };
  }, [file, onReady, clearScrub, flushScrub, initialTime, onPositionChange]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (
        !video ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return;
      const time = Math.min(video.duration, Math.max(0, seconds));
      if (scrubRef.current) {
        scrubRef.current.targetTime = time;
        scheduleScrub();
      } else {
        video.currentTime = time;
      }
      setState((previous) => ({ ...previous, currentTime: time }));
    },
    [scheduleScrub],
  );

  const seekBy = useCallback(
    (delta: number) => {
      if (videoRef.current)
        seekTo((scrubRef.current?.targetTime ?? videoRef.current.currentTime) + delta);
    },
    [seekTo],
  );

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || state.status !== 'ready') return;
    if (video.paused) {
      if (video.ended || video.currentTime >= video.duration) seekTo(0);
      void playSafely();
    } else video.pause();
  }, [state.status, seekTo, playSafely]);

  const restart = useCallback(() => seekTo(0), [seekTo]);

  const toggleLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video || state.status !== 'ready') return;
    video.loop = !video.loop;
    setState((previous) => ({ ...previous, isLooping: video.loop }));
  }, [state.status]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video || state.status !== 'ready') return;
    video.muted = !video.muted;
    setState((previous) => ({ ...previous, isMuted: video.muted }));
  }, [state.status]);

  const startScrub = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const previous = scrubRef.current;
    if (previous && !previous.ending) return;
    const startTime = previous?.targetTime ?? video.currentTime;
    scrubRef.current = {
      wasPlaying: previous?.wasPlaying ?? (!video.paused && !video.ended),
      startTime,
      targetTime: startTime,
      ending: false,
    };
    video.pause();
    setState((previous) => ({ ...previous, isSeeking: true }));
  }, []);

  const endScrub = useCallback(
    (cancel = false) => {
      const scrub = scrubRef.current;
      if (!scrub) return;
      if (cancel) scrub.targetTime = scrub.startTime;
      scrub.ending = true;
      setState((previous) => ({ ...previous, currentTime: scrub.targetTime }));
      scheduleScrub();
    },
    [scheduleScrub],
  );

  return {
    videoRef,
    state,
    togglePlayback,
    toggleLoop,
    toggleMute,
    seekTo,
    seekBy,
    restart,
    startScrub,
    endScrub,
  };
}
