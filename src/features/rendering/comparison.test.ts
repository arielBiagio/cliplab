import { describe, expect, it } from 'vitest';
import { getContainBounds, normalizeComparisonSplit } from './comparison';

describe('comparison geometry', () => {
  it('aligns a landscape image inside top and bottom bars', () => {
    expect(getContainBounds(800, 600, 1920, 1080)).toEqual({
      width: 800,
      height: 450,
      left: 0,
      top: 75,
    });
  });

  it('aligns a portrait image inside side bars', () => {
    expect(getContainBounds(800, 600, 1080, 1920)).toEqual({
      width: 337.5,
      height: 600,
      left: 231.25,
      top: 0,
    });
  });

  it('preserves the centered image when resizing and accepts fractional layout dimensions', () => {
    const large = getContainBounds(800, 600, 1080, 1920)!;
    const small = getContainBounds(400, 300, 1080, 1920)!;
    expect(small.width).toBe(large.width / 2);
    expect(small.left).toBe(large.left / 2);
    expect(getContainBounds(800.5, 600, 1920, 1080)?.width).toBeCloseTo(800.5);
  });

  it.each([0, -10, NaN, Infinity])(
    'waits for valid dimensions instead of using %s',
    (dimension) => {
      expect(getContainBounds(800, 600, dimension, 1080)).toBeNull();
      expect(getContainBounds(dimension, 600, 1920, 1080)).toBeNull();
    },
  );

  it.each([
    [-20, 0],
    [120, 100],
    [25.6, 26],
    [NaN, 50],
  ])('normalizes the split %s to %s', (input, output) => {
    expect(normalizeComparisonSplit(input)).toBe(output);
  });
});
