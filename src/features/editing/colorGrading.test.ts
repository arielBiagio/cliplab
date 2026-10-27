import { describe, expect, it } from 'vitest';
import { colorGradingGains } from './colorGrading';
import { normalizeAdjustments } from './filters';
import { createHistory, historyReducer } from './historyReducer';
import { DEFAULT_ADJUSTMENTS, findPreset } from './presets';

describe('color grading', () => {
  it.each([-2, -1, 0, 1, 2])('scales linear light by the expected factor at %s EV', (exposure) => {
    const expected = 2 ** exposure;
    expect(colorGradingGains({ exposure, temperature: 0, tint: 0 })).toEqual([
      expected,
      expected,
      expected,
    ]);
  });

  it('warms and cools the image with inverse red and blue gains', () => {
    const warm = colorGradingGains({ exposure: 0, temperature: 100, tint: 0 });
    const cool = colorGradingGains({ exposure: 0, temperature: -100, tint: 0 });
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[0]).toBeLessThan(cool[2]);
    expect(warm[0] * cool[0]).toBeCloseTo(1);
    expect(warm[1]).toBe(1);
    expect(cool[1]).toBe(1);
  });

  it('moves tint toward magenta or green without rotating hue', () => {
    const magenta = colorGradingGains({ exposure: 0, temperature: 0, tint: 100 });
    const green = colorGradingGains({ exposure: 0, temperature: 0, tint: -100 });
    expect(magenta[0]).toBe(magenta[2]);
    expect(magenta[1]).toBeLessThan(magenta[0]);
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[0] * magenta[0]).toBeCloseTo(1);
  });

  it('normalizes independent bounds, decimal exposure and invalid values', () => {
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, exposure: 9, temperature: -999, tint: 999 }),
    ).toMatchObject({ exposure: 2, temperature: -100, tint: 100 });
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, exposure: -9, temperature: 999, tint: -999 }),
    ).toMatchObject({ exposure: -2, temperature: 100, tint: -100 });
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, exposure: 0.30000000000004 }).exposure,
    ).toBe(0.3);
    expect(normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, exposure: 0.16 }).exposure).toBe(0.2);
    expect(
      normalizeAdjustments({
        ...DEFAULT_ADJUSTMENTS,
        exposure: Infinity,
        temperature: NaN,
        tint: -Infinity,
      }),
    ).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it('bounds tonal controls independently and restores neutral values for invalid input', () => {
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, shadows: -999, highlights: 999 }),
    ).toMatchObject({ shadows: -100, highlights: 100 });
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, shadows: 999, highlights: -999 }),
    ).toMatchObject({ shadows: 100, highlights: -100 });
    expect(
      normalizeAdjustments({ ...DEFAULT_ADJUSTMENTS, shadows: NaN, highlights: Infinity }),
    ).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it.each(['exposure', 'temperature', 'tint', 'shadows', 'highlights'] as const)(
    'records isolated %s changes, recognizes Custom and restores them with redo',
    (key) => {
      const adjustments = { ...DEFAULT_ADJUSTMENTS, [key]: key === 'exposure' ? 1.2 : 40 };
      const changed = historyReducer(createHistory(), { type: 'apply', adjustments });
      expect(changed.past).toHaveLength(1);
      expect(findPreset(changed.present.adjustments)).toBeUndefined();
      const undone = historyReducer(changed, { type: 'undo' });
      expect(undone.present.adjustments).toEqual(DEFAULT_ADJUSTMENTS);
      expect(historyReducer(undone, { type: 'redo' }).present.adjustments).toEqual(adjustments);
    },
  );
});
