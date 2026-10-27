import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { Icon } from '../../shared/Icon';

interface Props {
  hasVideo: boolean;
  loading: boolean;
  onLoad: (file: File) => void;
  children: ReactNode;
}

function containsFiles(transfer: DataTransfer | null): boolean {
  return Array.from(transfer?.types ?? []).includes('Files');
}

function isVideo(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const unknownType = !file.type || file.type === 'application/octet-stream';
  return (
    unknownType &&
    /\.(mp4|webm|mov|m4v|ogv|ogg|avi|mkv|mpeg|mpg|3gp|3g2|mts|m2ts|ts)$/i.test(file.name)
  );
}

export function VideoDropZone({ hasVideo, loading, onLoad, children }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    // A file dropped outside the preview must not replace the page in the browser.
    function preventFileNavigation(event: DragEvent) {
      if (!containsFiles(event.dataTransfer) || event.defaultPrevented) return;
      event.preventDefault();
      if (event.type === 'dragover' && event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    }
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  function enter(event: ReactDragEvent<HTMLDivElement>) {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function leave(event: ReactDragEvent<HTMLDivElement>) {
    if (!containsFiles(event.dataTransfer)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function drop(event: ReactDragEvent<HTMLDivElement>) {
    if (!containsFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      setError('Drop one video at a time. Your current video has not changed.');
      return;
    }
    if (!isVideo(files[0])) {
      setError('Choose a video file, such as MP4 or WebM. Your current video has not changed.');
      return;
    }
    setError(null);
    onLoad(files[0]);
  }

  return (
    <div
      className={`video-stage ${hasVideo ? 'has-video' : ''} ${isDragging ? 'is-dragging' : ''}`}
      role="region"
      aria-label="Video drop zone"
      aria-busy={loading}
      onDragEnter={enter}
      onDragLeave={leave}
      onDragOver={(event) => {
        if (!containsFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={drop}
    >
      {children}
      {isDragging && (
        <div className="drop-overlay" role="status">
          <span className="drop-overlay-icon">
            <Icon name="upload" width="28" height="28" />
          </span>
          <strong>{hasVideo ? 'Drop to replace your video' : 'Drop to open your video'}</strong>
          <span>One video. Kept entirely on your device.</span>
        </div>
      )}
      {error && (
        <div className="drop-error">
          <p role="alert">{error}</p>
          <button
            className="icon-button"
            aria-label="Dismiss file warning"
            onClick={() => setError(null)}
          >
            <Icon name="close" width="16" height="16" />
          </button>
        </div>
      )}
    </div>
  );
}
