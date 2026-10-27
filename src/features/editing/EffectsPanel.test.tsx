import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EffectsPanel } from './EffectsPanel';
import { useEditHistory } from './useEditHistory';

function Harness({ graphicsReady = true }: { graphicsReady?: boolean }) {
  const { adjustments, dispatch, canUndo, canRedo } = useEditHistory();
  return (
    <>
      <EffectsPanel
        adjustments={adjustments}
        disabled={false}
        graphicsReady={graphicsReady}
        dispatch={dispatch}
      />
      <button onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo}>
        Undo test
      </button>
      <button onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo}>
        Redo test
      </button>
    </>
  );
}

describe('effects interactions', () => {
  it.each(['Shadows', 'Highlights'])(
    'commits a %s gesture as one edit and restores it with redo',
    async (name) => {
      const user = userEvent.setup();
      render(<Harness />);
      const slider = screen.getByLabelText(name);
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
      for (const value of ['10', '30', '50']) fireEvent.change(slider, { target: { value } });
      expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
      fireEvent.keyUp(slider, { key: 'ArrowRight' });
      await user.click(screen.getByRole('button', { name: 'Undo test' }));
      expect(slider).toHaveValue('0');
      expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Redo test' }));
      expect(slider).toHaveValue('50');
    },
  );
  it('groups fractional exposure updates into one gesture and supports redo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const exposure = screen.getByLabelText('Exposure');
    fireEvent.keyDown(exposure, { key: 'ArrowRight' });
    for (const value of ['0.1', '0.2', '0.30000000000004'])
      fireEvent.change(exposure, { target: { value } });
    expect(exposure).toHaveValue('0.3');
    expect(exposure).toHaveAttribute('aria-valuetext', '0.3 exposure stops');
    expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
    fireEvent.keyUp(exposure, { key: 'ArrowRight' });
    await user.click(screen.getByRole('button', { name: 'Undo test' }));
    expect(exposure).toHaveValue('0');
    expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo test' }));
    expect(exposure).toHaveValue('0.3');
  });

  it('disables grading controls without graphics while keeping the original adjustments available', () => {
    const { rerender } = render(<Harness graphicsReady={false} />);
    for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
      expect(screen.getByLabelText(name)).toBeDisabled();
    expect(screen.getByLabelText('Brightness')).toBeEnabled();
    rerender(<Harness />);
    for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
      expect(screen.getByLabelText(name)).toBeEnabled();
  });

  it('resets all grading parameters with a preset and restores the complete look with one undo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (const [name, value] of [
      ['Exposure', '1.1'],
      ['Temperature', '25'],
      ['Tint', '-20'],
      ['Shadows', '35'],
      ['Highlights', '-40'],
    ]) {
      const control = screen.getByLabelText(name);
      fireEvent.change(control, { target: { value } });
      fireEvent.keyUp(control, { key: 'ArrowRight' });
    }
    await user.click(screen.getByRole('button', { name: 'Cinematic' }));
    for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
      expect(screen.getByLabelText(name)).toHaveValue('0');
    await user.click(screen.getByRole('button', { name: 'Undo test' }));
    expect(screen.getByLabelText('Exposure')).toHaveValue('1.1');
    expect(screen.getByLabelText('Temperature')).toHaveValue('25');
    expect(screen.getByLabelText('Tint')).toHaveValue('-20');
    expect(screen.getByLabelText('Shadows')).toHaveValue('35');
    expect(screen.getByLabelText('Highlights')).toHaveValue('-40');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
      expect(screen.getByLabelText(name)).toHaveValue('0');
    await user.click(screen.getByRole('button', { name: 'Undo test' }));
    expect(screen.getByLabelText('Exposure')).toHaveValue('1.1');
  });
  it('keeps presets, sliders, reset and undo synchronized', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Cinematic' }));
    expect(screen.getByLabelText('Brightness')).toHaveValue('105');
    expect(screen.getByLabelText('Contrast')).toHaveValue('115');
    expect(screen.getByLabelText('Saturation')).toHaveValue('85');
    expect(screen.getByRole('button', { name: 'Cinematic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Brightness')).toHaveValue('100');
    await user.click(screen.getByRole('button', { name: 'Undo test' }));
    expect(screen.getByLabelText('Brightness')).toHaveValue('105');
  });

  it('commits repeated keyboard adjustments as one operation', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const brightness = screen.getByLabelText('Brightness');
    fireEvent.keyDown(brightness, { key: 'ArrowRight' });
    fireEvent.change(brightness, { target: { value: '101' } });
    fireEvent.change(brightness, { target: { value: '102' } });
    fireEvent.change(brightness, { target: { value: '103' } });
    expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
    fireEvent.keyUp(brightness, { key: 'ArrowRight' });
    await user.click(screen.getByRole('button', { name: 'Undo test' }));
    expect(brightness).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'Undo test' })).toBeDisabled();
  });

  it('cancels changes with Escape or a cancelled pointer', () => {
    render(<Harness />);
    const brightness = screen.getByLabelText('Brightness');
    fireEvent.change(brightness, { target: { value: '160' } });
    fireEvent.keyDown(brightness, { key: 'Escape' });
    expect(brightness).toHaveValue('100');
    fireEvent.change(brightness, { target: { value: '170' } });
    fireEvent.pointerCancel(brightness);
    expect(brightness).toHaveValue('100');
  });
});
