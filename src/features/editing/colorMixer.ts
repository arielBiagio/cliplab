import { clampAdjustment } from './filters';

// Keep this order aligned with the hue centers in the fragment shader.
export const COLOR_BANDS = [
  { id: 'red', label: 'Red', swatch: '#ed6262' },
  { id: 'orange', label: 'Orange', swatch: '#f1a452' },
  { id: 'yellow', label: 'Yellow', swatch: '#e9d85f' },
  { id: 'green', label: 'Green', swatch: '#73c775' },
  { id: 'aqua', label: 'Aqua', swatch: '#68c9c5' },
  { id: 'blue', label: 'Blue', swatch: '#6b97eb' },
  { id: 'purple', label: 'Purple', swatch: '#a78aeb' },
  { id: 'magenta', label: 'Magenta', swatch: '#df80c8' },
] as const;

export type ColorBand = (typeof COLOR_BANDS)[number]['id'];
export interface ColorBandAdjustments {
  hue: number;
  saturation: number;
  luminance: number;
}
export type ColorMixerState = Readonly<Record<ColorBand, Readonly<ColorBandAdjustments>>>;
export const NEUTRAL_COLOR_BAND: Readonly<ColorBandAdjustments> = Object.freeze({
  hue: 0,
  saturation: 0,
  luminance: 0,
});
export const DEFAULT_COLOR_MIXER: ColorMixerState = Object.freeze(
  Object.fromEntries(COLOR_BANDS.map(({ id }) => [id, NEUTRAL_COLOR_BAND])) as Record<
    ColorBand,
    Readonly<ColorBandAdjustments>
  >,
);

export function normalizeColorBand(values: Readonly<ColorBandAdjustments>): ColorBandAdjustments {
  return {
    hue: clampAdjustment(values.hue, -30, 30, 0),
    saturation: clampAdjustment(values.saturation, -100, 100, 0),
    luminance: clampAdjustment(values.luminance, -100, 100, 0),
  };
}

export function equalColorMixers(left: ColorMixerState, right: ColorMixerState): boolean {
  return COLOR_BANDS.every(({ id }) =>
    (['hue', 'saturation', 'luminance'] as const).every((key) => left[id][key] === right[id][key]),
  );
}

export function changedColorBands(values: ColorMixerState): number {
  return COLOR_BANDS.filter(({ id }) => Object.values(values[id]).some((value) => value !== 0))
    .length;
}

export function colorMixerUniforms(values: ColorMixerState): Float32Array {
  return new Float32Array(
    COLOR_BANDS.flatMap(({ id }) => {
      const band = normalizeColorBand(values[id]);
      return [band.hue / 360, band.saturation / 100, band.luminance / 100];
    }),
  );
}
