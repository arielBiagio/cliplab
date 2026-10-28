import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EffectsPanel } from './EffectsPanel';
import { useEditHistory } from './useEditHistory';

function Harness({ graphicsReady = true }: { graphicsReady?: boolean }) {
  const { adjustments, lut, colorMixer, dispatch, canUndo, canRedo } = useEditHistory();
  return (
    <>
      <EffectsPanel
        adjustments={adjustments}
        lut={lut}
        colorMixer={colorMixer}
        dispatch={dispatch}
        disabled={false}
        graphicsReady={graphicsReady}
      />
      <button disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
        Undo test
      </button>
      <button disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
        Redo test
      </button>
    </>
  );
}

describe('Color Mixer interactions', () => {
  it('selects color ranges with the keyboard without creating an edit and keeps each range independent', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('Color Mixer', { exact: true }));
    const green = screen.getByRole('button', { name: 'Green color range' });
    green.focus();
    await user.keyboard('{Enter}');
    expect(green).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Undo test')).toBeDisabled();
    const slider = screen.getByLabelText('Green saturation');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    for (const value of [-10, -30, -60]) fireEvent.change(slider, { target: { value } });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(screen.getByText('Custom', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Blue color range' }));
    expect(screen.getByLabelText('Blue saturation')).toHaveValue('0');
    await user.click(green);
    expect(screen.getByLabelText('Green saturation')).toHaveValue('-60');
    await user.click(screen.getByText('Undo test'));
    expect(screen.getByLabelText('Green saturation')).toHaveValue('0');
    expect(screen.getByText('Undo test')).toBeDisabled();
    await user.click(screen.getByText('Redo test'));
    expect(screen.getByLabelText('Green saturation')).toHaveValue('-60');
  });

  it('cancels a gesture and supports individual and global resets without changing the selected range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('Color Mixer', { exact: true }));
    const slider = screen.getByLabelText('Red hue');
    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.keyDown(slider, { key: 'Escape' });
    expect(slider).toHaveValue('0');
    expect(screen.getByText('Undo test')).toBeDisabled();
    fireEvent.change(slider, { target: { value: '15' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    await user.click(screen.getByRole('button', { name: 'Reset color: Red' }));
    expect(slider).toHaveValue('0');
    await user.click(screen.getByText('Undo test'));
    expect(slider).toHaveValue('15');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(slider).toHaveValue('0');
    expect(screen.getByRole('button', { name: 'Red color range' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByText('Undo test'));
    expect(slider).toHaveValue('15');
  });

  it('preserves mixer settings and disables its sliders while graphics are unavailable', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.click(screen.getByText('Color Mixer', { exact: true }));
    const slider = screen.getByLabelText('Red luminance');
    fireEvent.change(slider, { target: { value: '-40' } });
    fireEvent.blur(slider);
    rerender(<Harness graphicsReady={false} />);
    expect(slider).toBeDisabled();
    expect(slider).toHaveValue('-40');
    expect(screen.getByText(/Color Mixer requires/)).toBeInTheDocument();
    rerender(<Harness />);
    expect(slider).toBeEnabled();
    expect(slider).toHaveValue('-40');
  });
});
