import { StrictMode, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ADJUSTMENTS } from '../editing/presets';
import { DEFAULT_LUT_STATE } from '../luts/types';
import { DEFAULT_COLOR_MIXER, type ColorMixerState } from '../editing/colorMixer';
import type { Adjustments } from '../editing/types';
import { createVideoRenderer, type FloatVideoFrame } from './videoRenderer';
import { useVideoRenderer } from './useVideoRenderer';
import { DEFAULT_COMPARISON, type ComparisonView } from './comparison';

vi.mock('./videoRenderer', () => ({ createVideoRenderer: vi.fn() }));

const draw = vi.fn((video: HTMLVideoElement | HTMLCanvasElement | FloatVideoFrame) =>
  video instanceof HTMLVideoElement ? video.readyState >= 2 : true,
);
const dispose = vi.fn();
const frameDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'requestVideoFrameCallback',
);
const cancelFrameDescriptor = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  'cancelVideoFrameCallback',
);
const cancelFrame = vi.fn();

function Harness({
  adjustments = DEFAULT_ADJUSTMENTS,
  enabled = true,
  comparison = DEFAULT_COMPARISON,
  colorMixer = DEFAULT_COLOR_MIXER,
}: {
  adjustments?: Readonly<Adjustments>;
  enabled?: boolean;
  comparison?: Readonly<ComparisonView>;
  colorMixer?: ColorMixerState;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { canvasRef, mode, warning } = useVideoRenderer(
    videoRef,
    adjustments,
    enabled,
    comparison,
    DEFAULT_LUT_STATE,
    colorMixer,
  );
  return (
    <>
      <video ref={videoRef} aria-label="Source" />
      <canvas ref={canvasRef} aria-label="Output" />
      <div data-testid="mode">{mode}</div>
      {warning && <p role="status">{warning}</p>}
    </>
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: vi.fn(() => 1),
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    value: cancelFrame,
  });
  cancelFrame.mockClear();
  vi.mocked(createVideoRenderer).mockReset();
  draw.mockClear();
  dispose.mockClear();
  vi.mocked(createVideoRenderer).mockReturnValue({ render: draw, dispose });
});

afterEach(() => {
  cleanup();
  if (frameDescriptor)
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', frameDescriptor);
  else Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  if (cancelFrameDescriptor)
    Object.defineProperty(
      HTMLVideoElement.prototype,
      'cancelVideoFrameCallback',
      cancelFrameDescriptor,
    );
  else Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
});

function makeReady() {
  const video = screen.getByLabelText('Source') as HTMLVideoElement;
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  fireEvent.loadedData(video);
  return video;
}

describe('video rendering lifecycle', () => {
  it('does not allocate a context before a video is selected', async () => {
    render(<Harness enabled={false} />);
    await act(async () => {});
    expect(createVideoRenderer).not.toHaveBeenCalled();
  });

  it('draws the first frame and updates adjustments while paused without recreating resources', async () => {
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(createVideoRenderer).toHaveBeenCalledOnce());
    expect(screen.getByTestId('mode')).toHaveTextContent('pending');
    const video = makeReady();
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('webgl2'));
    const adjustments = { ...DEFAULT_ADJUSTMENTS, hue: 45, sepia: 75 };
    rerender(<Harness adjustments={adjustments} />);
    expect(draw).toHaveBeenLastCalledWith(
      video,
      adjustments,
      DEFAULT_COMPARISON,
      DEFAULT_LUT_STATE,
      DEFAULT_COLOR_MIXER,
    );
    expect(video.paused).toBe(true);
    expect(createVideoRenderer).toHaveBeenCalledOnce();
  });

  it('falls back to the standard preview after a context creation error', async () => {
    vi.mocked(createVideoRenderer).mockImplementationOnce(() => {
      throw new Error('Unavailable');
    });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('css'));
    expect(screen.getByRole('status')).toHaveTextContent('your edits are preserved');
  });

  it('recreates resources after context restoration and uses the latest adjustments', async () => {
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(createVideoRenderer).toHaveBeenCalledOnce());
    const video = makeReady();
    const canvas = screen.getByLabelText('Output');
    const lost = new Event('webglcontextlost', { cancelable: true });
    fireEvent(canvas, lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(screen.getByTestId('mode')).toHaveTextContent('css');
    const adjustments = { ...DEFAULT_ADJUSTMENTS, hue: -90 };
    rerender(<Harness adjustments={adjustments} />);
    fireEvent(canvas, new Event('webglcontextrestored'));
    expect(createVideoRenderer).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenLastCalledWith(
      video,
      adjustments,
      DEFAULT_COMPARISON,
      DEFAULT_LUT_STATE,
      DEFAULT_COLOR_MIXER,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('releases resources and listeners on unmount, including in Strict Mode', async () => {
    const { unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await waitFor(() => expect(createVideoRenderer).toHaveBeenCalledOnce());
    const video = makeReady();
    const canvas = screen.getByLabelText('Output');
    unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    const calls = draw.mock.calls.length;
    fireEvent.seeked(video);
    fireEvent(canvas, new Event('webglcontextrestored'));
    expect(draw).toHaveBeenCalledTimes(calls);
    expect(createVideoRenderer).toHaveBeenCalledOnce();
  });

  it('redraws comparison changes while paused without recreating resources or changing edits', async () => {
    const adjustments = { ...DEFAULT_ADJUSTMENTS, exposure: 1, tint: -20 };
    const { rerender } = render(<Harness adjustments={adjustments} />);
    await waitFor(() => expect(createVideoRenderer).toHaveBeenCalledOnce());
    const video = makeReady();
    const comparison = { enabled: true, split: 30 };
    rerender(<Harness adjustments={adjustments} comparison={comparison} />);
    expect(draw).toHaveBeenLastCalledWith(
      video,
      adjustments,
      comparison,
      DEFAULT_LUT_STATE,
      DEFAULT_COLOR_MIXER,
    );
    expect(createVideoRenderer).toHaveBeenCalledOnce();
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0);
    expect(adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, exposure: 1, tint: -20 });
  });

  it('redraws mixer edits while paused and restores the latest mixer after GPU loss', async () => {
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(createVideoRenderer).toHaveBeenCalledOnce());
    const video = makeReady();
    const canvas = screen.getByLabelText('Output');
    const colorMixer = {
      ...DEFAULT_COLOR_MIXER,
      green: { hue: 20, saturation: -40, luminance: 10 },
    };
    rerender(<Harness colorMixer={colorMixer} />);
    expect(draw).toHaveBeenLastCalledWith(
      video,
      DEFAULT_ADJUSTMENTS,
      DEFAULT_COMPARISON,
      DEFAULT_LUT_STATE,
      colorMixer,
    );
    expect(createVideoRenderer).toHaveBeenCalledOnce();
    fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }));
    const latest = { ...colorMixer, blue: { hue: -10, saturation: 30, luminance: -25 } };
    rerender(<Harness colorMixer={latest} />);
    fireEvent(canvas, new Event('webglcontextrestored'));
    expect(draw).toHaveBeenLastCalledWith(
      video,
      DEFAULT_ADJUSTMENTS,
      DEFAULT_COMPARISON,
      DEFAULT_LUT_STATE,
      latest,
    );
    expect(createVideoRenderer).toHaveBeenCalledTimes(2);
    expect(video.paused).toBe(true);
  });
});
