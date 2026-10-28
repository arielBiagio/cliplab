import { Icon, type IconName } from '../../shared/Icon';
import { AdjustmentSlider } from './AdjustmentSlider';
import { PresetPicker } from './PresetPicker';
import { DEFAULT_ADJUSTMENTS, findPreset } from './presets';
import { LutPanel } from '../luts/LutPanel';
import type { CubeLut, LutState } from '../luts/types';
import type { HistoryAction } from './historyReducer';
import type { AdjustmentKey, Adjustments } from './types';
import type { Dispatch } from 'react';
import { ColorMixerPanel } from './ColorMixerPanel';
import { changedColorBands, type ColorMixerState } from './colorMixer';
import { ADJUSTMENT_GROUPS } from './adjustmentGroups';

interface Props {
  adjustments: Adjustments;
  lut: LutState;
  colorMixer: ColorMixerState;
  disabled: boolean;
  graphicsReady: boolean;
  dispatch: Dispatch<HistoryAction>;
  initialLibrary?: CubeLut[];
  onLibraryChange?: (library: CubeLut[]) => void;
}

export function EffectsPanel({
  adjustments,
  lut,
  colorMixer,
  disabled,
  graphicsReady,
  dispatch,
  initialLibrary,
  onLibraryChange,
}: Props) {
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
        <LutPanel
          lut={lut}
          disabled={disabled}
          graphicsReady={graphicsReady}
          dispatch={dispatch}
          initialLibrary={initialLibrary}
          onLibraryChange={onLibraryChange}
        />
        <div className="section-title adjustment-toolbar">
          <h3>Adjustments</h3>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => dispatch({ type: 'reset' })}
          >
            <Icon name="restart" width="12" height="12" />
            Reset
          </button>
        </div>
        <div className="adjustment-groups">
          {ADJUSTMENT_GROUPS.map((group) => {
            const groupControls = controls.filter((control) =>
              (group.keys as readonly AdjustmentKey[]).includes(control.key),
            );
            const changed = groupControls.filter(
              (control) => adjustments[control.key] !== DEFAULT_ADJUSTMENTS[control.key],
            ).length;
            return (
              <div className="adjustment-category" key={group.id}>
                <details
                  className="adjustment-group"
                  data-group={group.id}
                  open={group.id === 'light'}
                >
                  <summary>
                    <Icon name={group.icon} width="16" height="16" />
                    <span>{group.label}</span>
                    <span className="group-status">
                      {changed ? `${changed} edited` : 'Neutral'}
                    </span>
                    <Icon name="arrow" width="14" height="14" className="group-chevron" />
                  </summary>
                  <div className="adjustments">
                    {groupControls.map((control) => (
                      <AdjustmentSlider
                        key={control.key}
                        name={control.name}
                        icon={control.icon}
                        value={adjustments[control.key]}
                        min={control.min}
                        max={control.max}
                        unit={control.unit}
                        step={control.step}
                        resetValue={DEFAULT_ADJUSTMENTS[control.key]}
                        description={control.description}
                        minLabel={control.minLabel}
                        maxLabel={control.maxLabel}
                        disabled={disabled || (!!control.requiresGraphics && !graphicsReady)}
                        onPreview={(value) =>
                          dispatch({
                            type: 'preview',
                            adjustments: { ...adjustments, [control.key]: value },
                          })
                        }
                        onCommit={() => dispatch({ type: 'commit' })}
                        onCancel={() => dispatch({ type: 'cancel' })}
                      />
                    ))}
                  </div>
                </details>
                <button
                  type="button"
                  className="text-button category-reset"
                  aria-label={`Reset ${group.label}`}
                  disabled={disabled || changed === 0}
                  onClick={() => dispatch({ type: 'resetAdjustmentGroup', group: group.id })}
                >
                  <Icon name="restart" width="12" height="12" /> Reset
                </button>
              </div>
            );
          })}
          <ColorMixerPanel
            values={colorMixer}
            disabled={disabled}
            graphicsReady={graphicsReady}
            dispatch={dispatch}
          />
        </div>
        <PresetPicker
          adjustments={adjustments}
          disabled={disabled}
          onApply={(values) => dispatch({ type: 'apply', adjustments: values })}
        />
        <div className="active-look">
          <span className="status-dot" />
          <span>Current look</span>
          <strong>
            {(lut.source && lut.enabled && lut.intensity > 0) || changedColorBands(colorMixer) > 0
              ? 'Custom'
              : (findPreset(adjustments)?.label ?? 'Custom')}
          </strong>
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
