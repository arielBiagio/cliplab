export const ADJUSTMENT_GROUPS = [
  {
    id: 'light',
    label: 'Light',
    icon: 'sun',
    keys: ['exposure', 'brightness', 'contrast', 'shadows', 'highlights'],
  },
  {
    id: 'color',
    label: 'Color',
    icon: 'drop',
    keys: ['temperature', 'tint', 'saturation', 'hue', 'sepia'],
  },
] as const;

export type AdjustmentGroupId = (typeof ADJUSTMENT_GROUPS)[number]['id'];
