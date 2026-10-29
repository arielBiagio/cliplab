import {
  BufferTarget,
  canEncodeVideo,
  Conversion,
  ConversionCanceledError,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
  type VideoCodec,
  type InputVideoTrack,
} from 'mediabunny';
import type { EditState } from '../editing/types';
import { DEFAULT_COMPARISON } from '../rendering/comparison';
import { createVideoRenderer, type VideoRenderer } from '../rendering/videoRenderer';
import {
  checkCancellation,
  createExportInput,
  exportDimensions,
  makeExportResult,
  MAX_DOWNLOAD_BYTES,
} from './exportShared';
import { createFloatFrameReader, makeTenBitSample } from './tenBitFrames';
import { readVideoBitDepth } from './videoBitDepth';
import { isHdrTransfer } from './videoColorSpace';
import type { ExportOptions, ExportProgress, ExportResult } from './types';

interface TenBitCodec {
  codec: VideoCodec;
  fullCodecString: string;
}
const MP4_CODECS: TenBitCodec[] = [
  { codec: 'hevc', fullCodecString: 'hvc1.2.4.L153.B0' },
  { codec: 'av1', fullCodecString: 'av01.0.09M.10' },
];
const WEBM_CODECS: TenBitCodec[] = [
  { codec: 'vp9', fullCodecString: 'vp09.02.41.10' },
  { codec: 'av1', fullCodecString: 'av01.0.09M.10' },
];

async function selectReadableDecoder(
  track: InputVideoTrack,
  sourceDepth: number | null,
  startTime: number,
  signal: AbortSignal,
  readFrame: ReturnType<typeof createFloatFrameReader>,
): Promise<VideoSampleSink> {
  if (sourceDepth === null || sourceDepth < 10) return new VideoSampleSink(track);
  const details: string[] = [];
  for (const hardwareAcceleration of ['no-preference', 'prefer-software'] as const) {
    checkCancellation(signal);
    const label =
      hardwareAcceleration === 'no-preference' ? 'Automatic decoder' : 'Software decoder';
    const sink = new VideoSampleSink(track, { hardwareAcceleration });
    let sample: VideoSample | null = null;
    try {
      sample = await sink.getSample(startTime);
      checkCancellation(signal);
      if (sample?.format && /^I4(20|22|44)A?P1[02]$/.test(sample.format)) {
        // A named format alone does not guarantee CPU readback is available.
        const data = new Uint8Array(sample.allocationSize());
        const planes = await sample.copyTo(data);
        checkCancellation(signal);
        if (planes.length >= 3) return sink;
        details.push(`${label}: ${sample.format}, incomplete YUV planes.`);
      } else if (sample && sample.format === null) {
        // GPU-backed frames may be drawable even when their raw YUV layout is opaque.
        // Require float16 rendering AND readback instead of an implicit RGB8 conversion.
        await readFrame(sample);
        checkCancellation(signal);
        return sink;
      } else {
        details.push(
          `${label}: ${sample ? (sample.format ?? 'opaque format (null)') : 'no decoded frame'}.`,
        );
      }
    } catch (reason) {
      checkCancellation(signal);
      details.push(
        `${label}${sample?.format === null ? ' (opaque GPU frame)' : ''}: ${reason instanceof Error ? reason.message : 'decoding failed'}.`,
      );
    } finally {
      sample?.close();
    }
  }
  throw new Error(
    `This ${sourceDepth}-bit source could not be read at its original precision. ${details.join(' ')} ` +
      '10-bit export requires readable high-bit-depth planes or float16 GPU-frame conversion; the file was not reduced to 8-bit.',
  );
}

