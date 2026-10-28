import { useState, type CSSProperties, type Dispatch } from 'react';
import { Icon } from '../../shared/Icon';
import { AdjustmentSlider } from './AdjustmentSlider';
import {
  changedColorBands,
  COLOR_BANDS,
  type ColorBand,
  type ColorBandAdjustments,
  type ColorMixerState,
} from './colorMixer';
import type { HistoryAction } from './historyReducer';

interface Props {
  values: ColorMixerState;
  disabled: boolean;
  graphicsReady: boolean;
  dispatch: Dispatch<HistoryAction>;
}

export function ColorMixerPanel({ values, disabled, graphicsReady, dispatch }: Props) {
  const [selected, setSelected] = useState<ColorBand>('red');
  const band = COLOR_BANDS.find(({ id }) => id === selected)!;
  const changed = changedColorBands(values);
  const controls: {
    key: keyof ColorBandAdjustments;
    label: string;
    icon: 'sliders' | 'drop' | 'sun';
  }[] = [
    { key: 'hue', label: 'Hue', icon: 'sliders' },
    { key: 'saturation', label: 'Saturation', icon: 'drop' },
    { key: 'luminance', label: 'Luminance', icon: 'sun' },
  ];

  return (
    <div className="adjustment-category">
      <details className="adjustment-group color-mixer" data-group="mixer">
        <summary>
          <Icon name="sliders" width="16" height="16" />
          <span>Color Mixer</span>
          <span className="group-status">{changed ? `${changed} edited` : 'Neutral'}</span>
          <Icon name="arrow" width="14" height="14" className="group-chevron" />
        </summary>
        <div className="color-mixer-content">
          <div className="color-swatches" role="group" aria-label="Color ranges">
            {COLOR_BANDS.map(({ id, label, swatch }) => (
              <button
                key={id}
                type="button"
                className="color-swatch"
                aria-label={`${label} color range`}
                aria-pressed={selected === id}
                title={label}
                disabled={disabled}
                style={{ '--swatch': swatch } as CSSProperties}
                onClick={() => setSelected(id)}
              >
                {selected === id && <Icon name="check" width="15" height="15" />}
                {Object.values(values[id]).some((value) => value !== 0) && (
                  <span className="color-swatch-edited" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className="section-title color-band-heading">
            <h4>{band.label}</h4>
            <button
              type="button"
              className="text-button"
              aria-label={`Reset color: ${band.label}`}
              disabled={disabled || !Object.values(values[selected]).some((value) => value !== 0)}
              onClick={() => dispatch({ type: 'resetColorBand', band: selected })}
            >
              <Icon name="restart" width="12" height="12" /> Reset color
            </button>
          </div>
          <div className="adjustments">
            {controls.map(({ key, label, icon }) => (
              <AdjustmentSlider
                key={key}
                name={`${band.label} ${label.toLowerCase()}`}
                icon={icon}
                value={values[selected][key]}
                min={key === 'hue' ? -30 : -100}
                max={key === 'hue' ? 30 : 100}
                unit={key === 'hue' ? '°' : ''}
                disabled={disabled || !graphicsReady}
                onPreview={(value) =>
                  dispatch({ type: 'previewColorMixer', band: selected, key, value })
                }
                onCommit={() => dispatch({ type: 'commit' })}
                onCancel={() => dispatch({ type: 'cancel' })}
              />
            ))}
          </div>
          {!graphicsReady && !disabled && (
            <p className="mixer-warning" role="status">
              Color Mixer requires the graphics preview. Your settings are preserved.
            </p>
          )}
        </div>
      </details>
      <button
        type="button"
        className="text-button category-reset"
        aria-label="Reset Color Mixer"
        disabled={disabled || changed === 0}
        onClick={() => dispatch({ type: 'resetColorMixer' })}
      >
        <Icon name="restart" width="12" height="12" /> Reset
      </button>
    </div>
  );
}
