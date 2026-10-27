import type { RefObject } from 'react';
import { Icon } from '../../shared/Icon';
import { buildFilter } from '../editing/filters';
import type { Adjustments } from '../editing/types';
import { useKeyboardShortcuts } from '../shortcuts/useKeyboardShortcuts';
import type { ShortcutPreferences } from '../shortcuts/types';
import { Timeline } from '../timeline/Timeline';
import { PlaybackControls } from './PlaybackControls';
import { VideoLoader } from './VideoLoader';
import { VideoDropZone } from './VideoDropZone';
import { useVideoPlayer } from './useVideoPlayer';

interface Props {
  file: File | null;
  adjustments: Adjustments;
  onLoad: (file: File) => void;
  onReady: (ready: boolean) => void;
  preferences: ShortcutPreferences;
  shortcutsOpen: boolean;
  scopeRef: RefObject<HTMLElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function VideoPlayer({
  file,
  adjustments,
  onLoad,
  onReady,
  preferences,
  shortcutsOpen,
  scopeRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
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
  } = useVideoPlayer(file, onReady);
  const ready = state.status === 'ready';
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
    <div className="playback-area">
      <section className="preview-panel panel" aria-labelledby="preview-heading">
        <div className="panel-heading">
          <div className="heading-with-icon">
            <span className="preview-dot" />
            <h2 id="preview-heading">Preview</h2>
            <span className="preview-filename" title={file?.name}>
              {file?.name ?? 'A blank canvas, for now'}
            </span>
          </div>
          <span className="preview-mode">
            FIT <span>↗</span>
          </span>
        </div>
        <VideoDropZone hasVideo={!!file} loading={state.status === 'loading'} onLoad={onLoad}>
          <video
            ref={videoRef}
            className={ready ? 'video-visible' : ''}
            style={{ filter: buildFilter(adjustments) }}
            playsInline
            preload="metadata"
            aria-label="Video preview"
          />
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
          {ready && (
            <div className="video-overlay-label" aria-hidden="true">
              <span className="status-dot" /> PREVIEW ONLY
            </div>
          )}
        </VideoDropZone>
        {ready && state.error && (
          <p className="playback-error" role="alert">
            {state.error}
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
