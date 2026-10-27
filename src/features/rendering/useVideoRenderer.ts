import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Adjustments } from '../editing/types';
import { createVideoRenderer, type VideoRenderer } from './videoRenderer';
import { DEFAULT_COMPARISON, type ComparisonView } from './comparison';

interface RendererState {
  mode: 'pending' | 'webgl2' | 'css';
  warning: string | null;
}

export function useVideoRenderer(
  videoRef: RefObject<HTMLVideoElement | null>,
  adjustments: Readonly<Adjustments>,
  enabled: boolean,
  comparison: Readonly<ComparisonView> = DEFAULT_COMPARISON,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const adjustmentsRef = useRef(adjustments);
  const comparisonRef = useRef(comparison);
  const drawRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<RendererState>({ mode: 'pending', warning: null });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video || !canvas) return;
    let active = true;
    let renderer: VideoRenderer | null = null;
    let videoFrame: number | null = null;
    let hasDrawn = false;
    const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';

    function cancelFrames() {
      if (videoFrame !== null) video!.cancelVideoFrameCallback(videoFrame);
      videoFrame = null;
    }

    function fallback(warning: string) {
      cancelFrames();
      renderer?.dispose();
      renderer = null;
      hasDrawn = false;
      if (active) setState({ mode: 'css', warning });
    }

    function draw() {
      if (!active || !renderer) return;
      try {
        if (renderer.render(video!, adjustmentsRef.current, comparisonRef.current) && !hasDrawn) {
          hasDrawn = true;
          setState({ mode: 'webgl2', warning: null });
        }
      } catch {
        fallback(
          'Graphics preview is unavailable. Standard preview is active; your edits are preserved.',
        );
      }
    }

    function nextVideoFrame() {
      videoFrame = null;
      if (!active || !renderer) return;
      draw();
      scheduleFrames();
    }

    function scheduleFrames() {
      if (!active || !renderer) return;
      if (videoFrame === null) videoFrame = video!.requestVideoFrameCallback(nextVideoFrame);
    }

    function refresh() {
      draw();
      scheduleFrames();
    }

    function initialize() {
      if (!active) return;
      if (!frameCallbacks) {
        fallback(
          'Graphics preview is unavailable in this browser. Standard preview is active; your edits are preserved.',
        );
        return;
      }
      try {
        renderer = createVideoRenderer(canvas!);
        refresh();
      } catch {
        fallback(
          'Graphics acceleration is unavailable. Standard preview is active; your edits are preserved.',
        );
      }
    }

    function lost(event: Event) {
      event.preventDefault();
      fallback(
        'Graphics preview was interrupted. Standard preview is active; your edits are preserved.',
      );
    }

    drawRef.current = draw;
    const events = ['loadeddata', 'seeked', 'play', 'pause', 'ended', 'resize'] as const;
    events.forEach((name) => video.addEventListener(name, refresh));
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', initialize);
    // Strict Mode can dispose this effect before the queued initialization runs.
    queueMicrotask(initialize);

    return () => {
      active = false;
      cancelFrames();
      drawRef.current = null;
      events.forEach((name) => video.removeEventListener(name, refresh));
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', initialize);
      renderer?.dispose();
    };
  }, [videoRef, enabled]);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
    comparisonRef.current = comparison;
    drawRef.current?.();
  }, [adjustments, comparison]);

  return { canvasRef, ...state };
}
