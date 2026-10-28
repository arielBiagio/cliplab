import { useEffect, useRef, useState, type Dispatch } from 'react';
import { AdjustmentSlider } from '../editing/AdjustmentSlider';
import type { HistoryAction } from '../editing/historyReducer';
import { Icon } from '../../shared/Icon';
import { LUT_SIZE_ERROR, MAX_LUT_BYTES, parseCube } from './parseCube';
import type { CubeLut, LutState } from './types';
import { addToLutLibrary, LUT_LIBRARY_LIMIT } from './lutLibrary';

interface Props {
  lut: LutState;
  disabled: boolean;
  graphicsReady: boolean;
  dispatch: Dispatch<HistoryAction>;
  initialLibrary?: CubeLut[];
  onLibraryChange?: (library: CubeLut[]) => void;
}

export function LutPanel({
  lut,
  disabled,
  graphicsReady,
  dispatch,
  initialLibrary = [],
  onLibraryChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLUListElement>(null);
  const requestRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<CubeLut[]>(initialLibrary);
  const restored = lut.source && !library.includes(lut.source) ? lut.source : null;
  const choices = restored ? [...library, restored] : library;
  const selectedIndex = lut.source ? choices.indexOf(lut.source) : -1;
  const locked = disabled || !graphicsReady || loading;

  function updateLibrary(next: CubeLut[]) {
    setLibrary(next);
    onLibraryChange?.(next);
  }

  useEffect(() => {
    const gallery = galleryRef.current;
    const selected = gallery?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!gallery || !selected) return;
    const bounds = gallery.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    if (card.top < bounds.top) gallery.scrollTop += card.top - bounds.top;
    else if (card.bottom > bounds.bottom) gallery.scrollTop += card.bottom - bounds.bottom;
  }, [lut.source]);

  function choose(source: CubeLut) {
    dispatch({ type: 'selectLut', source, preserveIntensity: true });
  }
  function removeSelected() {
    const remaining = choices.filter((source) => source !== lut.source);
    const next = remaining[Math.min(selectedIndex, remaining.length - 1)];
    updateLibrary(library.filter((source) => source !== lut.source));
    setError(null);
    if (next) choose(next);
    else dispatch({ type: 'removeLut' });
  }
  function step(direction: number) {
    const index =
      selectedIndex < 0
        ? direction > 0
          ? 0
          : choices.length - 1
        : (selectedIndex + direction + choices.length) % choices.length;
    if (choices[index]) choose(choices[index]);
  }
  useEffect(
    () => () => {
      requestRef.current++;
    },
    [],
  );

  async function load(files: File[]) {
    const request = ++requestRef.current;
    setError(null);
    setLoading(true);
    let readingName = '';
    try {
      if (files.length > LUT_LIBRARY_LIMIT)
        throw new Error(`Choose up to ${LUT_LIBRARY_LIMIT} LUT files at once.`);
      const imported: CubeLut[] = [];
      for (const file of files) {
        readingName = file.name;
        if (!/\.cube$/i.test(file.name)) throw new Error('Choose a .cube LUT file.');
        if (file.size > MAX_LUT_BYTES) throw new Error(LUT_SIZE_ERROR);
        const text = await file.text();
        if (request !== requestRef.current) return;
        imported.push(parseCube(text, file.name));
      }
      if (request !== requestRef.current) return;
      readingName = '';
      const next = addToLutLibrary(library, imported);
      const source = next.selected[0];
      if (!source) return;
      updateLibrary(next.library);
      dispatch({ type: 'selectLut', source });
    } catch (reason) {
      if (request === requestRef.current)
        setError(
          `${readingName ? `${readingName}: ` : ''}${reason instanceof Error ? reason.message : 'Unable to read this LUT. Try another file.'}`,
        );
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  return (
    <section className="lut-panel" aria-labelledby="lut-heading" aria-busy={loading}>
      <div className="section-title">
        <h3 id="lut-heading">LUT</h3>
        <button
          className="text-button"
          type="button"
          disabled={disabled || !graphicsReady || loading}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" width="12" height="12" />
          {loading ? 'Loading LUTs…' : 'Load LUTs'}
        </button>
      </div>
      <input
        className="visually-hidden"
        ref={inputRef}
        type="file"
        accept=".cube"
        multiple
        aria-label="Choose LUT file"
        tabIndex={-1}
        disabled={disabled || !graphicsReady || loading}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) void load(files);
        }}
      />
      <div role="status" className="visually-hidden">
        {loading
          ? 'Reading LUT files locally.'
          : lut.source
            ? `${lut.enabled ? 'Active' : 'Bypassed'} LUT: ${lut.source.name}.`
            : 'No LUT active.'}
      </div>
      {error && (
        <p role="alert" className="lut-error">
          {error} Your current look was kept.
        </p>
      )}
      {choices.length > 0 && (
        <div className="lut-library">
          <div className="section-title">
            <h4>
              Gallery <span className="lut-count">{choices.length}</span>
            </h4>
            {choices.length > 0 && (
              <button
                className="text-button clear-lut-library"
                type="button"
                disabled={disabled || loading}
                onClick={() => {
                  updateLibrary([]);
                  setError(null);
                  dispatch({ type: 'removeLut' });
                }}
              >
                Clear gallery
              </button>
            )}
          </div>
          <div className="lut-library-navigation" aria-label="LUT navigation">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous LUT"
              disabled={locked || (choices.length < 2 && selectedIndex >= 0)}
              onClick={() => step(-1)}
            >
              <Icon name="arrow" className="lut-previous-icon" width="16" height="16" />
            </button>
            <span>
              {selectedIndex < 0 ? 'Choose a look' : `${selectedIndex + 1} of ${choices.length}`}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Next LUT"
              disabled={locked || (choices.length < 2 && selectedIndex >= 0)}
              onClick={() => step(1)}
            >
              <Icon name="arrow" width="16" height="16" />
            </button>
          </div>
          <ul ref={galleryRef} className="lut-gallery" aria-label="Loaded LUTs">
            {choices.map((source, index) => {
              const selected = source === lut.source;
              return (
                <li key={index}>
                  <button
                    type="button"
                    className={`lut-card ${selected ? 'is-selected' : ''}`}
                    aria-label={`Select LUT: ${source.name}`}
                    aria-pressed={selected}
                    disabled={locked}
                    onClick={() => choose(source)}
                  >
                    <span className="lut-card-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="lut-card-content">
                      <span className="lut-name" title={source.name}>
                        {source.name}
                      </span>
                      {source.fileName && source.fileName !== source.name && (
                        <span className="lut-file-name">{source.fileName}</span>
                      )}
                      <span className="lut-card-state">
                        {selected
                          ? lut.enabled
                            ? 'Selected'
                            : 'Selected · bypassed'
                          : 'Apply look'}
                        {source === restored ? ' · Restored from history' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {lut.source ? (
        <>
          <div className="lut-actions">
            <button
              className="lut-toggle"
              type="button"
              aria-pressed={lut.enabled}
              disabled={locked}
              onClick={() => dispatch({ type: 'toggleLut' })}
            >
              <span className={`status-dot ${lut.enabled ? '' : 'is-off'}`} /> Enable LUT
            </button>
            <button
              className="text-button"
              type="button"
              aria-label="Remove selected LUT"
              disabled={disabled || loading}
              onClick={removeSelected}
            >
              <Icon name="close" width="14" height="14" /> Remove selected
            </button>
          </div>
          <AdjustmentSlider
            name="LUT intensity"
            resetValue={100}
            icon="sliders"
            value={lut.intensity}
            min={0}
            max={100}
            disabled={disabled || !graphicsReady || !lut.enabled || loading}
            onPreview={(intensity) => dispatch({ type: 'previewLutIntensity', intensity })}
            onCommit={() => dispatch({ type: 'commit' })}
            onCancel={() => dispatch({ type: 'cancel' })}
          />
          {!graphicsReady && (
            <p className="lut-help" role="status">
              LUT temporarily bypassed. Your selection is preserved.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
