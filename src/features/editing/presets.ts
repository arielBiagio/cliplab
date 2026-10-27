import type { Adjustments, Preset } from './types';

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  sepia: 0,
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'original',
    label: 'Original',
    description: 'Just as you shot it',
    adjustments: DEFAULT_ADJUSTMENTS,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'A little more drama',
    adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 105, contrast: 115, saturation: 85 },
  },
  {
    id: 'vintage',
    label: 'Vintage',
    description: 'Soft and nostalgic',
    adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 110, contrast: 85, saturation: 70 },
  },
  {
    id: 'blackAndWhite',
    label: 'Black & White',
    description: 'Less color. More feeling.',
    adjustments: { ...DEFAULT_ADJUSTMENTS, contrast: 110, saturation: 0 },
  },
  {
    id: 'sepia',
    label: 'Sepia',
    description: 'Warm and timeless',
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      brightness: 105,
      contrast: 95,
      saturation: 60,
      sepia: 75,
    },
  },
];

export function equalAdjustments(a: Readonly<Adjustments>, b: Readonly<Adjustments>): boolean {
  return (
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.hue === b.hue &&
    a.sepia === b.sepia
  );
}

export function findPreset(adjustments: Adjustments): Preset | undefined {
  return PRESETS.find((preset) => equalAdjustments(preset.adjustments, adjustments));
}
