import type { LutState } from '../luts/types';
import type { ColorMixerState } from './colorMixer';

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  sepia: number;
  exposure: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
}

export type AdjustmentKey = keyof Adjustments;

export interface EditState {
  adjustments: Adjustments;
  lut: LutState;
  colorMixer: ColorMixerState;
}

export interface EditHistory {
  past: EditState[];
  present: EditState;
  future: EditState[];
  draft: EditState | null;
}

export type PresetId = 'original' | 'cinematic' | 'vintage' | 'blackAndWhite' | 'sepia';

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  adjustments: Readonly<Adjustments>;
}
