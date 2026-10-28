import { describe, expect, it } from 'vitest';
import {
  createHistory,
  historyReducer,
  HISTORY_LIMIT,
  HISTORY_LUT_BYTES,
} from '../editing/historyReducer';
import { PRESETS } from '../editing/presets';
import { DEFAULT_LUT_STATE, type CubeLut } from './types';

const source: CubeLut = {
  name: 'Test',
  size: 2,
  domainMin: [0, 0, 0],
  domainMax: [1, 1, 1],
  data: new Float32Array(24),
};

describe('LUT history', () => {
  it('preserves intensity when switching between loaded LUTs, with undo restoring both', () => {
    let history = historyReducer(createHistory(), { type: 'selectLut', source });
    history = historyReducer(history, { type: 'previewLutIntensity', intensity: 35 });
    history = historyReducer(history, { type: 'commit' });
    const other = { ...source, name: 'Other' };
    const switched = historyReducer(history, {
      type: 'selectLut',
      source: other,
      preserveIntensity: true,
    });
    expect(switched.present.lut).toMatchObject({ source: other, intensity: 35, enabled: true });
    expect(historyReducer(switched, { type: 'undo' }).present).toEqual(history.present);
  });
  it('evicts the oldest undo steps when distinct large LUTs exceed the memory budget', () => {
    let history = createHistory();
    for (let index = 0; index < 22; index++) {
      history = historyReducer(history, {
        type: 'selectLut',
        source: { ...source, name: `LUT ${index}`, size: 65, data: new Float32Array(65 ** 3 * 3) },
      });
    }
    const tables = new Set([...history.past, history.present].map((edit) => edit.lut.source!.data));
    expect([...tables].reduce((bytes, table) => bytes + table.byteLength, 0)).toBeLessThanOrEqual(
      HISTORY_LUT_BYTES,
    );
    expect(history.present.lut.source?.name).toBe('LUT 21');
    expect(history.past[0].lut.source?.name).toBe('LUT 2');
    expect(history.past).toHaveLength(19);
    for (let index = 0; index < 19; index++) history = historyReducer(history, { type: 'undo' });
    expect(history.present.lut.source?.name).toBe('LUT 2');
    expect(history.past).toHaveLength(0);
    for (let index = 0; index < 19; index++) history = historyReducer(history, { type: 'redo' });
    expect(history.present.lut.source?.name).toBe('LUT 21');
  });

  it('counts shared tables once and retains 100 edits of the same large LUT', () => {
    const large = { ...source, size: 65, data: new Float32Array(65 ** 3 * 3) };
    let history = historyReducer(createHistory(), { type: 'selectLut', source: large });
    for (let index = 0; index < 110; index++)
      history = historyReducer(history, { type: 'toggleLut' });
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.present.lut.source?.data).toBe(large.data);
    expect(history.past.every((edit) => edit.lut.source?.data === large.data)).toBe(true);
  });

  it('shares imported data and groups an intensity gesture without changing other edits', () => {
    let history = historyReducer(createHistory(), { type: 'selectLut', source });
    for (const intensity of [90, 70, 30])
      history = historyReducer(history, { type: 'previewLutIntensity', intensity });
    expect(history.past.length).toBe(1);
    expect(history.draft?.lut.intensity).toBe(30);
    history = historyReducer(history, { type: 'commit' });
    expect(history.past.length).toBe(2);
    expect(history.present.lut.source).toBe(source);
    expect(history.past[1].lut.source?.data).toBe(source.data);
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.lut.intensity).toBe(100);
    expect(historyReducer(history, { type: 'redo' }).present.lut.intensity).toBe(30);
  });

  it('undoes replacement, removal and toggling as complete edits', () => {
    let history = historyReducer(createHistory(), { type: 'selectLut', source });
    history = historyReducer(history, { type: 'toggleLut' });
    expect(history.present.lut.enabled).toBe(false);
    history = historyReducer(history, { type: 'selectLut', source: { ...source, name: 'Other' } });
    expect(history.present.lut).toMatchObject({ enabled: true, intensity: 100 });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.lut.source).toBe(source);
    expect(history.present.lut.enabled).toBe(false);
    const removed = historyReducer(history, { type: 'removeLut' });
    expect(removed.present.lut).toEqual(DEFAULT_LUT_STATE);
    expect(historyReducer(removed, { type: 'undo' }).present).toBe(history.present);
    expect(historyReducer(history, { type: 'clear' })).toEqual(createHistory());
  });

  it('resets only adjustments while preserving the LUT, intensity and bypass state', () => {
    let history = historyReducer(createHistory(), { type: 'selectLut', source });
    history = historyReducer(history, { type: 'previewLutIntensity', intensity: 35 });
    history = historyReducer(history, { type: 'commit' });
    history = historyReducer(history, { type: 'toggleLut' });
    history = historyReducer(history, { type: 'apply', adjustments: PRESETS[1].adjustments });
    expect(history.present.lut.source).toBe(source);
    const reset = historyReducer(history, { type: 'reset' });
    expect(reset.present.adjustments).toEqual(createHistory().present.adjustments);
    expect(reset.present.lut).toBe(history.present.lut);
    expect(reset.present.lut).toEqual({ source, intensity: 35, enabled: false });
    expect(historyReducer(reset, { type: 'undo' }).present).toBe(history.present);
    expect(historyReducer(reset, { type: 'reset' }).past).toHaveLength(reset.past.length);
  });

  it('normalizes intensity, cancels drafts and preserves redo for no-ops', () => {
    let history = historyReducer(createHistory(), { type: 'selectLut', source });
    history = historyReducer(history, { type: 'previewLutIntensity', intensity: -999 });
    expect(history.draft?.lut.intensity).toBe(0);
    history = historyReducer(history, { type: 'cancel' });
    history = historyReducer(history, { type: 'previewLutIntensity', intensity: Infinity });
    expect(history.draft?.lut.intensity).toBe(100);
    history = historyReducer(history, { type: 'commit' });
    expect(history.past.length).toBe(1);
    history = historyReducer(history, { type: 'removeLut' });
    history = historyReducer(history, { type: 'undo' });
    const noOp = historyReducer(history, { type: 'selectLut', source });
    expect(noOp.future.length).toBe(1);
    const changed = historyReducer(history, { type: 'toggleLut' });
    expect(changed.future.length).toBe(0);
  });
});
