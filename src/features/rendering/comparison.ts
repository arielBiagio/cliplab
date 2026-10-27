export interface ComparisonView {
  enabled: boolean;
  split: number;
}

export const DEFAULT_COMPARISON: Readonly<ComparisonView> = { enabled: false, split: 50 };

export function normalizeComparisonSplit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 50;
}

export function getContainBounds(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
) {
  if (
    ![containerWidth, containerHeight, videoWidth, videoHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { width, height, left: (containerWidth - width) / 2, top: (containerHeight - height) / 2 };
}
