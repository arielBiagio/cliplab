import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

describe('time labels', () => {
  it.each([
    [0, '00:00'],
    [65.9, '01:05'],
    [3661, '1:01:01'],
    [NaN, '00:00'],
    [-1, '00:00'],
  ])('formats %s as %s', (value, label) => {
    expect(formatTime(value)).toBe(label);
  });
});
