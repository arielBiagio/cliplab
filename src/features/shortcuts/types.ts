export type PlaybackAction = 'togglePlayback' | 'seekBackward' | 'seekForward';

export interface ShortcutBinding {
  code: string;
}

export interface ShortcutPreferences {
  version: 1;
  bindings: Record<PlaybackAction, ShortcutBinding>;
}
