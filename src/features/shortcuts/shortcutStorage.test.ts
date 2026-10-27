import { describe, expect, it, vi } from 'vitest';
import {
  defaultPreferences,
  readPreferences,
  rebindShortcut,
  validPreferences,
  writePreferences,
} from './shortcutStorage';

describe('shortcut preferences', () => {
  it('uses defaults on a fresh device', () => {
    expect(readPreferences({ getItem: () => null, setItem: vi.fn() })).toEqual({
      preferences: defaultPreferences(),
      warning: null,
    });
  });

  it.each([
    '{broken',
    'null',
    '{"version":2}',
    JSON.stringify({ ...defaultPreferences(), version: 2 }),
  ])('recovers from invalid saved data: %s', (raw) => {
    const result = readPreferences({ getItem: () => raw, setItem: vi.fn() });
    expect(result.preferences).toEqual(defaultPreferences());
    expect(result.warning).toBeTruthy();
  });

  it('rejects duplicates and unsupported combinations without changing preferences', () => {
    const previous = defaultPreferences();
    expect(rebindShortcut(previous, 'togglePlayback', 'ArrowLeft').preferences).toBe(previous);
    expect(rebindShortcut(previous, 'togglePlayback', 'ArrowLeft').error).toContain(
      'already assigned',
    );
    expect(rebindShortcut(previous, 'togglePlayback', 'Ctrl+KeyP').error).toBeTruthy();
    const duplicate = {
      ...previous,
      bindings: { ...previous.bindings, togglePlayback: { code: 'ArrowLeft' } },
    };
    expect(validPreferences(duplicate)).toBe(false);
  });

  it('saves and reads a valid custom binding', () => {
    const next = rebindShortcut(defaultPreferences(), 'togglePlayback', 'KeyK').preferences;
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    expect(writePreferences(next, storage)).toBeNull();
    expect(readPreferences(storage).preferences).toEqual(next);
  });

  it('recovers when storage access is blocked and reports failed writes', () => {
    const storage = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Quota');
      },
    };
    expect(readPreferences(storage).preferences).toEqual(defaultPreferences());
    expect(writePreferences(defaultPreferences(), storage)).toContain('this session');
  });
});
