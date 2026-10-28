import { describe, expect, it } from 'vitest';
import {
  COLOR_BANDS,
  DEFAULT_COLOR_MIXER,
  changedColorBands,
  colorMixerUniforms,
  normalizeColorBand,
} from './colorMixer';
import { createHistory, historyReducer } from './historyReducer';
import { PRESETS } from './presets';
import { parseCube } from '../luts/parseCube';

describe('color mixer state', () => {
  it('starts with eight neutral bands and normalizes out-of-range and invalid values', () => {
    expect(COLOR_BANDS).toHaveLength(8);
    expect(changedColorBands(DEFAULT_COLOR_MIXER)).toBe(0);
    expect(normalizeColorBand({ hue: 999, saturation: -999, luminance: NaN })).toEqual({
      hue: 30,
      saturation: -100,
      luminance: 0,
    });
    expect(normalizeColorBand({ hue: -999, saturation: Infinity, luminance: 999 })).toEqual({
      hue: -30,
      saturation: 0,
      luminance: 100,
    });
  });

  it('keeps GPU bands in their declared hue order and expresses hue as a fraction of a turn', () => {
    const values = { ...DEFAULT_COLOR_MIXER, orange: { hue: 30, saturation: -50, luminance: 25 } };
    const uniforms = colorMixerUniforms(values);
    expect(uniforms).toHaveLength(24);
    expect(uniforms[3]).toBeCloseTo(1 / 12);
    expect(Array.from(uniforms.slice(4, 6))).toEqual([-0.5, 0.25]);
    expect(Array.from(uniforms.slice(6))).toEqual(Array(18).fill(0));
  });

  it('groups a gesture into one undo step, cancels drafts and retains independent colors', () => {
    const initial = createHistory();
    let state = initial;
    for (const value of [-10, -30, -60])
      state = historyReducer(state, {
        type: 'previewColorMixer',
        band: 'green',
        key: 'saturation',
        value,
      });
    expect(state.past).toHaveLength(0);
    expect(state.draft?.colorMixer.green.saturation).toBe(-60);
    expect(historyReducer(state, { type: 'cancel' })).toEqual(initial);
    state = historyReducer(state, { type: 'commit' });
    expect(state.past).toHaveLength(1);
    state = historyReducer(state, {
      type: 'previewColorMixer',
      band: 'blue',
      key: 'luminance',
      value: 20,
    });
    state = historyReducer(state, { type: 'commit' });
    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.present.colorMixer.green.saturation).toBe(-60);
    expect(undone.present.colorMixer.blue.luminance).toBe(0);
    expect(historyReducer(undone, { type: 'redo' }).present).toEqual(state.present);
    expect(initial).toEqual(createHistory());
  });

  it('resets one color independently and resets all adjustments while preserving the LUT', () => {
    const source = parseCube('LUT_3D_SIZE 2\n' + '0 0 0\n'.repeat(8), 'test.cube');
    let state = historyReducer(createHistory(), { type: 'selectLut', source });
    state = historyReducer(state, { type: 'previewLutIntensity', intensity: 35 });
    state = historyReducer(state, { type: 'commit' });
    state = historyReducer(state, { type: 'toggleLut' });
    for (const band of ['green', 'blue'] as const) {
      state = historyReducer(state, { type: 'previewColorMixer', band, key: 'hue', value: 15 });
      state = historyReducer(state, { type: 'commit' });
    }
    state = historyReducer(state, { type: 'apply', adjustments: PRESETS[1].adjustments });
    expect(changedColorBands(state.present.colorMixer)).toBe(2);
    const one = historyReducer(state, { type: 'resetColorBand', band: 'green' });
    expect(one.present.colorMixer.green.hue).toBe(0);
    expect(one.present.colorMixer.blue.hue).toBe(15);
    expect(historyReducer(one, { type: 'undo' }).present).toBe(state.present);
    const reset = historyReducer(state, { type: 'reset' });
    expect(reset.present.colorMixer).toEqual(DEFAULT_COLOR_MIXER);
    expect(reset.present.adjustments).toEqual(createHistory().present.adjustments);
    expect(reset.present.lut).toBe(state.present.lut);
    expect(historyReducer(reset, { type: 'undo' }).present).toBe(state.present);
    expect(historyReducer(reset, { type: 'clear' })).toEqual(createHistory());
  });

  it('ignores neutral edits and preserves redo until a real mixer edit is committed', () => {
    let state = historyReducer(createHistory(), {
      type: 'apply',
      adjustments: PRESETS[1].adjustments,
    });
    state = historyReducer(state, { type: 'undo' });
    state = historyReducer(state, { type: 'previewColorMixer', band: 'red', key: 'hue', value: 0 });
    state = historyReducer(state, { type: 'commit' });
    expect(state.future).toHaveLength(1);
    state = historyReducer(state, { type: 'resetColorBand', band: 'red' });
    expect(state.future).toHaveLength(1);
    state = historyReducer(state, {
      type: 'previewColorMixer',
      band: 'red',
      key: 'hue',
      value: 10,
    });
    state = historyReducer(state, { type: 'commit' });
    expect(state.future).toHaveLength(0);
  });
});
