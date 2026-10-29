import { BlobSource, Input, MATROSKA, MP4, QTFF, WEBM } from 'mediabunny';
import type { ExportBitDepth, ExportFormat, ExportResult } from './types';

export const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

export function checkCancellation(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Export canceled.', 'AbortError');
}

export function createExportInput(file: Blob) {
  return new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
}

export function exportDimensions(width: number, height: number, resolution: 720 | 1080) {
  const longEdge = resolution === 1080 ? 1920 : 1280;
  const maxWidth = width >= height ? longEdge : resolution;
  const maxHeight = width >= height ? resolution : longEdge;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}

export function makeExportResult(
  file: File,
  blob: Blob,
  format: ExportFormat,
  width: number,
  height: number,
  bitDepth: ExportBitDepth,
  codec: string,
): ExportResult {
  const base =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[<>:"/\\|?*]/g, '-')
      .trim() || 'video';
  return {
    blob,
    name: `${base}-cliplab${bitDepth === 10 ? '-10bit' : ''}.${format}`,
    width,
    height,
    bitDepth,
    codec,
  };
}
