import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoPlayer } from './useVideoPlayer';

const onReady = vi.fn();
const onPositionChange = vi.fn();
let paused: WeakMap<HTMLMediaElement, boolean>;

function Harness({ file }: { file: File }) {
  const {
    videoRef,
    state,
    togglePlayback,
    toggleLoop,
    toggleMute,
    seekBy,
    seekTo,
    restart,
    startScrub,
    endScrub,
  } = useVideoPlayer(file, onReady, 0, onPositionChange);
  return (
    <>
      <video ref={videoRef} aria-label="Test video" />
      <output data-testid="state">{JSON.stringify(state)}</output>
      <button onClick={togglePlayback}>Toggle</button>
      <button onClick={() => seekBy(-5)}>Back</button>
      <button onClick={() => seekTo(1000)}>End</button>
      <button onClick={restart}>Restart</button>
      <button onClick={startScrub}>Scrub start</button>
      <button onClick={() => endScrub()}>Scrub end</button>
      <button onClick={() => endScrub(true)}>Scrub cancel</button>
      <button onClick={toggleLoop}>Loop</button>
      <button onClick={toggleMute}>Mute</button>
    </>
  );
}

beforeEach(() => {
  onReady.mockClear();
  onPositionChange.mockClear();
  paused = new WeakMap();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return paused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, false);
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, true);
    this.dispatchEvent(new Event('pause'));
  });
});

function makeReady() {
  const video = screen.getByLabelText('Test video') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
  fireEvent.loadedMetadata(video);
  return video;
}

function state() {
  return JSON.parse(screen.getByTestId('state').textContent!);
}

describe('video controller', () => {
  it('requests an immediate session checkpoint after seeking while paused', () => {
    render(<Harness file={new File(['video'], 'test.webm')} />);
    const video = makeReady();
    video.currentTime = 5;
    fireEvent(video, new Event('seeked'));
    expect(onPositionChange).toHaveBeenLastCalledWith(5, true);
  });

  it('loads metadata without autoplay, bounds seeking, and restarts without pausing', async () => {
    const file = new File(['video'], 'test.webm');
    render(<Harness file={file} />);
    expect(state().status).toBe('loading');
    const video = makeReady();
    expect(onReady).toHaveBeenCalledWith(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back'));
    expect(video.currentTime).toBe(0);
    fireEvent.click(screen.getByText('End'));
    expect(video.currentTime).toBe(12);
    await act(async () => {
      fireEvent.click(screen.getByText('Toggle'));
    });
    expect(video.currentTime).toBe(0);
    expect(state().isPlaying).toBe(true);
    video.currentTime = 6;
    fireEvent.click(screen.getByText('Restart'));
    expect(video.currentTime).toBe(0);
    expect(state().isPlaying).toBe(true);
  });

  it('pauses during scrubbing and resumes only if previously playing', async () => {
    const file = new File(['video'], 'test.webm');
    render(<Harness file={file} />);
    makeReady();
    fireEvent.click(screen.getByText('Scrub start'));
    fireEvent.click(screen.getByText('Scrub end'));
    await waitFor(() => expect(state().isSeeking).toBe(false));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText('Toggle'));
    });
    fireEvent.click(screen.getByText('Scrub start'));
    expect(state().isPlaying).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByText('Scrub end'));
    });
    await waitFor(() => expect(state().isPlaying).toBe(true));
  });

  it('waits for the last seek before resuming and keeps only the latest target', async () => {
    render(<Harness file={new File(['video'], 'test.webm')} />);
    const video = makeReady();
    let seeking = false;
    let time = 0;
    const targets: number[] = [];
    Object.defineProperty(video, 'seeking', { configurable: true, get: () => seeking });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => time,
      set: (value: number) => {
        time = value;
        seeking = true;
        targets.push(value);
      },
    });
    await act(async () => fireEvent.click(screen.getByText('Toggle')));
    fireEvent.click(screen.getByText('Scrub start'));
    fireEvent.click(screen.getByText('End'));
    await waitFor(() => expect(targets).toEqual([12]));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Scrub end'));
    expect(state().currentTime).toBe(2);
    expect(state().isPlaying).toBe(false);
    expect(targets).toEqual([12]);
    seeking = false;
    fireEvent.seeked(video);
    await waitFor(() => expect(targets).toEqual([12, 2]));
    expect(state().isPlaying).toBe(false);
    seeking = false;
    fireEvent.seeked(video);
    await waitFor(() => expect(state().isPlaying).toBe(true));
    expect(state().isSeeking).toBe(false);
  });

  it('cancels a scrub back to its initial time and remains paused', async () => {
    render(<Harness file={new File(['video'], 'test.webm')} />);
    const video = makeReady();
    video.currentTime = 4;
    fireEvent.click(screen.getByText('Scrub start'));
    fireEvent.click(screen.getByText('End'));
    fireEvent.click(screen.getByText('Scrub cancel'));
    await waitFor(() => expect(state().isSeeking).toBe(false));
    expect(video.currentTime).toBe(4);
    expect(state().currentTime).toBe(4);
    expect(state().isPlaying).toBe(false);
  });

  it('toggles native loop and mute without starting playback or changing volume', () => {
    render(<Harness file={new File(['video'], 'test.webm')} />);
    fireEvent.click(screen.getByText('Loop'));
    expect(state().isLooping).toBe(false);
    const video = makeReady();
    video.volume = 0.4;
    fireEvent.click(screen.getByText('Loop'));
    fireEvent.click(screen.getByText('Mute'));
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(state().isLooping).toBe(true);
    expect(state().isMuted).toBe(true);
    expect(state().isPlaying).toBe(false);
    fireEvent.click(screen.getByText('Loop'));
    fireEvent.click(screen.getByText('Mute'));
    expect(video.loop).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.4);
    video.muted = true;
    fireEvent.volumeChange(video);
    expect(state().isMuted).toBe(true);
  });

  it('reports an unsupported video and releases its object URL', () => {
    const file = new File(['video'], 'test.webm');
    const { unmount } = render(<Harness file={file} />);
    fireEvent.error(screen.getByLabelText('Test video'));
    expect(state().status).toBe('error');
    expect(onReady).toHaveBeenCalledWith(false);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('keeps playback retryable after a rejected play promise', async () => {
    const file = new File(['video'], 'test.webm');
    render(<Harness file={file} />);
    makeReady();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Interrupted'));
    await act(async () => {
      fireEvent.click(screen.getByText('Toggle'));
    });
    expect(state().status).toBe('ready');
    expect(state().error).toContain('Press Play');
    await act(async () => {
      fireEvent.click(screen.getByText('Toggle'));
    });
    expect(state().error).toBeNull();
    expect(state().isPlaying).toBe(true);
  });

  it('ignores stale errors from a detached video while a replacement loads', async () => {
    const first = new File(['a'], 'first.webm');
    const { unmount } = render(<Harness file={first} />);
    makeReady();
    let rejectPlay: (reason: Error) => void = () => {};
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPlay = reject;
        }),
    );
    fireEvent.click(screen.getByText('Toggle'));
    unmount();
    render(<Harness file={new File(['b'], 'second.webm')} />);
    await act(async () => rejectPlay(new Error('Old request')));
    expect(state().error).toBeNull();
    expect(state().status).toBe('loading');
  });
});
