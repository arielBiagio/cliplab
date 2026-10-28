import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from '../../shared/Icon';
import { buildFilter } from '../editing/filters';
import type { Adjustments } from '../editing/types';
import type { LutState } from '../luts/types';
import type { ColorMixerState } from '../editing/colorMixer';
import { useVideoRenderer } from '../rendering/useVideoRenderer';
import { DEFAULT_COMPARISON } from '../rendering/comparison';
import { useKeyboardShortcuts } from '../shortcuts/useKeyboardShortcuts';
import type { ShortcutPreferences } from '../shortcuts/types';
import { Timeline } from '../timeline/Timeline';
import { PlaybackControls } from './PlaybackControls';
import { VideoLoader } from './VideoLoader';
import { VideoDropZone } from './VideoDropZone';
import { useVideoPlayer } from './useVideoPlayer';
import { ComparisonOverlay } from './ComparisonOverlay';

interface Props {
  file: File | null;
  adjustments: Adjustments;
  lut: LutState;
  colorMixer: ColorMixerState;
  onLoad: (file: File) => void;
  onReady: (ready: boolean) => void;
  onGraphicsReady: (ready: boolean) => void;
  preferences: ShortcutPreferences;
  shortcutsOpen: boolean;
  scopeRef: RefObject<HTMLElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  initialTime?: number;
  onPositionChange?: (time: number, immediately: boolean) => void;
}

