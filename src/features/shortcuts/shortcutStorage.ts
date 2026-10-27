import type { PlaybackAction, ShortcutPreferences } from './types';

export const STORAGE_KEY = 'cliplab.shortcuts.v1';
export const SHORTCUT_ACTIONS: { id: PlaybackAction; label: string }[] = [
  { id: 'togglePlayback', label: 'Play / pause' },
  { id: 'seekBackward', label: 'Back 5 seconds' },
  { id: 'seekForward', label: 'Forward 5 seconds' },
];

export const ALLOWED_CODES = [
  'Space',
  'ArrowLeft',
  'ArrowRight',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
];

export function shortcutLabel(code: string): string {
  if (code === 'Space') return 'Space';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code.replace('Key', '');
}

export function defaultPreferences(): ShortcutPreferences {
  return {
    version: 1,
    bindings: {
      togglePlayback: { code: 'Space' },
      seekBackward: { code: 'ArrowLeft' },
      seekForward: { code: 'ArrowRight' },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validPreferences(value: unknown): value is ShortcutPreferences {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.bindings)) return false;
  const bindings = value.bindings;
  if (Object.keys(bindings).length !== SHORTCUT_ACTIONS.length) return false;
  const codes = SHORTCUT_ACTIONS.map(({ id }) => {
    const binding = bindings[id];
    return isRecord(binding) && typeof binding.code === 'string' ? binding.code : '';
  });
  return (
    codes.every((code) => ALLOWED_CODES.includes(code)) &&
    new Set(codes).size === SHORTCUT_ACTIONS.length
  );
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readPreferences(storage?: PreferenceStorage): {
  preferences: ShortcutPreferences;
  warning: string | null;
} {
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (raw === null) return { preferences: defaultPreferences(), warning: null };
    const parsed: unknown = JSON.parse(raw);
    if (!validPreferences(parsed)) throw new Error('Invalid preferences');
    return { preferences: parsed, warning: null };
  } catch {
    return {
      preferences: defaultPreferences(),
      warning: 'Saved shortcuts could not be read. Default shortcuts are active.',
    };
  }
}

export function writePreferences(
  preferences: ShortcutPreferences,
  storage?: PreferenceStorage,
): string | null {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(preferences));
    return null;
  } catch {
    return 'Your shortcuts work for this session, but could not be saved on this device.';
  }
}

export function rebindShortcut(
  preferences: ShortcutPreferences,
  action: PlaybackAction,
  code: string,
): { preferences: ShortcutPreferences; error: string | null } {
  if (!ALLOWED_CODES.includes(code))
    return { preferences, error: 'Choose Space, an arrow, or a letter from A to Z.' };
  const conflict = SHORTCUT_ACTIONS.find(
    ({ id }) => id !== action && preferences.bindings[id].code === code,
  );
  if (conflict)
    return {
      preferences,
      error: `${shortcutLabel(code)} is already assigned to ${conflict.label.toLowerCase()}. Choose a different key.`,
    };
  return {
    preferences: { version: 1, bindings: { ...preferences.bindings, [action]: { code } } },
    error: null,
  };
}
