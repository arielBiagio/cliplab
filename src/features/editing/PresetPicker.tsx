import { Icon } from '../../shared/Icon';
import { buildFilter } from './filters';
import { findPreset, PRESETS } from './presets';
import type { Adjustments } from './types';

interface Props {
  adjustments: Adjustments;
  disabled: boolean;
  onApply: (adjustments: Readonly<Adjustments>) => void;
}

export function PresetPicker({ adjustments, disabled, onApply }: Props) {
  const active = findPreset(adjustments);
  return (
    <section className="presets" aria-labelledby="presets-heading">
      <div className="section-title">
        <h3 id="presets-heading">Find your mood</h3>
        <span>{String(PRESETS.length).padStart(2, '0')} PRESETS</span>
      </div>
      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={`preset ${active?.id === preset.id ? 'is-active' : ''}`}
            disabled={disabled}
            aria-pressed={active?.id === preset.id}
            onClick={() => onApply(preset.adjustments)}
            title={preset.description}
          >
            <span
              className="preset-art"
              style={{ filter: buildFilter(preset.adjustments) }}
              aria-hidden="true"
            >
              <span className="landscape-sun" />
              <span className="landscape-far" />
              <span className="landscape-near" />
            </span>
            <span className="preset-name">
              {preset.label}
              {active?.id === preset.id && <Icon name="check" width="14" height="14" />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