export function VideoPlayer({
  file,
  adjustments,
  lut,
  colorMixer,
  onLoad,
  onReady,
  onGraphicsReady,
  preferences,
  shortcutsOpen,
  scopeRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  initialTime,
  onPositionChange,
}: Props) {
  const [comparison, setComparison] = useState({ ...DEFAULT_COMPARISON });
  const playbackRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const fullscreenPending = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const fullscreenAvailable =
    document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
  const {
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
  } = useVideoPlayer(file, onReady, initialTime, onPositionChange);
  const {
    canvasRef,
    mode: rendererMode,
    warning: rendererWarning,
  } = useVideoRenderer(videoRef, adjustments, !!file, comparison, lut, colorMixer);
  const ready = state.status === 'ready';
  const comparisonAvailable = ready && rendererMode === 'webgl2';
  const comparing = comparisonAvailable && comparison.enabled;

  useEffect(() => {
    let wasFullscreen = false;
    function syncFullscreen() {
      const active = document.fullscreenElement === playbackRef.current;
      setIsFullscreen(active);
      setFullscreenError(null);
      if (active) playbackRef.current?.focus({ preventScroll: true });
      else if (wasFullscreen) fullscreenButtonRef.current?.focus({ preventScroll: true });
      wasFullscreen = active;
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const container = playbackRef.current;
    if (!container || !fullscreenAvailable || fullscreenPending.current) return;
    const exiting = document.fullscreenElement === container;
    if (!ready && !exiting) return;
    fullscreenPending.current = true;
    setFullscreenError(null);
    try {
      if (exiting) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      if (container.isConnected)
        setFullscreenError(
          'Could not change fullscreen mode. Try opening ClipLab in its own browser tab, or press Escape to exit fullscreen.',
        );
    } finally {
      fullscreenPending.current = false;
    }
  }
  useEffect(() => {
    onGraphicsReady(ready && rendererMode === 'webgl2');
  }, [ready, rendererMode, onGraphicsReady]);
  useKeyboardShortcuts({
    scopeRef,
    preferences,
    suspended: shortcutsOpen,
    ready,
    canUndo,
    canRedo,
    onToggle: togglePlayback,
    onSeek: seekBy,
    onUndo,
    onRedo,
  });

  return (
    <div className="playback-area" ref={playbackRef} tabIndex={-1}>
      <section className="preview-panel panel" aria-labelledby="preview-heading">
        <div className="panel-heading">
          <div className="heading-with-icon">
            <span className="preview-dot" />
            <h2 id="preview-heading">Preview</h2>
            <span className="preview-filename" title={file?.name}>
              {file?.name ?? 'A blank canvas, for now'}
            </span>
          </div>
          <div className="preview-actions">
            <button
              type="button"
              className="comparison-toggle"
              aria-label="Compare before and after"
              aria-pressed={comparison.enabled}
              title={
                comparisonAvailable
                  ? 'Compare original and edited'
                  : 'Comparison requires the graphics preview'
              }
              disabled={!comparisonAvailable}
              onClick={() =>
                setComparison((previous) => ({ ...previous, enabled: !previous.enabled }))
              }
            >
              <Icon name="compare" width="16" height="16" />
              <span>Compare</span>
            </button>
            <button
              type="button"
              className="icon-button fullscreen-toggle"
              ref={fullscreenButtonRef}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              title={
                !fullscreenAvailable
                  ? 'Fullscreen is unavailable in this browser'
                  : isFullscreen
                    ? 'Exit fullscreen (Esc)'
                    : 'Enter fullscreen'
              }
              disabled={!fullscreenAvailable || (!ready && !isFullscreen)}
              onClick={() => void toggleFullscreen()}
            >
              <Icon name={isFullscreen ? 'minimize' : 'fullscreen'} width="17" height="17" />
            </button>
          </div>
        </div>
        <VideoDropZone hasVideo={!!file} loading={state.status === 'loading'} onLoad={onLoad}>
          <video
            ref={videoRef}
            className={ready && rendererMode !== 'webgl2' ? 'video-visible' : ''}
            style={{ filter: rendererMode === 'webgl2' ? 'none' : buildFilter(adjustments) }}
            playsInline
            preload="metadata"
            aria-label="Video preview"
            aria-hidden={rendererMode === 'webgl2'}
          />
          <canvas
            ref={canvasRef}
            className={`video-canvas ${ready && rendererMode === 'webgl2' ? 'preview-visible' : ''}`}
            data-renderer={rendererMode}
            role="img"
            aria-label={
              comparing
                ? 'Video preview: original on the left, edited on the right'
                : 'Video preview'
            }
            aria-hidden={!ready || rendererMode !== 'webgl2'}
          />
          {comparing && (
            <ComparisonOverlay
              videoRef={videoRef}
              split={comparison.split}
              onChange={(split) =>
                setComparison((previous) =>
                  previous.split === split ? previous : { ...previous, split },
                )
              }
            />
          )}
          {!file && (
            <div className="empty-state">
              <div className="empty-visual" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="art-card art-card-back" />
                <div className="art-card art-card-front">
                  <span className="art-sun" />
                  <span className="art-hill art-hill-back" />
                  <span className="art-hill art-hill-front" />
                  <span className="art-frame-corner corner-one" />
                  <span className="art-frame-corner corner-two" />
                  <span className="art-time">00:00:01</span>
                  <span className="art-play">
                    <Icon name="play" width="16" height="16" />
                  </span>
                </div>
                <span className="art-spark spark-one">+</span>
                <span className="art-spark spark-two">+</span>
                <span className="art-caption">A DIFFERENT POINT OF VIEW</span>
              </div>
              <span className="eyebrow">A LITTLE ROOM TO EXPERIMENT</span>
              <h2>
                Good footage.
                <br />
                <span>Great possibilities.</span>
              </h2>
              <p>Drop your video here, or choose a file.</p>
              <VideoLoader onLoad={onLoad} variant="empty" />
              <span className="supported-formats">MP4, WebM & other browser-supported formats</span>
            </div>
          )}
          {state.status === 'loading' && (
            <div className="video-message" role="status">
              <span className="loading-spinner" />
              <h3>Finding your first frame…</h3>
              <p>Your video stays on this device.</p>
            </div>
          )}
          {state.status === 'error' && (
            <div className="video-message">
              <Icon name="film" width="36" height="36" />
              <h3>Let’s try another take.</h3>
              <p role="alert">{state.error}</p>
              <VideoLoader onLoad={onLoad} hasVideo inputLabel="Choose replacement video" />
            </div>
          )}
          {ready && !comparing && (
            <div className="video-overlay-label" aria-hidden="true">
              <span className="status-dot" /> PREVIEW ONLY
            </div>
          )}
        </VideoDropZone>
        {ready && rendererWarning && (
          <p className="rendering-warning" role="status">
            {rendererWarning} Exposure, shadows, highlights, temperature and tint are temporarily
            bypassed.
            {lut.source && ' The LUT is temporarily bypassed too.'}
            {comparison.enabled && ' Before/after comparison is temporarily unavailable.'}
          </p>
        )}
        {ready && state.error && (
          <p className="playback-error" role="alert">
            {state.error}
          </p>
        )}
        {fullscreenError && (
          <p className="playback-error" role="alert">
            {fullscreenError}
          </p>
        )}
        <PlaybackControls
          ready={ready}
          isPlaying={state.isPlaying}
          isLooping={state.isLooping}
          isMuted={state.isMuted}
          currentTime={state.currentTime}
          duration={state.duration}
          onToggle={togglePlayback}
          onToggleLoop={toggleLoop}
          onToggleMute={toggleMute}
          onSeekBy={seekBy}
          onRestart={restart}
        />
      </section>
      <Timeline
        currentTime={state.currentTime}
        duration={state.duration}
        disabled={!ready}
        fileName={file?.name ?? null}
        onSeek={seekTo}
        onStartScrub={startScrub}
        onEndScrub={endScrub}
      />
    </div>
  );
}
