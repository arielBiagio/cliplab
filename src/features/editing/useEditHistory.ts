import { useReducer } from 'react';
import { createHistory, historyReducer } from './historyReducer';

export function useEditHistory() {
  const [history, dispatch] = useReducer(historyReducer, undefined, createHistory);
  return {
    adjustments: (history.draft ?? history.present).adjustments,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dispatch,
  };
}
