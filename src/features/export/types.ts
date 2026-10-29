export type ExportFormat = 'mp4' | 'webm';
export type ExportResolution = 720 | 1080;
export type ExportQuality = 'medium' | 'high' | 'very-high';
export type ExportBitDepth = 8 | 10;
export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  quality: ExportQuality;
  bitDepth: ExportBitDepth;
  /** Output dithering strength, from 0 (off) to 100 (one output code value peak). */
  dithering: number;
  includeAudio: boolean;
}
export interface ExportVideoInfo {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  sourceBitDepth: number | null;
  isHdr: boolean;
}
export type ExportStage = 'preparing' | 'rendering' | 'finishing';
export interface ExportProgress {
  stage: ExportStage;
  progress: number;
}
export interface ExportResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  bitDepth: ExportBitDepth;
  codec: string;
}
