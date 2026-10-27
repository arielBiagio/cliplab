import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EffectsPanel } from './EffectsPanel';
import { useEditHistory } from './useEditHistory';

function Harness() {
  const { adjustments, dispatch, canUndo } = useEditHistory();
  return (
    <>
      <EffectsPanel adjustments={adjustments} disabled={false} dispatch={dispatch} />
      <button onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo}>
        Undo test
      </button>
    </>
  );
}

describe('effects interactions', () => {
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
