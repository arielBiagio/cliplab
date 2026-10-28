import { Icon } from '../../shared/Icon';
import type { SavePhase } from './useSessionPersistence';

interface Props {
  phase: SavePhase;
  hasSaved: boolean;
  hasVideo: boolean;
  onClear: () => void;
  onSave: () => void;
}
const labels: Record<SavePhase, string> = {
  restoring: 'Restoring session…',
  idle: 'No saved session',
  saving: 'Saving locally…',
  saved: 'Saved locally',
  unsaved: 'Not saved',
  clearing: 'Clearing saved session…',
  error: 'Not saved',
};

export function SessionStatus({ phase, hasSaved, hasVideo, onClear, onSave }: Props) {
  if (phase === 'idle') return null;
  const retry = hasVideo && (phase === 'unsaved' || phase === 'error');
  return (
    <div className="session-storage" data-save-state={phase}>
      <span className="session-save-status" role="status" title={labels[phase]}>
        <span className="status-dot" aria-hidden="true" />
        <span className="session-save-label">{labels[phase]}</span>
      </span>
      {retry && (
        <button
          type="button"
          className="icon-button session-storage-button"
          aria-label="Save session"
          title="Save session on this device"
          onClick={onSave}
        >
          <Icon name="lock" width="14" height="14" />
        </button>
      )}
      {hasSaved && (
        <button
          type="button"
          className="icon-button session-storage-button"
          aria-label="Clear saved session"
          title="Clear saved session; keep current work open"
          disabled={phase === 'restoring' || phase === 'clearing'}
          onClick={onClear}
        >
          <Icon name="close" width="14" height="14" />
        </button>
      )}
    </div>
  );
}
