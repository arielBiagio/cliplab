import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from 'react';
import { getContainBounds, normalizeComparisonSplit } from '../rendering/comparison';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  split: number;
  onChange: (split: number) => void;
}

export function ComparisonOverlay({ videoRef, split, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; start: number } | null>(null);
  const [bounds, setBounds] = useState<ReturnType<typeof getContainBounds>>(null);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;
    function measure() {
      const rect = container!.getBoundingClientRect();
      setBounds(getContainBounds(rect.width, rect.height, video!.videoWidth, video!.videoHeight));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    video.addEventListener('resize', measure);
    video.addEventListener('loadedmetadata', measure);
    const initialFrame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(initialFrame);
      observer.disconnect();
      video.removeEventListener('resize', measure);
      video.removeEventListener('loadedmetadata', measure);
    };
  }, [videoRef]);

  function changeFromPointer(event: PointerEvent<HTMLInputElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 0)
      onChange(normalizeComparisonSplit(((event.clientX - rect.left) / rect.width) * 100));
  }

  function finishPointer(input: HTMLInputElement, cancel = false) {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (!pointer) return;
    if (input.hasPointerCapture(pointer.id)) input.releasePointerCapture(pointer.id);
    if (cancel) onChange(pointer.start);
  }

  return (
    <div ref={containerRef} className="comparison-overlay">
      {bounds && (
        <div
          className="comparison-frame"
          style={{ ...bounds, '--comparison-split': `${split}%` } as CSSProperties}
        >
          {split >= 15 && (
            <span className="comparison-label comparison-original" aria-hidden="true">
              Original
            </span>
          )}
          {split <= 85 && (
            <span className="comparison-label comparison-edited" aria-hidden="true">
              Edited
            </span>
          )}
          <div className="comparison-divider" aria-hidden="true">
            <span className="comparison-handle">↔</span>
          </div>
          <input
            className="comparison-range"
            type="range"
            min="0"
            max="100"
            step="1"
            value={split}
            aria-label="Before and after split"
            aria-valuetext={`${split}% original, ${100 - split}% edited`}
            aria-describedby="comparison-instructions"
            onChange={(event) => {
              if (!pointerRef.current)
                onChange(normalizeComparisonSplit(Number(event.target.value)));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || pointerRef.current) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              pointerRef.current = { id: event.pointerId, start: split };
              event.currentTarget.setPointerCapture(event.pointerId);
              changeFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (pointerRef.current?.id !== event.pointerId) return;
              event.preventDefault();
              changeFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (pointerRef.current?.id !== event.pointerId) return;
              changeFromPointer(event);
              finishPointer(event.currentTarget);
            }}
            onPointerCancel={(event) => {
              if (pointerRef.current?.id === event.pointerId)
                finishPointer(event.currentTarget, true);
            }}
            onLostPointerCapture={(event) => {
              if (pointerRef.current?.id === event.pointerId)
                finishPointer(event.currentTarget, true);
            }}
            onBlur={(event) => finishPointer(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && pointerRef.current) {
                event.preventDefault();
                finishPointer(event.currentTarget, true);
              }
            }}
          />
          <span id="comparison-instructions" className="visually-hidden">
            Drag or use the arrow keys to move the split. Home shows the edit; End shows the
            original. Escape cancels a drag.
          </span>
        </div>
      )}
    </div>
  );
}
