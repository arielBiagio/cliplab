import { useReducer } from 'react';
import { createHistory, historyReducer } from './historyReducer';

export function useEditHistory() {
  const [history, dispatch] = useReducer(historyReducer, undefined, createHistory);
  return {
    committedEdit: history.present,
    adjustments: (history.draft ?? history.present).adjustments,
    lut: (history.draft ?? history.present).lut,
    colorMixer: (history.draft ?? history.present).colorMixer,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dispatch,
  };
}
