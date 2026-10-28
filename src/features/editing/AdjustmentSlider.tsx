import { useId, type CSSProperties } from 'react';
import { Icon, type IconName } from '../../shared/Icon';

interface Props {
  name: string;
  icon: IconName;
  value: number;
  min?: number;
  max?: number;
  unit?: '%' | '°' | 'EV' | '';
  step?: number;
  resetValue?: number;
  description?: string;
  minLabel?: string;
  maxLabel?: string;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function AdjustmentSlider({
  name,
  icon,
  value,
  min = 0,
  max = 200,
  unit = '%',
  step = 1,
  resetValue = 0,
  description,
  minLabel,
  maxLabel,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: Props) {
  const id = useId();
  return (
    <div className="adjustment">
      <div className="adjustment-label">
        <label htmlFor={id}>
          <Icon name={icon} />
          {name}
        </label>
        <output htmlFor={id}>
          {step < 1 ? value.toFixed(1) : value}
          <span>{unit}</span>
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        title={`Double-click to reset to ${resetValue}${unit}`}
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        aria-valuetext={`${value}${unit === 'EV' ? ' exposure stops' : unit === '°' ? ' degrees' : unit === '%' ? ' percent' : ''}`}
        aria-describedby={description ? `${id}-description` : undefined}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onChange={(event) => onPreview(Number(event.target.value))}
        onDoubleClick={(event) => {
          if (disabled) return;
          event.preventDefault();
          onPreview(resetValue);
          onCommit();
        }}
        onPointerUp={onCommit}
        onPointerCancel={onCancel}
        onBlur={onCommit}
        onKeyUp={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          )
            onCommit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="range-scale" aria-hidden="true">
        <span>{minLabel ?? min}</span>
        <span>{(min + max) / 2}</span>
        <span>{maxLabel ?? max}</span>
      </div>
      {description && (
        <span id={`${id}-description`} className="visually-hidden">
          {description}
        </span>
      )}
    </div>
  );
}
