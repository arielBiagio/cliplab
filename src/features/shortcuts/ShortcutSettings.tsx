import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon';
import {
  ALLOWED_CODES,
  defaultPreferences,
  rebindShortcut,
  shortcutLabel,
  SHORTCUT_ACTIONS,
} from './shortcutStorage';
import type { PlaybackAction, ShortcutPreferences } from './types';

interface Props {
  preferences: ShortcutPreferences;
  warning: string | null;
  onChange: (preferences: ShortcutPreferences) => void;
  onClose: () => void;
}

export function ShortcutSettings({ preferences, warning, onChange, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function change(action: PlaybackAction, code: string) {
    const result = rebindShortcut(preferences, action, code);
    setError(result.error);
    if (!result.error) onChange(result.preferences);
  }

  return (
    <dialog
      ref={dialogRef}
      className="shortcuts-dialog"
      aria-labelledby="shortcuts-title"
      aria-describedby="shortcuts-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled])',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      }}
    >
      <div className="dialog-heading">
        <div className="dialog-icon">
          <Icon name="keyboard" />
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close keyboard shortcuts">
          <Icon name="close" />
        </button>
      </div>
      <span className="eyebrow">MAKE YOURSELF AT HOME</span>
      <h2 id="shortcuts-title">Your keys. Your rhythm.</h2>
      <p id="shortcuts-description">
        Pick a key for each playback action. Shortcuts work when the workspace has focus.
      </p>
      <div className="shortcut-fields">
        {SHORTCUT_ACTIONS.map(({ id, label }) => (
          <div className="shortcut-field" key={id}>
            <label htmlFor={`shortcut-${id}`}>{label}</label>
            <select
              id={`shortcut-${id}`}
              value={preferences.bindings[id].code}
              onChange={(event) => change(id, event.target.value)}
            >
              {ALLOWED_CODES.map((code) => (
                <option key={code} value={code}>
                  {shortcutLabel(code)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {warning && (
        <p className="inline-error" role="status">
          {warning}
        </p>
      )}
      <div className="fixed-shortcuts">
        <div>
          <span>Undo</span>
          <kbd>Ctrl / ⌘ Z</kbd>
        </div>
        <div>
          <span>Redo</span>
          <kbd>Ctrl / ⌘ Shift Z</kbd>
        </div>
        <p>
          Letters use their physical keyboard positions. These editing shortcuts stay fixed. Ctrl Y
          also redoes.
        </p>
      </div>
      <div className="dialog-footer">
        <button
          className="text-button"
          onClick={() => {
            setError(null);
            onChange(defaultPreferences());
          }}
        >
          Restore defaults
        </button>
        <button className="import-button" onClick={onClose}>
          Done
          <Icon name="check" width="16" height="16" />
        </button>
      </div>
    </dialog>
  );
}
