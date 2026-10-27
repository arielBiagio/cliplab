import { normalizeAdjustments } from './filters';
import { DEFAULT_ADJUSTMENTS, equalAdjustments } from './presets';
import type { Adjustments, EditHistory, EditState } from './types';

export const HISTORY_LIMIT = 100;

export type HistoryAction =
  | { type: 'preview'; adjustments: Adjustments }
  | { type: 'apply'; adjustments: Readonly<Adjustments> }
  | { type: 'commit' | 'cancel' | 'undo' | 'redo' | 'clear' };

export function createHistory(): EditHistory {
  return {
    past: [],
    present: { adjustments: { ...DEFAULT_ADJUSTMENTS } },
    future: [],
    draft: null,
  };
}

function commit(state: EditHistory, next: EditState): EditHistory {
  if (equalAdjustments(state.present.adjustments, next.adjustments))
    return { ...state, draft: null };
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    draft: null,
  };
}

export function historyReducer(state: EditHistory, action: HistoryAction): EditHistory {
  switch (action.type) {
    case 'preview':
      return { ...state, draft: { adjustments: normalizeAdjustments(action.adjustments) } };
    case 'apply':
      return commit(state, { adjustments: normalizeAdjustments(action.adjustments) });
    case 'commit':
      return state.draft ? commit(state, state.draft) : state;
    case 'cancel':
      return { ...state, draft: null };
    case 'undo': {
      const previous = state.past.at(-1);
      return previous
        ? {
            past: state.past.slice(0, -1),
            present: previous,
            future: [state.present, ...state.future],
            draft: null,
          }
        : { ...state, draft: null };
    }
    case 'redo': {
      const next = state.future[0];
      return next
        ? {
            past: [...state.past, state.present].slice(-HISTORY_LIMIT),
            present: next,
            future: state.future.slice(1),
            draft: null,
          }
        : { ...state, draft: null };
    }
    case 'clear':
      return createHistory();
  }
}
