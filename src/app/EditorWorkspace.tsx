import { useCallback, useRef, useState } from 'react';
import { EffectsPanel } from '../features/editing/EffectsPanel';
import { useEditHistory } from '../features/editing/useEditHistory';
import { ShortcutSettings } from '../features/shortcuts/ShortcutSettings';
import {
  readPreferences,
  shortcutLabel,
  writePreferences,
} from '../features/shortcuts/shortcutStorage';
import type { ShortcutPreferences } from '../features/shortcuts/types';
import { VideoLoader } from '../features/video/VideoLoader';
import { VideoPlayer } from '../features/video/VideoPlayer';
import { Icon } from '../shared/Icon';

export function EditorWorkspace() {
  const [session, setSession] = useState<{ file: File | null; id: number }>({ file: null, id: 0 });
  const [ready, setReady] = useState(false);
  const [{ preferences, warning }, setPreferences] = useState(readPreferences);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const { adjustments, canUndo, canRedo, dispatch } = useEditHistory();

  const onReady = useCallback((value: boolean) => {
    setReady(value);
    if (value) workspaceRef.current?.focus({ preventScroll: true });
  }, []);
  const onLoad = useCallback(
    (file: File) => {
      setReady(false);
      dispatch({ type: 'clear' });
      setSession((previous) => ({ file, id: previous.id + 1 }));
    },
    [dispatch],
  );
  const onUndo = useCallback(() => dispatch({ type: 'undo' }), [dispatch]);
  const onRedo = useCallback(() => dispatch({ type: 'redo' }), [dispatch]);

  function changePreferences(next: ShortcutPreferences) {
    setPreferences({ preferences: next, warning: writePreferences(next) });
  }

  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to editor
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="play" width="19" height="19" />
          </span>
          <span>
            clip<span className="brand-light">lab</span>
            <span className="brand-period">.</span>
          </span>
        </div>
        <div className="header-actions">
          <div className="history-buttons" role="group" aria-label="Edit history">
            <button
              className="icon-button"
              aria-label="Undo adjustment"
              title="Undo (Ctrl / ⌘ Z)"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Icon name="undo" width="18" height="18" />
            </button>
            <button
              className="icon-button"
              aria-label="Redo adjustment"
              title="Redo (Ctrl / ⌘ Shift Z)"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Icon name="redo" width="18" height="18" />
            </button>
          </div>
          <span className="header-action-divider" aria-hidden="true" />
          <VideoLoader onLoad={onLoad} hasVideo={!!session.file} />
          <button
            className="icon-button shortcuts-button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <Icon name="keyboard" />
          </button>
        </div>
      </header>

      <main ref={workspaceRef} id="workspace" tabIndex={-1} aria-label="Video editing workspace">
        <h1 className="visually-hidden">ClipLab video editor</h1>
        {warning && (
          <p className="storage-warning" role="status">
            <Icon name="info" width="16" height="16" />
            {warning}
          </p>
        )}
        <div className="editor-grid">
          <VideoPlayer
            key={session.id}
            file={session.file}
            adjustments={adjustments}
            onLoad={onLoad}
            onReady={onReady}
            preferences={preferences}
            shortcutsOpen={shortcutsOpen}
            scopeRef={workspaceRef}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
          <EffectsPanel adjustments={adjustments} disabled={!ready} dispatch={dispatch} />
        </div>
      </main>

      <div className="footer-reveal-zone">
        <footer className="app-footer">
          <span className="footer-status">
            <span className="status-dot" />
            {session.file
              ? ready
                ? 'Ready to experiment'
                : 'Preparing your workspace'
              : 'All set for your first take'}
          </span>
          <button
            className="footer-shortcuts"
            onClick={() => setShortcutsOpen(true)}
            aria-label="View keyboard shortcuts"
          >
            <span>
              <kbd>{shortcutLabel(preferences.bindings.togglePlayback.code)}</kbd> Play / pause
            </span>
            <span>
              <kbd>{shortcutLabel(preferences.bindings.seekBackward.code)}</kbd>
              <kbd>{shortcutLabel(preferences.bindings.seekForward.code)}</kbd> Seek 5s
            </span>
            <Icon name="keyboard" width="16" height="16" />
          </button>
          <span className="footer-version">CLIPLAB / V1.0</span>
        </footer>
      </div>
      {shortcutsOpen && (
        <ShortcutSettings
          preferences={preferences}
          warning={warning}
          onChange={changePreferences}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </div>
  );
}