/** Config support alone does not guarantee that the encoder accepts I420P10 frames. */
async function acceptsTenBitFrames(
  candidate: TenBitCodec,
  width: number,
  height: number,
  signal: AbortSignal,
) {
  let frame: VideoFrame | null = null;
  let encoder: VideoEncoder | null = null;
  let failed = false;
  let packets = 0;
  const cancel = () => {
    if (encoder && encoder.state !== 'closed') encoder.close();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    checkCancellation(signal);
    const data = new Uint16Array((width * height * 3) / 2);
    data.fill(512);
    const sample = new VideoSample(new Uint8Array(data.buffer), {
      format: 'I420P10',
      codedWidth: width,
      codedHeight: height,
      timestamp: 0,
      duration: 1 / 30,
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    });
    try {
      frame = sample.toVideoFrame();
    } finally {
      sample.close();
    }
    encoder = new VideoEncoder({
      output: () => {
        packets++;
      },
      error: () => {
        failed = true;
      },
    });
    encoder.configure({
      codec: candidate.fullCodecString,
      width,
      height,
      bitrate: 10_000_000,
      framerate: 30,
    });
    encoder.encode(frame, { keyFrame: true });
    await encoder.flush();
    return !failed && packets > 0 && !signal.aborted;
  } catch {
    return false;
  } finally {
    signal.removeEventListener('abort', cancel);
    frame?.close();
    cancel();
  }
}

