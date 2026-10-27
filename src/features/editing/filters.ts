import type { Adjustments } from './types';

export function clampAdjustment(value: number, min = 0, max = 200, neutral = 100): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : neutral;
}

export function normalizeAdjustments(values: Adjustments): Adjustments {
  return {
    brightness: clampAdjustment(values.brightness),
    contrast: clampAdjustment(values.contrast),
    saturation: clampAdjustment(values.saturation),
    hue: clampAdjustment(values.hue, -180, 180, 0),
    sepia: clampAdjustment(values.sepia, 0, 100, 0),
  };
}

export function buildFilter(values: Readonly<Adjustments>): string {
  return [
    `brightness(${values.brightness}%)`,
    `contrast(${values.contrast}%)`,
    `saturate(${values.saturation}%)`,
    `sepia(${values.sepia}%)`,
    `hue-rotate(${values.hue}deg)`,
  ].join(' ');
}
