import { Icon } from '../../shared/Icon';
import { formatTime } from '../../shared/formatTime';

interface Props {
  ready: boolean;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onSeekBy: (delta: number) => void;
  onRestart: () => void;
}

export function PlaybackControls({
  ready,
  isPlaying,
  isLooping,
  isMuted,
  currentTime,
  duration,
  onToggle,
  onToggleLoop,
  onToggleMute,
  onSeekBy,
  onRestart,
}: Props) {
  return (
    <div className="playback-controls">
      <div className="playback-time">
        <span>{formatTime(currentTime)}</span>
        <span className="time-separator">/</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="transport">
        <button
          className="icon-button restart-button"
          aria-label="Restart video"
          title="Restart video"
          disabled={!ready}
          onClick={onRestart}
        >
          <Icon name="restart" width="17" height="17" />
        </button>
        <button
          className="icon-button"
          aria-label="Seek backward 5 seconds"
          title="Back 5 seconds"
          disabled={!ready}
          onClick={() => onSeekBy(-5)}
        >
          <Icon name="backward" width="17" height="17" />
        </button>
        <button
          className="play-button"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
          disabled={!ready}
          onClick={onToggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} width="18" height="18" />
        </button>
        <button
          className="icon-button"
          aria-label="Seek forward 5 seconds"
          title="Forward 5 seconds"
          disabled={!ready}
          onClick={() => onSeekBy(5)}
        >
          <Icon name="forward" width="17" height="17" />
        </button>
      </div>
      <div className="playback-options" role="group" aria-label="Playback options">
        <button
          className="icon-button"
          aria-label="Loop video"
          aria-pressed={isLooping}
          title={isLooping ? 'Disable loop' : 'Enable loop'}
          disabled={!ready}
          onClick={onToggleLoop}
        >
          <Icon name="loop" width="17" height="17" />
        </button>
        <button
          className="icon-button"
          aria-label="Mute audio"
          aria-pressed={isMuted}
          title={isMuted ? 'Unmute audio' : 'Mute audio'}
          disabled={!ready}
          onClick={onToggleMute}
        >
          <Icon name={isMuted ? 'muted' : 'volume'} width="17" height="17" />
        </button>
      </div>
    </div>
  );
}
