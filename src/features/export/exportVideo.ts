import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  Conversion,
  ConversionCanceledError,
  Quality,
  VideoSample,
  VideoSampleSink,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { createVideoRenderer, type VideoRenderer } from '../rendering/videoRenderer';
import { DEFAULT_COMPARISON } from '../rendering/comparison';
import type { EditState } from '../editing/types';
import type { ExportOptions, ExportProgress, ExportResult, ExportVideoInfo } from './types';
import {
  checkCancellation,
  createExportInput,
  exportDimensions,
  makeExportResult,
  MAX_DOWNLOAD_BYTES,
} from './exportShared';
import { readVideoBitDepth } from './videoBitDepth';
import { isHdrTransfer } from './videoColorSpace';

function requireWebCodecs() {
  if (
    !window.isSecureContext ||
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined'
  ) {
    throw new Error(
      'Video export is unavailable in this browser. Open ClipLab in a recent desktop Chrome or Edge browser.',
    );
  }
}

export async function inspectExportVideo(
  file: File,
  signal: AbortSignal,
): Promise<ExportVideoInfo> {
  requireWebCodecs();
  checkCancellation(signal);
  const input = createExportInput(file);
  const cancel = () => input.dispose();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (!(await input.canRead()))
      throw new Error(
        'This source format cannot be exported yet. Use an MP4, MOV, WebM or MKV video.',
      );
    const [video, audio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    checkCancellation(signal);
    if (!video || !(await video.canDecode()))
      throw new Error(
        'This video can be previewed, but its codec cannot be decoded for export in this browser. Try an MP4/H.264 or WebM source.',
      );
    const [width, height, duration] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.computeDuration(),
    ]);
    checkCancellation(signal);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 2 ||
      height < 2 ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      throw new Error('The video has no valid dimensions or duration for export.');
    let sourceBitDepth = await readVideoBitDepth(video);
    const config = await video.getDecoderConfig();
    let transfer = config?.colorSpace?.transfer;
    const sample = await new VideoSampleSink(video).getSample(await video.getFirstTimestamp());
    try {
      if (sample) {
        transfer ??= sample.colorSpace.transfer;
        if (sourceBitDepth === null && sample.format)
          sourceBitDepth = /P10$/.test(sample.format) ? 10 : /P12$/.test(sample.format) ? 12 : 8;
      }
    } finally {
      sample?.close();
    }
    checkCancellation(signal);
    return {
      width,
      height,
      duration,
      hasAudio: audio !== null,
      sourceBitDepth,
      isHdr: isHdrTransfer(transfer),
    };
  } finally {
    signal.removeEventListener('abort', cancel);
    input.dispose();
  }
}

