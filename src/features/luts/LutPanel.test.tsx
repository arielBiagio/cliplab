import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useEditHistory } from '../editing/useEditHistory';
import { DEFAULT_LUT_STATE } from './types';
import { LutPanel } from './LutPanel';

const cube = 'TITLE "Local look"\nLUT_3D_SIZE 2\n' + '0 0 0\n'.repeat(8);
function fileWithText(text = cube, name = 'look.cube') {
  const file = new File([text], name);
  Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(text) });
  return file;
}
function Harness({ graphicsReady = true }: { graphicsReady?: boolean }) {
  const { lut, dispatch, canUndo, canRedo } = useEditHistory();
  return (
    <>
      <LutPanel lut={lut} disabled={false} graphicsReady={graphicsReady} dispatch={dispatch} />
      <button disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
        Undo test
      </button>
      <button disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
        Redo test
      </button>
      <button onClick={() => dispatch({ type: 'reset' })}>Reset test</button>
    </>
  );
}
function select(file: File) {
  fireEvent.change(screen.getByLabelText('Choose LUT file'), { target: { files: [file] } });
}
function selectMany(files: File[]) {
  fireEvent.change(screen.getByLabelText('Choose LUT file'), { target: { files } });
}

describe('local LUT controls', () => {
  it('loads a batch and switches with shared intensity while preserving the library across undo and reset', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    selectMany([
      fileWithText(cube.replace('Local look', 'First'), 'first.cube'),
      fileWithText(cube.replace('Local look', 'Second'), 'second.cube'),
    ]);
    await screen.findByText('First', { selector: '.is-selected .lut-name' });
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(2);
    const intensity = screen.getByRole('slider', { name: 'LUT intensity' });
    fireEvent.change(intensity, { target: { value: '40' } });
    fireEvent.keyUp(intensity, { key: 'ArrowLeft' });
    await user.click(screen.getByRole('button', { name: 'Next LUT' }));
    expect(screen.getByText('Second', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
    expect(screen.getByText('Active LUT: Second.')).toHaveAttribute('role', 'status');
    expect(intensity).toHaveValue('40');
    await user.click(screen.getByRole('button', { name: 'Previous LUT' }));
    expect(screen.getByText('First', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
    await user.click(screen.getByText('Undo test'));
    expect(screen.getByText('Second', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(2);
    await user.click(screen.getByText('Reset test'));
    expect(screen.getByRole('button', { name: 'Select LUT: Second' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(intensity).toHaveValue('40');
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Select LUT: First' }));
    expect(screen.getByText('First', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear gallery' }));
    expect(screen.queryByRole('list', { name: 'Loaded LUTs' })).not.toBeInTheDocument();
    await user.click(screen.getByText('Undo test'));
    expect(screen.getByText('First', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
    expect(screen.getByText(/Restored from history/)).toBeInTheDocument();
  });

  it('does not duplicate identical imports or hide the full title and filename', async () => {
    render(<Harness />);
    const title = 'A long readable LUT title '.repeat(5).trim();
    const fileName = 'my-long-file-name-'.repeat(6) + '.cube';
    select(fileWithText(cube.replace('Local look', title), fileName));
    await screen.findByText(title, { selector: '.is-selected .lut-name' });
    expect(screen.getByText(fileName, { selector: '.lut-file-name' })).toBeInTheDocument();
    select(fileWithText(cube.replace('Local look', title), fileName));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load LUTs' })).toBeEnabled());
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(1);
  });

  it('rejects an invalid batch atomically and limits the library without losing the current look', async () => {
    render(<Harness />);
    select(fileWithText());
    await screen.findByText('Local look', { selector: '.is-selected .lut-name' });
    selectMany([
      fileWithText(cube.replace('Local look', 'New')),
      fileWithText('LUT_1D_SIZE 2', 'broken.cube'),
    ]);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('broken.cube'));
    expect(
      screen.getByText('Local look', { selector: '.is-selected .lut-name' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(1);
    selectMany(
      Array.from({ length: 7 }, (_, index) =>
        fileWithText(cube.replace('Local look', `Look ${index}`), `${index}.cube`),
      ),
    );
    await screen.findByText('Look 0', { selector: '.is-selected .lut-name' });
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(8);
    select(fileWithText(cube.replace('Local look', 'Ninth'), 'ninth.cube'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('clear the gallery'));
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(8);
    expect(screen.getByText('Look 0', { selector: '.is-selected .lut-name' })).toBeInTheDocument();
  });
  it('loads a file, groups intensity changes and supports toggle, remove, reset and undo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    select(fileWithText());
    await screen.findByText('Local look', { selector: '.is-selected .lut-name' });
    const slider = screen.getByRole('slider', { name: 'LUT intensity' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    for (const value of ['90', '60', '30']) fireEvent.change(slider, { target: { value } });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    await user.click(screen.getByText('Undo test'));
    expect(slider).toHaveValue('100');
    await user.click(screen.getByText('Redo test'));
    expect(slider).toHaveValue('30');
    await user.click(screen.getByRole('button', { name: 'Enable LUT' }));
    expect(slider).toBeDisabled();
    await user.click(screen.getByText('Undo test'));
    expect(slider).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove selected LUT' }));
    expect(screen.getByText('No LUT active.')).toHaveAttribute('role', 'status');
    await user.click(screen.getByText('Undo test'));
    expect(screen.getByRole('slider', { name: 'LUT intensity' })).toHaveValue('30');
    await user.click(screen.getByText('Reset test'));
    expect(screen.getByRole('slider', { name: 'LUT intensity' })).toHaveValue('30');
    expect(screen.getByRole('button', { name: 'Select LUT: Local look' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('removes only the selected card, selects a neighbor and frees space for another import', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    selectMany(
      ['First', 'Second', 'Third'].map((name) =>
        fileWithText(cube.replace('Local look', name), `${name}.cube`),
      ),
    );
    const second = await screen.findByRole('button', { name: 'Select LUT: Second' });
    second.focus();
    await user.keyboard('{Enter}');
    expect(second).toHaveAttribute('aria-pressed', 'true');
    const intensity = screen.getByRole('slider', { name: 'LUT intensity' });
    fireEvent.change(intensity, { target: { value: '40' } });
    fireEvent.keyUp(intensity, { key: 'ArrowLeft' });
    await user.click(screen.getByRole('button', { name: 'Remove selected LUT' }));
    expect(screen.queryByRole('button', { name: 'Select LUT: Second' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Select LUT:/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Select LUT: Third' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(intensity).toHaveValue('40');
    await user.click(screen.getByText('Undo test'));
    expect(screen.getByRole('button', { name: 'Select LUT: Second' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Restored from history/)).toBeInTheDocument();
    await user.click(screen.getByText('Redo test'));
    await user.click(screen.getByRole('button', { name: 'Remove selected LUT' }));
    expect(screen.getByRole('button', { name: 'Select LUT: First' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Remove selected LUT' }));
    expect(screen.queryByRole('list', { name: 'Loaded LUTs' })).not.toBeInTheDocument();
    expect(screen.getByText('No LUT active.')).toHaveAttribute('role', 'status');
    select(fileWithText());
    await screen.findByRole('button', { name: 'Select LUT: Local look', pressed: true });
    expect(screen.queryByText(/points ·/)).not.toBeInTheDocument();
    expect(screen.queryByText('No LUT loaded')).not.toBeInTheDocument();
  });

  it('keeps the current LUT on validation and file reading errors', async () => {
    render(<Harness />);
    select(fileWithText());
    await screen.findByText('Local look', { selector: '.is-selected .lut-name' });
    select(fileWithText('LUT_1D_SIZE 2'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('1D and combined'));
    expect(
      screen.getByText('Local look', { selector: '.is-selected .lut-name' }),
    ).toBeInTheDocument();
    const unreadable = new File([], 'unreadable.cube');
    Object.defineProperty(unreadable, 'text', {
      value: vi.fn().mockRejectedValue(new Error('Read failed')),
    });
    select(unreadable);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Read failed'));
    expect(
      screen.getByText('Local look', { selector: '.is-selected .lut-name' }),
    ).toBeInTheDocument();
  });

  it('disables GPU controls on fallback but preserves the selection and permits removal', async () => {
    const { rerender } = render(<Harness />);
    select(fileWithText());
    await screen.findByText('Local look', { selector: '.is-selected .lut-name' });
    rerender(<Harness graphicsReady={false} />);
    expect(screen.getByRole('button', { name: 'Load LUTs' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'LUT intensity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove selected LUT' })).toBeEnabled();
    expect(screen.getByText(/LUT temporarily bypassed/)).toBeInTheDocument();
    rerender(<Harness />);
    expect(screen.getByRole('slider', { name: 'LUT intensity' })).toHaveValue('100');
  });

  it('ignores a late file read after the video session is replaced', async () => {
    let finish!: (text: string) => void;
    const file = new File([], 'slow.cube');
    Object.defineProperty(file, 'text', {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    const dispatch = vi.fn();
    const { unmount } = render(
      <LutPanel lut={DEFAULT_LUT_STATE} disabled={false} graphicsReady dispatch={dispatch} />,
    );
    select(file);
    expect(screen.getByRole('button', { name: 'Loading LUTs…' })).toBeDisabled();
    unmount();
    finish(cube);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects wrong extensions and large files before reading their contents', async () => {
    render(<Harness />);
    const wrong = fileWithText(cube, 'look.txt');
    select(wrong);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a .cube'));
    expect(wrong.text).not.toHaveBeenCalled();
    const large = fileWithText();
    Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 + 1 });
    select(large);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('8 MiB'));
    expect(large.text).not.toHaveBeenCalled();
  });

  it('reads files larger than the old 4 MiB cap and accepts exactly 8 MiB', async () => {
    render(<Harness />);
    const atLimit = fileWithText();
    Object.defineProperty(atLimit, 'size', { value: 8 * 1024 * 1024 });
    select(atLimit);
    await screen.findByText('Local look', { selector: '.is-selected .lut-name' });
    expect(atLimit.text).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
