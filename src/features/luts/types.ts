export type Rgb = readonly [number, number, number];

export interface CubeLut {
  readonly name: string;
  readonly fileName?: string;
  readonly size: number;
  readonly domainMin: Rgb;
  readonly domainMax: Rgb;
  // Imported once and treated as immutable. History shares this buffer by reference.
  readonly data: Float32Array;
}

export interface LutState {
  readonly source: CubeLut | null;
  readonly intensity: number;
  readonly enabled: boolean;
}

export const DEFAULT_LUT_STATE: LutState = { source: null, intensity: 100, enabled: true };
