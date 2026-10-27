import { Icon, type IconName } from '../../shared/Icon';
import { AdjustmentSlider } from './AdjustmentSlider';
import { PresetPicker } from './PresetPicker';
import { DEFAULT_ADJUSTMENTS, findPreset } from './presets';
import type { HistoryAction } from './historyReducer';
import type { AdjustmentKey, Adjustments } from './types';
import type { Dispatch } from 'react';

interface Props {
  adjustments: Adjustments;
  disabled: boolean;
  dispatch: Dispatch<HistoryAction>;
}

export function EffectsPanel({ adjustments, disabled, dispatch }: Props) {
  const controls: {
    key: AdjustmentKey;
    name: string;
    icon: IconName;
    min?: number;
    max?: number;
    unit?: '%' | '°';
  }[] = [
    { key: 'brightness', name: 'Brightness', icon: 'sun' },
    { key: 'contrast', name: 'Contrast', icon: 'contrast' },
    { key: 'saturation', name: 'Saturation', icon: 'drop' },
    { key: 'hue', name: 'Hue', icon: 'sliders', min: -180, max: 180, unit: '°' },
    { key: 'sepia', name: 'Sepia', icon: 'sun', max: 100 },
  ];
  return (
    <aside className="effects-panel panel" aria-labelledby="effects-heading">
      <div className="panel-heading">
        <div className="heading-with-icon">
          <Icon name="sliders" />
          <h2 id="effects-heading">Color studio</h2>
        </div>
      </div>
      <div
        className="effects-content"
        role="region"
        aria-label="Color adjustments and presets"
        tabIndex={0}
        data-shortcuts-ignore
      >
        <div className="section-title">
          <h3>Adjustments</h3>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => dispatch({ type: 'apply', adjustments: DEFAULT_ADJUSTMENTS })}
          >
            <Icon name="restart" width="12" height="12" />
            Reset
          </button>
        </div>
        <div className="adjustments">
          {controls.map((control) => (
            <AdjustmentSlider
              key={control.key}
              name={control.name}
              icon={control.icon}
              value={adjustments[control.key]}
              min={control.min}
              max={control.max}
              unit={control.unit}
              disabled={disabled}
              onPreview={(value) =>
                dispatch({ type: 'preview', adjustments: { ...adjustments, [control.key]: value } })
              }
              onCommit={() => dispatch({ type: 'commit' })}
              onCancel={() => dispatch({ type: 'cancel' })}
            />
          ))}
        </div>
        <PresetPicker
          adjustments={adjustments}
          disabled={disabled}
          onApply={(values) => dispatch({ type: 'apply', adjustments: values })}
        />
        <div className="active-look">
          <span className="status-dot" />
          <span>Current look</span>
          <strong>{findPreset(adjustments)?.label ?? 'Custom'}</strong>
        </div>
        <div className="studio-note">
          <Icon name="info" width="16" height="16" />
          <p>
            Room to experiment. <br />
            Every adjustment can be undone.
          </p>
        </div>
      </div>
    </aside>
  );
}
