import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_ADJUSTMENTS } from '../editing/presets';
import { DEFAULT_COLOR_MIXER } from '../editing/colorMixer';
import { DEFAULT_LUT_STATE } from '../luts/types';
import { useSessionPersistence } from './useSessionPersistence';

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), clear: vi.fn() }));
vi.mock('./sessionStorage', () => ({
  createSessionStorage: () => storage,
  sessionStorageError: () => 'Storage failed',
}));
const restored = vi.fn();
const file = new File(['video'], 'test.webm');
function Harness() {
  const session = useSessionPersistence(restored);
  return (
    <>
      <output data-testid="phase">{session.phase}</output>
      <button
        onClick={() => {
          session.beginSession();
          session.updateSnapshot({
            file,
            library: [],
            edit: {
              adjustments: DEFAULT_ADJUSTMENTS,
              colorMixer: DEFAULT_COLOR_MIXER,
              lut: DEFAULT_LUT_STATE,
            },
          });
        }}
      >
        New session
      </button>
      <button onClick={() => session.updatePosition(5)}>Seek</button>
    </>
  );
}
beforeEach(() => {
  storage.read.mockResolvedValue(null);
  storage.write.mockResolvedValue(undefined);
  storage.clear.mockResolvedValue(undefined);
});
it('marks a pending position checkpoint as saving until the write completes', async () => {
  render(<Harness />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('idle'));
  fireEvent.click(screen.getByText('New session'));
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('saved'));
  fireEvent.click(screen.getByText('Seek'));
  expect(screen.getByTestId('phase')).toHaveTextContent('saving');
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('saved'), {
    timeout: 2000,
  });
  expect(storage.write).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 5 }));
});
