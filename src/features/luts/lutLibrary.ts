import type { CubeLut } from './types';

export const LUT_LIBRARY_LIMIT = 8;

function sameLut(left: CubeLut, right: CubeLut): boolean {
  return (
    left.name === right.name &&
    left.fileName === right.fileName &&
    left.size === right.size &&
    left.domainMin.every((value, index) => value === right.domainMin[index]) &&
    left.domainMax.every((value, index) => value === right.domainMax[index]) &&
    left.data.length === right.data.length &&
    left.data.every((value, index) => value === right.data[index])
  );
}

export function addToLutLibrary(library: readonly CubeLut[], imported: readonly CubeLut[]) {
  const next = [...library];
  const selected: CubeLut[] = [];
  for (const source of imported) {
    let existing = next.find((entry) => sameLut(entry, source));
    if (!existing) {
      if (next.length >= LUT_LIBRARY_LIMIT)
        throw new Error(
          `Keep up to ${LUT_LIBRARY_LIMIT} LUTs in the gallery. Remove a LUT or clear the gallery before adding more.`,
        );
      existing = source;
      next.push(source);
    }
    selected.push(existing);
  }
  return { library: next, selected };
}
