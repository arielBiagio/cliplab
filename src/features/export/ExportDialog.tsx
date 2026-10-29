import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../shared/Icon';
import { formatTime } from '../../shared/formatTime';
import type { EditState } from '../editing/types';
import type {
  ExportFormat,
  ExportBitDepth,
  ExportOptions,
  ExportProgress,
  ExportQuality,
  ExportResolution,
  ExportVideoInfo,
} from './types';

interface Props {
  file: File;
  edit: EditState;
  onClose: () => void;
}
type Phase =
  | 'loading'
  | 'ready'
  | 'preparing'
  | 'rendering'
  | 'finishing'
  | 'cancelling'
  | 'cancelled'
  | 'done'
  | 'error';
interface Download {
  url: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  bitDepth: ExportBitDepth;
  codec: string;
}

export function ExportDialog({ file, edit, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const closeRequested = useRef(false);
  const mounted = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<ExportVideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ExportOptions>({
    format: 'mp4',
    resolution: 1080,
    quality: 'very-high',
    bitDepth: 8,
    dithering: 50,
    includeAudio: true,
  });
  const [progress, setProgress] = useState(0);
  const [download, setDownload] = useState<Download | null>(null);
  const busy = ['preparing', 'rendering', 'finishing', 'cancelling'].includes(phase);

  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const inspection = new AbortController();
    dialog?.showModal();
    void import('./exportVideo')
      .then((module) => module.inspectExportVideo(file, inspection.signal))
      .then((details) => {
        if (inspection.signal.aborted) return;
        setInfo(details);
        setPhase('ready');
      })
      .catch((reason: unknown) => {
        if (inspection.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : 'Unable to read this video for export.',
        );
        setPhase('error');
      });
    return () => {
      mounted.current = false;
      inspection.abort();
      controllerRef.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = null;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [file]);

  function cancel(closeAfter = false) {
    if (!controllerRef.current) {
      if (closeAfter) onClose();
      return;
    }
    closeRequested.current ||= closeAfter;
    setPhase('cancelling');
    controllerRef.current.abort();
  }

  function changeOptions(patch: Partial<ExportOptions>) {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
    setDownload(null);
    setError(null);
    setPhase('ready');
    setOptions((current) => ({ ...current, ...patch }));
  }

  async function startExport() {
    if (!info || controllerRef.current || phase === 'loading') return;
    const controller = new AbortController();
    controllerRef.current = controller;
    closeRequested.current = false;
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
    setDownload(null);
    setError(null);
    setProgress(0);
    setPhase('preparing');
    let lastPercent = -1;
    let lastStage = '';
    const report = ({ stage, progress: amount }: ExportProgress) => {
      if (!mounted.current || controller.signal.aborted) return;
      const percent = Math.min(99, Math.floor(amount * 100));
      if (percent === lastPercent && stage === lastStage) return;
      lastPercent = percent;
      lastStage = stage;
      setProgress(percent);
      setPhase(stage);
    };
    try {
      const module = await import('./exportVideo');
      const result = await module.exportVideo(
        file,
        edit,
        { ...options },
        controller.signal,
        report,
      );
      if (!mounted.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(result.blob);
      downloadUrl.current = url;
      setDownload({
        url,
        name: result.name,
        bytes: result.blob.size,
        width: result.width,
        height: result.height,
        bitDepth: result.bitDepth,
        codec: result.codec,
      });
      setProgress(100);
      setPhase('done');
    } catch (reason) {
      if (!mounted.current) return;
      if (controller.signal.aborted) setPhase('cancelled');
      else {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to export this video. Try the other format or 720p.',
        );
        setPhase('error');
      }
    } finally {
      controllerRef.current = null;
      if (mounted.current && closeRequested.current) onClose();
    }
  }

  const status =
    phase === 'loading'
      ? 'Reading video…'
      : phase === 'preparing'
        ? 'Preparing export…'
        : phase === 'rendering'
          ? `Rendering video · ${progress}%`
          : phase === 'finishing'
            ? 'Finishing file…'
            : phase === 'cancelling'
              ? 'Canceling export…'
              : phase === 'cancelled'
                ? 'Export canceled. Your session is unchanged.'
                : phase === 'done'
                  ? 'Your video is ready.'
                  : '';

  return (
    <dialog
      ref={dialogRef}
      className="export-dialog"
      aria-labelledby="export-title"
      aria-describedby="export-description"
      onCancel={(event) => {
        event.preventDefault();
        cancel(true);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id="export-title">Export video</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close video export"
          onClick={() => cancel(true)}
        >
          <Icon name="close" />
        </button>
      </div>
      <p id="export-description">
        Download the full video with your current edits. Your original stays unchanged.
      </p>
      <div className="export-source">
        <span className="export-source-name">{file.name}</span>
        {info && (
          <span>
            {info.width} × {info.height} · {formatTime(info.duration)} ·{' '}
            {info.hasAudio ? 'Audio available' : 'No audio track'}
            {info.sourceBitDepth !== null && ` · ${info.sourceBitDepth}-bit source`}
            {info.isHdr && ' · HDR'}
          </span>
        )}
      </div>
      <fieldset className="export-options" disabled={busy || phase === 'loading' || !info}>
        <legend className="visually-hidden">Export settings</legend>
        <label>
          Format
          <select
            aria-label="Export format"
            value={options.format}
            onChange={(event) => changeOptions({ format: event.target.value as ExportFormat })}
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        <label>
          Resolution
          <select
            aria-label="Export resolution"
            value={options.resolution}
            onChange={(event) =>
              changeOptions({ resolution: Number(event.target.value) as ExportResolution })
            }
          >
            <option value={1080}>Up to 1080p</option>
            <option value={720}>Up to 720p</option>
          </select>
        </label>
        <label className="export-bit-depth">
          Bit depth
          <select
            aria-label="Export bit depth"
            aria-describedby="export-bit-depth-hint"
            value={options.bitDepth}
            onChange={(event) =>
              changeOptions({ bitDepth: Number(event.target.value) as ExportBitDepth })
            }
          >
            <option value={8}>8-bit · compatible</option>
            <option value={10} disabled={info?.isHdr}>
              10-bit · SDR
            </option>
          </select>
          <span className="export-setting-hint" id="export-bit-depth-hint">
            {info?.isHdr
              ? 'HDR 10-bit output needs a separate color pipeline and is not available yet.'
              : options.bitDepth === 10
                ? 'Uses float processing and a compatible HEVC, VP9 or AV1 encoder. Availability depends on your device; processing may be slower.'
                : 'Choose 10-bit for finer gradients and high-bit-depth SDR sources.'}
          </span>
        </label>
        <label className="export-quality">
          Quality
          <select
            aria-label="Export quality"
            aria-describedby="export-quality-hint"
            value={options.quality}
            onChange={(event) => changeOptions({ quality: event.target.value as ExportQuality })}
          >
            <option value="medium">Standard · smaller file</option>
            <option value="high">High</option>
            <option value="very-high">Very high · more detail</option>
          </select>
          <span className="export-setting-hint" id="export-quality-hint">
            Higher quality usually produces larger files. Compression remains lossy.
          </span>
        </label>
        <label className="export-dither">
          <span className="export-setting-label">
            Dithering
            <output>{options.dithering === 0 ? 'Off' : `${options.dithering}%`}</output>
          </span>
          <input
            type="range"
            aria-label="Export dithering"
            aria-describedby="export-dither-hint"
            aria-valuetext={options.dithering === 0 ? 'Off' : `${options.dithering}%`}
            min={0}
            max={100}
            step={1}
            value={options.dithering}
            style={{ '--range-progress': `${options.dithering}%` } as CSSProperties}
            onChange={(event) => changeOptions({ dithering: Number(event.target.value) })}
          />
          <span className="export-setting-hint" id="export-dither-hint">
            Adds fine grain to soften banding. Set to 0% to turn it off. Export only.
          </span>
        </label>
        <label className="export-audio">
          <input
            type="checkbox"
            checked={options.includeAudio && !!info?.hasAudio}
            disabled={!info?.hasAudio}
            onChange={(event) => changeOptions({ includeAudio: event.target.checked })}
          />
          Include original audio
        </label>
      </fieldset>
      <p className="export-note">
        SDR video with original proportions and frame timing. Preview mute, loop and Compare do not
        affect the export.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <p className="export-status" role="status">
        {status}
      </p>
      {busy && (
        <>
          <progress
            className="export-progress"
            max={100}
            value={progress}
            aria-label="Video export progress"
          />
          <p className="export-note">Keep this tab open until the export finishes.</p>
        </>
      )}
      {download && (
        <p className="export-result">
          {download.width} × {download.height} · {download.bitDepth}-bit ·{' '}
          {download.codec.toUpperCase()} · {(download.bytes / (1024 * 1024)).toFixed(1)} MiB
        </p>
      )}
      <div className="dialog-footer">
        <span className="export-local">
          <Icon name="lock" width="13" height="13" /> On your device
        </span>
        {busy ? (
          <button
            className="text-button"
            type="button"
            disabled={phase === 'cancelling'}
            onClick={() => cancel()}
          >
            Cancel export
          </button>
        ) : download ? (
          <a className="import-button" href={download.url} download={download.name}>
            <Icon name="download" width="16" height="16" /> Download video
          </a>
        ) : (
          <button
            className="import-button"
            type="button"
            disabled={!info || phase === 'loading'}
            onClick={() => void startExport()}
          >
            <Icon name="download" width="16" height="16" />{' '}
            {phase === 'error' ? 'Try again' : 'Start export'}
          </button>
        )}
      </div>
    </dialog>
  );
}
