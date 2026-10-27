import { useId, useRef } from 'react';
import { Icon } from '../../shared/Icon';

interface Props {
  onLoad: (file: File) => void;
  hasVideo?: boolean;
  variant?: 'primary' | 'empty';
  inputLabel?: string;
}

export function VideoLoader({ onLoad, hasVideo = false, variant = 'primary', inputLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.m4v"
        className="visually-hidden"
        tabIndex={-1}
        aria-label={inputLabel ?? (variant === 'empty' ? 'Choose your video' : 'Choose video file')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onLoad(file);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className={`import-button ${variant === 'empty' ? 'empty-import' : ''}`}
        aria-label={
          variant === 'empty' ? 'Choose a video' : hasVideo ? 'Replace video' : 'Open video'
        }
        title={variant === 'empty' ? 'Choose a video' : hasVideo ? 'Replace video' : 'Open video'}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="upload" width="17" height="17" />
        <span className="import-button-label">
          {variant === 'empty' ? 'Choose a video' : hasVideo ? 'Replace video' : 'Open video'}
        </span>
      </button>
    </>
  );
}
