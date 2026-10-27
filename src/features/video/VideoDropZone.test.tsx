import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoDropZone } from './VideoDropZone';

function setup() {
  const onLoad = vi.fn();
  render(
    <VideoDropZone hasVideo loading={false} onLoad={onLoad}>
      <span data-testid="child">Preview content</span>
    </VideoDropZone>,
  );
  return { zone: screen.getByRole('region', { name: 'Video drop zone' }), onLoad };
}

function fileTransfer(files: File[]) {
  return { dataTransfer: { types: ['Files'], files, dropEffect: 'none' } };
}

describe('video file drops', () => {
  it('keeps the highlight while crossing nested preview content and clears it on exit', () => {
    const { zone } = setup();
    const transfer = fileTransfer([]);
    fireEvent.dragEnter(zone, transfer);
    fireEvent.dragEnter(screen.getByTestId('child'), transfer);
    fireEvent.dragLeave(screen.getByTestId('child'), transfer);
    expect(zone).toHaveClass('is-dragging');
    fireEvent.dragLeave(zone, transfer);
    expect(zone).not.toHaveClass('is-dragging');
  });

  it.each([
    ['clip.webm', 'video/webm'],
    ['clip.MP4', ''],
    ['clip.mov', 'application/octet-stream'],
  ])('loads one video with supported identification: %s (%s)', (name, type) => {
    const { zone, onLoad } = setup();
    const file = new File(['video'], name, { type });
    fireEvent.dragEnter(zone, fileTransfer([file]));
    fireEvent.drop(zone, fileTransfer([file]));
    expect(onLoad).toHaveBeenCalledExactlyOnceWith(file);
    expect(zone).not.toHaveClass('is-dragging');
  });

  it('rejects other files and allows recovery without replacing the current source', () => {
    const { zone, onLoad } = setup();
    fireEvent.drop(zone, fileTransfer([new File(['text'], 'notes.txt', { type: 'text/plain' })]));
    expect(screen.getByRole('alert')).toHaveTextContent('video file');
    expect(onLoad).not.toHaveBeenCalled();
    const video = new File(['video'], 'clip.webm', { type: 'video/webm' });
    fireEvent.drop(zone, fileTransfer([video]));
    expect(onLoad).toHaveBeenCalledExactlyOnceWith(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([0, 2])('rejects %s files instead of guessing which clip to use', (count) => {
    const { zone, onLoad } = setup();
    const files = Array.from(
      { length: count },
      (_, index) => new File(['video'], `${index}.webm`, { type: 'video/webm' }),
    );
    fireEvent.drop(zone, fileTransfer(files));
    expect(screen.getByRole('alert')).toHaveTextContent('one video at a time');
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('ignores text drags and prevents the default browser action for files dropped outside', () => {
    const { zone, onLoad } = setup();
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(zone).not.toHaveClass('is-dragging');
    expect(fireEvent.drop(document.body, fileTransfer([new File(['text'], 'notes.txt')]))).toBe(
      false,
    );
    expect(onLoad).not.toHaveBeenCalled();
  });
});
