import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from './shortcutStorage';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function setup({ ready = true, suspended = false, canUndo = true, canRedo = true } = {}) {
  const actions = { onToggle: vi.fn(), onSeek: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
  function Harness() {
    const ref = useRef<HTMLElement>(null);
    useKeyboardShortcuts({
      scopeRef: ref,
      preferences: defaultPreferences(),
      ready,
      suspended,
      canUndo,
      canRedo,
      ...actions,
    });
    return (
      <main ref={ref} tabIndex={-1} data-testid="scope">
        <input aria-label="Text" />
        <input type="range" aria-label="Slider" />
        <button>Button</button>
        <section tabIndex={0} data-shortcuts-ignore data-testid="scroll-region">
          Scrollable effects
        </section>
        <div contentEditable suppressContentEditableWarning data-testid="editable">
          Editable
        </div>
      </main>
    );
  }
  render(<Harness />);
  return { ...actions, scope: screen.getByTestId('scope') };
}

describe('workspace shortcuts', () => {
  it('handles playback and held seek, but not held play/pause', () => {
    const actions = setup();
    expect(fireEvent.keyDown(actions.scope, { code: 'Space' })).toBe(false);
    fireEvent.keyDown(actions.scope, { code: 'Space', repeat: true });
    fireEvent.keyDown(actions.scope, { code: 'ArrowLeft', repeat: true });
    fireEvent.keyDown(actions.scope, { code: 'ArrowRight' });
    expect(actions.onToggle).toHaveBeenCalledTimes(1);
    expect(actions.onSeek.mock.calls).toEqual([[-5], [5]]);
  });

  it('preserves native behavior in interactive and editable controls', () => {
    const actions = setup();
    const controls = [
      screen.getByLabelText('Text'),
      screen.getByLabelText('Slider'),
      screen.getByRole('button'),
      screen.getByTestId('editable'),
      screen.getByTestId('scroll-region'),
    ];
    for (const control of controls) {
      expect(fireEvent.keyDown(control, { code: 'Space' })).toBe(true);
      expect(fireEvent.keyDown(control, { code: 'ArrowRight' })).toBe(true);
    }
    expect(actions.onToggle).not.toHaveBeenCalled();
    expect(actions.onSeek).not.toHaveBeenCalled();
  });

  it('does not intercept unsupported browser combinations or keys outside the workspace', () => {
    const actions = setup();
    expect(fireEvent.keyDown(actions.scope, { code: 'Space', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(actions.scope, { code: 'Space', altKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { code: 'Space' })).toBe(true);
    expect(actions.onToggle).not.toHaveBeenCalled();
  });

  it('supports fixed undo / redo combinations', () => {
    const actions = setup();
    fireEvent.keyDown(actions.scope, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(actions.scope, { key: 'Z', metaKey: true, shiftKey: true });
    fireEvent.keyDown(actions.scope, { key: 'y', ctrlKey: true });
    expect(actions.onUndo).toHaveBeenCalledTimes(1);
    expect(actions.onRedo).toHaveBeenCalledTimes(2);
  });

  it.each([{ ready: false }, { suspended: true }])(
    'disables playback shortcuts when %o',
    (options) => {
      const actions = setup(options);
      expect(fireEvent.keyDown(actions.scope, { code: 'Space' })).toBe(true);
      expect(actions.onToggle).not.toHaveBeenCalled();
    },
  );

  it('does not prevent browser undo when there is no editable history', () => {
    const actions = setup({ canUndo: false, canRedo: false });
    expect(fireEvent.keyDown(actions.scope, { key: 'z', ctrlKey: true })).toBe(true);
    expect(actions.onUndo).not.toHaveBeenCalled();
  });
});
