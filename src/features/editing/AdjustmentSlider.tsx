import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../../shared/Icon';

interface Props {
  name: string;
  icon: IconName;
  value: number;
  min?: number;
  max?: number;
  unit?: '%' | '°';
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
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: Props) {
  return (
    <div className="adjustment">
      <div className="adjustment-label">
        <label htmlFor={`adjust-${name}`}>
          <Icon name={icon} />
          {name}
        </label>
        <output htmlFor={`adjust-${name}`}>
          {value}
          <span>{unit}</span>
        </output>
      </div>
      <input
        id={`adjust-${name}`}
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        disabled={disabled}
        style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        aria-valuetext={`${value} ${unit === '°' ? 'degrees' : 'percent'}`}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onChange={(event) => onPreview(Number(event.target.value))}
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
        <span>{min}</span>
        <span>{(min + max) / 2}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
