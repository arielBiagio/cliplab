import { useEffect, type RefObject } from 'react';
import type { ShortcutPreferences } from './types';

interface Options {
  scopeRef: RefObject<HTMLElement | null>;
  preferences: ShortcutPreferences;
  suspended: boolean;
  ready: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToggle: () => void;
  onSeek: (delta: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useKeyboardShortcuts({
  scopeRef,
  preferences,
  suspended,
  ready,
  canUndo,
  canRedo,
  onToggle,
  onSeek,
  onUndo,
  onRedo,
}: Options) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        suspended ||
        event.defaultPrevented ||
        event.isComposing ||
        !(target instanceof Element) ||
        !scopeRef.current?.contains(target)
      )
        return;
      if (
        target.closest(
          'input, textarea, select, button, a, [role="button"], [role="slider"], [data-shortcuts-ignore], [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      if (event.altKey) return;
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        const undo = key === 'z' && !event.shiftKey;
        const redo =
          (key === 'z' && event.shiftKey) ||
          (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey);
        if (undo && canUndo) {
          event.preventDefault();
          if (!event.repeat) onUndo();
        }
        if (redo && canRedo) {
          event.preventDefault();
          if (!event.repeat) onRedo();
        }
        return;
      }
      if (!ready || event.shiftKey) return;
      const { bindings } = preferences;
      if (event.code === bindings.togglePlayback.code) {
        event.preventDefault();
        if (!event.repeat) onToggle();
      } else if (event.code === bindings.seekBackward.code) {
        event.preventDefault();
        onSeek(-5);
      } else if (event.code === bindings.seekForward.code) {
        event.preventDefault();
        onSeek(5);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [scopeRef, preferences, suspended, ready, canUndo, canRedo, onToggle, onSeek, onUndo, onRedo]);
}
