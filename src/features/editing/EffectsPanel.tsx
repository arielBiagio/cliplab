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
  graphicsReady: boolean;
  dispatch: Dispatch<HistoryAction>;
}

export function EffectsPanel({ adjustments, disabled, graphicsReady, dispatch }: Props) {
  const controls: {
    key: AdjustmentKey;
    name: string;
    icon: IconName;
    min?: number;
    max?: number;
    unit?: '%' | '°' | 'EV' | '';
    step?: number;
    description?: string;
    minLabel?: string;
    maxLabel?: string;
    requiresGraphics?: boolean;
  }[] = [
    {
      key: 'exposure',
      name: 'Exposure',
      icon: 'sun',
      min: -2,
      max: 2,
      step: 0.1,
      unit: 'EV',
      requiresGraphics: true,
      description:
        'Adjust exposure in stops. Each positive stop doubles linear light. Requires the graphics preview.',
    },
    {
      key: 'shadows',
      name: 'Shadows',
      icon: 'contrast',
      min: -100,
      max: 100,
      unit: '',
      minLabel: 'Darker',
      maxLabel: 'Lighter',
      requiresGraphics: true,
      description: 'Adjust darker areas with a soft luminance mask. Requires the graphics preview.',
    },
    {
      key: 'highlights',
      name: 'Highlights',
      icon: 'sun',
      min: -100,
      max: 100,
      unit: '',
      minLabel: 'Darker',
      maxLabel: 'Lighter',
      requiresGraphics: true,
      description:
        'Adjust brighter areas with a soft luminance mask. Requires the graphics preview.',
    },
    {
      key: 'temperature',
      name: 'Temperature',
      icon: 'sliders',
      min: -100,
      max: 100,
      unit: '',
      minLabel: 'Cool',
      maxLabel: 'Warm',
      requiresGraphics: true,
      description:
        'Move between cooler and warmer colors. This is a relative creative adjustment, not a Kelvin measurement. Requires the graphics preview.',
    },
    {
      key: 'tint',
      name: 'Tint',
      icon: 'drop',
      min: -100,
      max: 100,
      unit: '',
      minLabel: 'Green',
      maxLabel: 'Magenta',
      requiresGraphics: true,
      description: 'Move between green and magenta. Requires the graphics preview.',
    },
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
              step={control.step}
              description={control.description}
              minLabel={control.minLabel}
              maxLabel={control.maxLabel}
              disabled={disabled || (!!control.requiresGraphics && !graphicsReady)}
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
