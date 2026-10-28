import { clampAdjustment, normalizeAdjustments } from './filters';
import { DEFAULT_LUT_STATE, type CubeLut } from '../luts/types';
import { DEFAULT_ADJUSTMENTS, equalAdjustments } from './presets';
import type { Adjustments, EditHistory, EditState } from './types';
import { ADJUSTMENT_GROUPS, type AdjustmentGroupId } from './adjustmentGroups';
import {
  DEFAULT_COLOR_MIXER,
  NEUTRAL_COLOR_BAND,
  equalColorMixers,
  normalizeColorBand,
  type ColorBand,
  type ColorBandAdjustments,
} from './colorMixer';

export const HISTORY_LIMIT = 100;
export const HISTORY_LUT_BYTES = 64 * 1024 * 1024;

export type HistoryAction =
  | { type: 'restore'; edit: EditState }
  | { type: 'preview'; adjustments: Adjustments }
  | { type: 'apply'; adjustments: Readonly<Adjustments> }
  | { type: 'selectLut'; source: CubeLut; preserveIntensity?: boolean }
  | { type: 'previewLutIntensity'; intensity: number }
  | { type: 'previewColorMixer'; band: ColorBand; key: keyof ColorBandAdjustments; value: number }
  | { type: 'resetColorBand'; band: ColorBand }
  | { type: 'resetAdjustmentGroup'; group: AdjustmentGroupId }
  | { type: 'resetColorMixer' }
  | { type: 'commit' | 'cancel' | 'undo' | 'redo' | 'clear' | 'reset' | 'removeLut' | 'toggleLut' };

export function createHistory(): EditHistory {
  return {
    past: [],
    present: {
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      lut: DEFAULT_LUT_STATE,
      colorMixer: DEFAULT_COLOR_MIXER,
    },
    future: [],
    draft: null,
  };
}

function trimPast(past: EditState[], present: EditState): EditState[] {
  const currentData = present.lut.source?.data;
  const seen = new Set(currentData ? [currentData] : []);
  let bytes = currentData?.byteLength ?? 0;
  let start = past.length;
  while (start > 0 && past.length - start < HISTORY_LIMIT) {
    const data = past[start - 1].lut.source?.data;
    if (data && !seen.has(data)) {
      if (bytes + data.byteLength > HISTORY_LUT_BYTES) break;
      seen.add(data);
      bytes += data.byteLength;
    }
    start--;
  }
  return past.slice(start);
}

function commit(state: EditHistory, next: EditState): EditHistory {
  if (
    equalAdjustments(state.present.adjustments, next.adjustments) &&
    equalColorMixers(state.present.colorMixer, next.colorMixer) &&
    state.present.lut.source === next.lut.source &&
    state.present.lut.intensity === next.lut.intensity &&
    state.present.lut.enabled === next.lut.enabled
  )
    return { ...state, draft: null };
  return {
    past: trimPast([...state.past, state.present], next),
    present: next,
    future: [],
    draft: null,
  };
}

export function historyReducer(state: EditHistory, action: HistoryAction): EditHistory {
  switch (action.type) {
    case 'restore':
      return { ...createHistory(), present: action.edit };
    case 'resetAdjustmentGroup': {
      const adjustments = { ...state.present.adjustments };
      const group = ADJUSTMENT_GROUPS.find(({ id }) => id === action.group)!;
      for (const key of group.keys) adjustments[key] = DEFAULT_ADJUSTMENTS[key];
      return commit(state, { ...state.present, adjustments });
    }
    case 'resetColorMixer':
      return commit(state, { ...state.present, colorMixer: DEFAULT_COLOR_MIXER });
    case 'previewColorMixer': {
      const current = state.draft ?? state.present;
      return {
        ...state,
        draft: {
          ...current,
          colorMixer: {
            ...current.colorMixer,
            [action.band]: normalizeColorBand({
              ...current.colorMixer[action.band],
              [action.key]: action.value,
            }),
          },
        },
      };
    }
    case 'resetColorBand':
      return commit(state, {
        ...state.present,
        colorMixer: { ...state.present.colorMixer, [action.band]: NEUTRAL_COLOR_BAND },
      });
    case 'preview':
      return {
        ...state,
        draft: {
          ...(state.draft ?? state.present),
          adjustments: normalizeAdjustments(action.adjustments),
        },
      };
    case 'apply':
      return commit(state, {
        ...state.present,
        adjustments: normalizeAdjustments(action.adjustments),
      });
    case 'selectLut':
      return commit(state, {
        ...state.present,
        lut: {
          source: action.source,
          intensity: action.preserveIntensity ? state.present.lut.intensity : 100,
          enabled: true,
        },
      });
    case 'previewLutIntensity': {
      const current = state.draft ?? state.present;
      if (!current.lut.source) return state;
      return {
        ...state,
        draft: {
          ...current,
          lut: { ...current.lut, intensity: clampAdjustment(action.intensity, 0, 100, 100) },
        },
      };
    }
    case 'removeLut':
      return commit(state, { ...state.present, lut: DEFAULT_LUT_STATE });
    case 'toggleLut':
      return state.present.lut.source
        ? commit(state, {
            ...state.present,
            lut: { ...state.present.lut, enabled: !state.present.lut.enabled },
          })
        : state;
    case 'reset':
      return commit(state, {
        ...state.present,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        colorMixer: DEFAULT_COLOR_MIXER,
      });
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
