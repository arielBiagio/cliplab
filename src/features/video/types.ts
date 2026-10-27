export interface VideoSource {
  file: File;
  objectUrl: string;
}

export interface PlaybackState {
  status: 'empty' | 'loading' | 'ready' | 'error';
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  isSeeking: boolean;
  error: string | null;
}
