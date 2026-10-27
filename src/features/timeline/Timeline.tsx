import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { Icon } from '../../shared/Icon';
import { formatTime } from '../../shared/formatTime';

interface Props {
  currentTime: number;
  duration: number;
  disabled: boolean;
  fileName: string | null;
  onSeek: (seconds: number) => void;
  onStartScrub: () => void;
  onEndScrub: (cancel?: boolean) => void;
}

export function Timeline({
  currentTime,
  duration,
  disabled,
  fileName,
  onSeek,
  onStartScrub,
  onEndScrub,
}: Props) {
  const activePointer = useRef<number | null>(null);
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const positions = [0, 0.25, 0.5, 0.75, 1];

  function seekFromPointer(event: PointerEvent<HTMLInputElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    onSeek(fraction * duration);
  }

  function finishPointer(input: HTMLInputElement, cancel = false) {
    const pointerId = activePointer.current;
    activePointer.current = null;
    if (pointerId !== null && input.hasPointerCapture(pointerId))
      input.releasePointerCapture(pointerId);
    onEndScrub(cancel);
  }

  return (
    <section className="timeline-panel panel" aria-labelledby="timeline-heading">
      <div className="timeline-heading">
        <div className="heading-with-icon">
          <Icon name="film" width="16" height="16" />
          <h2 id="timeline-heading">Timeline</h2>
          <span className="clip-count">{fileName ? '1 CLIP' : 'NO CLIP'}</span>
        </div>
        <span className="timeline-hint">Click or drag to explore</span>
      </div>
      <div className={`timeline-track ${disabled ? 'is-empty' : ''}`}>
        <div className="timeline-ruler" aria-hidden="true">
          {positions.map((position) => (
            <span key={position}>{formatTime(duration * position)}</span>
          ))}
        </div>
        <div className="clip-lane" aria-hidden="true">
          <Icon name="film" width="16" height="16" />
          <span>{fileName ?? 'Your story goes here'}</span>
          {!fileName && <span className="clip-dash" />}
        </div>
        <div className="playhead" style={{ left: `${progress}%` }} aria-hidden="true">
          <span />
        </div>
        <input
          className="timeline-range"
          aria-label="Video timeline"
          type="range"
          min="0"
          max={duration || 1}
          step="0.01"
          value={Math.min(currentTime, duration || 1)}
          disabled={disabled}
          style={{ '--range-progress': `${progress}%` } as CSSProperties}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0 || activePointer.current !== null) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            onStartScrub();
            seekFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (activePointer.current !== event.pointerId) return;
            event.preventDefault();
            seekFromPointer(event);
          }}
          onPointerUp={(event) => {
            if (activePointer.current !== event.pointerId) return;
            seekFromPointer(event);
            finishPointer(event.currentTarget);
          }}
          onPointerCancel={(event) => {
            if (activePointer.current === event.pointerId) finishPointer(event.currentTarget, true);
          }}
          onLostPointerCapture={(event) => {
            if (activePointer.current === event.pointerId) finishPointer(event.currentTarget, true);
          }}
          onChange={(event) => {
            if (activePointer.current === null) onSeek(Number(event.target.value));
          }}
          onBlur={(event) => finishPointer(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              finishPointer(event.currentTarget, true);
            }
            if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ].includes(event.key)
            )
              onStartScrub();
          }}
          onKeyUp={(event) => {
            if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
              ].includes(event.key)
            )
              onEndScrub();
          }}
        />
      </div>
      <div className="timeline-footer">
        <span>
          <span className="track-dot" /> Video 01
        </span>
      </div>
    </section>
  );
}
