import { describe, expect, it } from 'vitest';
import { buildFilter, clampAdjustment, normalizeAdjustments } from './filters';
import { createHistory, historyReducer, HISTORY_LIMIT } from './historyReducer';
import { DEFAULT_ADJUSTMENTS, findPreset, PRESETS } from './presets';

describe('adjustments and presets', () => {
  it.each([
    [-1, 0],
    [201, 200],
    [134.6, 135],
    [NaN, 100],
    [Infinity, 100],
  ])('normalizes %s to %s', (value, expected) => {
    expect(clampAdjustment(value)).toBe(expected);
  });

  it.each(PRESETS)('applies the complete $label preset and produces a stable filter', (preset) => {
    const history = historyReducer(createHistory(), {
      type: 'apply',
      adjustments: preset.adjustments,
    });
    expect(history.present.adjustments).toEqual(preset.adjustments);
    expect(findPreset(history.present.adjustments)?.id).toBe(preset.id);
    expect(buildFilter(preset.adjustments)).toBe(
      `brightness(${preset.adjustments.brightness}%) contrast(${preset.adjustments.contrast}%) saturate(${preset.adjustments.saturation}%) sepia(${preset.adjustments.sepia}%) hue-rotate(${preset.adjustments.hue}deg)`,
    );
  });

  it('derives a custom look from unmatched values', () => {
    expect(findPreset({ ...DEFAULT_ADJUSTMENTS, brightness: 101 })).toBeUndefined();
  });

  it('bounds hue and sepia independently and restores their neutral values for invalid input', () => {
    expect(normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, hue: -999, sepia: 999 })).toMatchObject({
      hue: -180,
      sepia: 100,
    });
    expect(normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, hue: 999, sepia: -10 })).toMatchObject({
      hue: 180,
      sepia: 0,
    });
    expect(normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, hue: NaN, sepia: Infinity })).toEqual(
      DEFAULT_ADJUSTMENTS,
    );
  });

  it.each(['hue', 'sepia'] as const)(
    'records a change in only %s and can undo and redo it',
    (key) => {
      const adjustments = { ...DEFAULT_ADJUSTMENTS, [key]: 40 };
      const changed = historyReducer(createHistory(), { type: 'apply', adjustments });
      expect(changed.past).toHaveLength(1);
      expect(findPreset(changed.present.adjustments)).toBeUndefined();
      const undone = historyReducer(changed, { type: 'undo' });
      expect(undone.present.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
      expect(historyReducer(undone, { type: 'redo' }).present.adjustments).toEqual(adjustments);
    },
  );
});

describe('edit history', () => {
  const edit = { ...DEFAULT_ADJUSTMENTS, brightness: 140, contrast: 95, saturation: 70 };

  it('previews many values and records only one committed gesture', () => {
    let history = createHistory();
    for (let brightness = 101; brightness <= 140; brightness++)
      history = historyReducer(history, { type: 'preview', adjustments: { ...edit, brightness } });
    expect(history.past).toHaveLength(0);
    expect(history.present.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
    expect(history.draft?.adjustments).toEqual(edit);
    history = historyReducer(history, { type: 'commit' });
    expect(history.past).toHaveLength(1);
    expect(history.present.adjustments).toEqual(edit);
    expect(history.draft).toBeNull();
  });

  it('cancels a gesture without changing confirmed history', () => {
    const original = createHistory();
    const preview = historyReducer(original, { type: 'preview', adjustments: edit });
    expect(historyReducer(preview, { type: 'cancel' })).toEqual(original);
  });

  it('undoes and redoes complete snapshots without mutating the initial state', () => {
    const initial = createHistory();
    const changed = historyReducer(initial, { type: 'apply', adjustments: edit });
    const undone = historyReducer(changed, { type: 'undo' });
    expect(undone.present.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
    expect(historyReducer(undone, { type: 'redo' }).present.adjustments).toEqual(edit);
    expect(initial).toEqual(createHistory());
  });

  it('discards a draft before undo and redo', () => {
    let history = historyReducer(createHistory(), { type: 'apply', adjustments: edit });
    history = historyReducer(history, {
      type: 'preview',
      adjustments: { ...edit, brightness: 170 },
    });
    history = historyReducer(history, { type: 'undo' });
    expect(history.draft).toBeNull();
    expect(historyReducer(history, { type: 'redo' }).present.adjustments).toEqual(edit);
  });

  it('ignores no-ops and preserves redo until a real edit is committed', () => {
    let history = historyReducer(createHistory(), { type: 'apply', adjustments: edit });
    history = historyReducer(history, { type: 'undo' });
    history = historyReducer(history, { type: 'apply', adjustments: DEFAULT_ADJUSTMENTS });
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(1);
    history = historyReducer(history, { type: 'preview', adjustments: edit });
    expect(history.future).toHaveLength(1);
    history = historyReducer(history, { type: 'commit' });
    expect(history.future).toHaveLength(0);
  });

  it('resets as an undoable operation and clears all history for a new session', () => {
    let history = historyReducer(createHistory(), { type: 'apply', adjustments: edit });
    history = historyReducer(history, { type: 'apply', adjustments: DEFAULT_ADJUSTMENTS });
    expect(historyReducer(history, { type: 'undo' }).present.adjustments).toEqual(edit);
    expect(historyReducer(history, { type: 'clear' })).toEqual(createHistory());
  });

  it('bounds history and handles empty undo / redo', () => {
    let history = createHistory();
    expect(historyReducer(history, { type: 'undo' })).toEqual(history);
    expect(historyReducer(history, { type: 'redo' })).toEqual(history);
    for (let i = 0; i < 130; i++)
      history = historyReducer(history, { type: 'apply', adjustments: { ...edit, brightness: i } });
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });
});