export async function exportTenBitVideo(
  file: File,
  edit: EditState,
  options: ExportOptions,
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  const input = createExportInput(file);
  const target = new BufferTarget();
  const format =
    options.format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
  const output = new Output({ format, target });
  let audio: Conversion | null = null;
  let renderer: VideoRenderer | null = null;
  let stopped = false;
  let stopTask: Promise<unknown> | null = null;
  let sizeError: Error | null = null;
  let succeeded = false;
  const tasks: Promise<void>[] = [];
  const stop = () => {
    if (stopTask) return stopTask;
    stopped = true;
    stopTask = Promise.allSettled([audio?.cancel(), output.cancel()]);
    input.dispose();
    return stopTask;
  };
  const cancel = () => {
    void stop();
  };
  signal.addEventListener('abort', cancel, { once: true });
  const check = () => {
    if (sizeError) throw sizeError;
    checkCancellation(signal);
    if (stopped) throw new DOMException('Export canceled.', 'AbortError');
  };
  const unlisten = target.on('write', ({ end }) => {
    if (end > MAX_DOWNLOAD_BYTES && !sizeError) {
      sizeError = new Error(
        'This export exceeds the 512 MiB download limit. Try lower quality, 720p, or a shorter video.',
      );
      void stop();
    }
  });
  try {
    check();
    onProgress({ stage: 'preparing', progress: 0 });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error('This browser cannot decode the source video.');
    const config = await track.getDecoderConfig();
    if (isHdrTransfer(config?.colorSpace?.transfer))
      throw new Error(
        '10-bit HDR export is not available yet. This mode supports 10-bit SDR footage.',
      );
    const { width, height } = exportDimensions(
      await track.getDisplayWidth(),
      await track.getDisplayHeight(),
      options.resolution,
    );
    const quality = new Quality(options.quality);
    let selected: TenBitCodec | null = null;
    for (const candidate of options.format === 'mp4' ? MP4_CODECS : WEBM_CODECS) {
      check();
      if (
        (await canEncodeVideo(candidate.codec, {
          width,
          height,
          quality,
          fullCodecString: candidate.fullCodecString,
        })) &&
        (await acceptsTenBitFrames(candidate, width, height, signal))
      ) {
        selected = candidate;
        break;
      }
    }
    check();
    if (!selected)
      throw new Error(
        `No compatible 10-bit ${options.format === 'mp4' ? 'HEVC/AV1' : 'VP9/AV1'} encoder is available on this browser and device. Try the other format or select 8-bit.`,
      );
    const readFrame = createFloatFrameReader(width, height);
    renderer = createVideoRenderer(document.createElement('canvas'), {
      maxWidth: width,
      maxHeight: height,
      highPrecision: true,
      outputTransfer: 'bt709',
      // The shared shader uses 1/255 units; scale the noise to a 10-bit output step.
      ditherStrength: ((options.dithering / 100) * 255) / 1023,
    });
    const rgb = new Float32Array(width * height * 4);
    const video = new VideoSampleSource({
      ...selected,
      quality,
      sizeChangeBehavior: 'deny',
      latencyMode: 'quality',
    });
    output.addVideoTrack(video);
    output.setMetadataTags({});
    const audioTrack = options.includeAudio ? await input.getPrimaryAudioTrack() : null;
    const startTime = Math.max(
      0,
      await input.getFirstTimestamp(audioTrack ? [track, audioTrack] : [track]),
    );
    const endTime = await input.computeDuration();
    const sourceDepth = await readVideoBitDepth(track);
    const sink = await selectReadableDecoder(track, sourceDepth, startTime, signal, readFrame);
    if (audioTrack) {
      audio = await Conversion.init({
        input,
        output,
        composable: true,
        tracks: 'primary',
        video: { discard: true },
        audio: { codec: options.format === 'mp4' ? 'aac' : 'opus' },
        trim: { start: startTime },
      });
      if (!audio.utilizedTracks.some((item) => item.type === 'audio'))
        throw new Error(
          'The original audio cannot be included. Try the other format or turn off Include original audio.',
        );
    }
    check();
    await output.start();
    const renderFrames = async () => {
      let count = 0;
      for await (const sample of sink.samples(startTime)) {
        try {
          check();
          if (sample.timestamp + sample.duration <= startTime) continue;
          if (
            sourceDepth !== null &&
            sourceDepth >= 10 &&
            sample.format !== null &&
            !/P1[02]$/.test(sample.format)
          )
            throw new Error(
              `The decoded format changed to ${sample.format ?? 'opaque (null)'}. Readable 10/12-bit frames are required to preserve the source precision.`,
            );
          const frame = await readFrame(sample);
          if (
            !renderer!.render(
              frame,
              edit.adjustments,
              DEFAULT_COMPARISON,
              edit.lut,
              edit.colorMixer,
            )
          )
            throw new Error('The graphics context was lost during 10-bit export. Try again.');
          // Typed-array upload and float readback share top-down row order; no canvas flip is used.
          renderer!.readFloatPixels!(rgb);
          const timestamp = Math.max(0, sample.timestamp - startTime);
          const duration = Math.max(
            0,
            sample.timestamp + sample.duration - Math.max(sample.timestamp, startTime),
          );
          const encoded = makeTenBitSample(rgb, width, height, timestamp, duration);
          try {
            await video.add(encoded);
          } finally {
            encoded.close();
          }
          count++;
          onProgress({
            stage: 'rendering',
            progress: Math.max(
              0,
              Math.min(
                0.99,
                (sample.timestamp + sample.duration - startTime) /
                  Math.max(0.001, endTime - startTime),
              ),
            ),
          });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } finally {
          sample.close();
        }
      }
      if (count === 0) throw new Error('No video frames could be exported.');
      video.close();
    };
    // Both tracks must run concurrently so muxer backpressure cannot block either one.
    tasks.push(renderFrames());
    if (audio) tasks.push(audio.execute());
    await Promise.all(tasks);
    check();
    onProgress({ stage: 'finishing', progress: 0.99 });
    await output.finalize();
    check();
    if (!target.buffer?.byteLength) throw new Error('The export produced an empty file.');
    const blob = new Blob([target.buffer], { type: format.mimeType });
    const verification = createExportInput(blob);
    const cancelVerification = () => verification.dispose();
    signal.addEventListener('abort', cancelVerification, { once: true });
    try {
      check();
      const resultTrack = await verification.getPrimaryVideoTrack();
      if (!resultTrack || (await readVideoBitDepth(resultTrack)) !== 10)
        throw new Error(
          'The encoder did not produce a verifiable 10-bit stream. Try the other format; no 8-bit file was substituted.',
        );
    } finally {
      signal.removeEventListener('abort', cancelVerification);
      verification.dispose();
    }
    check();
    succeeded = true;
    return makeExportResult(file, blob, options.format, width, height, 10, selected.codec);
  } catch (reason) {
    if (sizeError) throw sizeError;
    if (signal.aborted || reason instanceof ConversionCanceledError)
      throw new DOMException('Export canceled.', 'AbortError');
    throw reason;
  } finally {
    signal.removeEventListener('abort', cancel);
    unlisten();
    if (!succeeded) {
      await stop();
      // Cancellation may have happened while Conversion.init was still resolving.
      await audio?.cancel().catch(() => {});
    }
    await Promise.allSettled(tasks);
    renderer?.dispose();
    input.dispose();
    target.buffer = null;
  }
}