export async function exportVideo(
  file: File,
  edit: EditState,
  options: ExportOptions,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  requireWebCodecs();
  checkCancellation(signal);
  if (options.bitDepth === 10) {
    const { exportTenBitVideo } = await import('./exportTenBitVideo');
    return exportTenBitVideo(file, edit, options, signal, onProgress);
  }
  const input = createExportInput(file);
  const target = new BufferTarget();
  const format =
    options.format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
  const output = new Output({ format, target });
  let conversion: Conversion | null = null;
  let renderer: VideoRenderer | null = null;
  let cancelTask: Promise<void> | null = null;
  let sizeError: Error | null = null;
  let succeeded = false;
  let processedFrames = 0;
  const cancel = () => {
    if (conversion) cancelTask ??= conversion.cancel().catch(() => {});
    else input.dispose();
  };
  signal.addEventListener('abort', cancel, { once: true });
  const stopSizeListener = target.on('write', ({ end }) => {
    if (end > MAX_DOWNLOAD_BYTES && !sizeError) {
      sizeError = new Error(
        "This export exceeds ClipLab's current 512 MiB download limit. Try 720p or a shorter source video.",
      );
      if (conversion) cancelTask ??= conversion.cancel().catch(() => {});
    }
  });
  try {
    onProgress({ stage: 'preparing', progress: 0 });
    const track = await input.getPrimaryVideoTrack();
    checkCancellation(signal);
    if (!track) throw new Error('No video track was found in this file.');
    const [sourceWidth, sourceHeight] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);
    const { width, height } = exportDimensions(sourceWidth, sourceHeight, options.resolution);
    const quality = new Quality(options.quality);
    const codec = await getFirstEncodableVideoCodec(
      options.format === 'mp4' ? ['avc'] : ['vp9', 'vp8'],
      { width, height, quality },
    );
    checkCancellation(signal);
    if (!codec)
      throw new Error(
        options.format === 'mp4'
          ? 'This browser cannot encode MP4 at this resolution. Try WebM or 720p.'
          : 'This browser cannot encode WebM at this resolution. Try MP4 or 720p.',
      );

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
    if (!sourceContext) throw new Error('Unable to prepare the video frames for export.');
    const renderedCanvas = document.createElement('canvas');
    renderer = createVideoRenderer(renderedCanvas, {
      maxWidth: width,
      maxHeight: height,
      preserveDrawingBuffer: true,
      ditherStrength: options.dithering / 100,
    });
    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      tags: {},
      video: {
        width,
        height,
        fit: 'contain',
        codec,
        quality,
        allowTransformationMetadata: false,
        forceTranscode: true,
        async process(sample) {
          // Let the browser paint progress and handle cancellation during fast decodes.
          if (++processedFrames % 8 === 0)
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          checkCancellation(signal);
          // draw() respects rotation and pixel aspect ratio before the shared shader.
          sourceContext.clearRect(0, 0, width, height);
          sample.draw(sourceContext, 0, 0, width, height);
          if (
            !renderer!.render(
              sourceCanvas,
              edit.adjustments,
              DEFAULT_COMPARISON,
              edit.lut,
              edit.colorMixer,
            )
          ) {
            throw new Error(
              'The graphics context was lost during export. Your editing session is unchanged; try again.',
            );
          }
          return new VideoSample(renderedCanvas, {
            timestamp: sample.timestamp,
            duration: sample.duration,
          });
        },
      },
      audio: options.includeAudio
        ? { codec: options.format === 'mp4' ? 'aac' : 'opus' }
        : { discard: true },
    });
    checkCancellation(signal);
    if (!conversion.utilizedTracks.some((item) => item.type === 'video')) {
      throw new Error(
        'The source video cannot be decoded or encoded for this format. Try another source or output format.',
      );
    }
    if (
      options.includeAudio &&
      conversion.discardedTracks.some(
        (item) => item.track.type === 'audio' && item.reason !== 'discarded_by_user',
      )
    ) {
      throw new Error(
        'The original audio cannot be included in this format on your browser. Try the other format, or turn off Include original audio.',
      );
    }
    if (!conversion.isValid)
      throw new Error(
        'This video cannot be exported with the selected settings. Try the other format.',
      );
    conversion.onProgress = (progress) => {
      if (!signal.aborted)
        onProgress({
          stage: progress >= 1 ? 'finishing' : 'rendering',
          progress: Math.max(0, Math.min(1, progress)),
        });
    };
    await conversion.execute();
    if (sizeError) throw sizeError;
    checkCancellation(signal);
    if (!target.buffer || target.buffer.byteLength === 0)
      throw new Error('The export produced an empty file. Try again with another format.');
    const blob = new Blob([target.buffer], { type: format.mimeType });
    succeeded = true;
    return makeExportResult(file, blob, options.format, width, height, 8, codec);
  } catch (reason) {
    if (sizeError) throw sizeError;
    if (signal.aborted || reason instanceof ConversionCanceledError)
      throw new DOMException('Export canceled.', 'AbortError');
    throw reason;
  } finally {
    signal.removeEventListener('abort', cancel);
    stopSizeListener();
    if (!succeeded) {
      if (conversion) await conversion.cancel().catch(() => {});
      else await output.cancel().catch(() => {});
    }
    if (cancelTask) await cancelTask;
    renderer?.dispose();
    input.dispose();
    target.buffer = null;
  }
}
