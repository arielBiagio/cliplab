import type { Adjustments } from './types';

// Relative creative controls, applied to linear-light RGB before the legacy effects.
export function colorGradingGains(
  values: Readonly<Pick<Adjustments, 'exposure' | 'temperature' | 'tint'>>,
): readonly [number, number, number] {
  const temperature = values.temperature / 100;
  const tint = values.tint / 100;
  return [
    2 ** (values.exposure + 0.5 * temperature + 0.25 * tint),
    2 ** (values.exposure - 0.5 * tint),
    2 ** (values.exposure - 0.5 * temperature + 0.25 * tint),
  ];
}
