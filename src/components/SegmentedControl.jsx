import { memo } from 'react';

function SegmentedControl({ label, options, value, onChange, compact = false }) {
  return (
    <div className={`segment-wrap ${compact ? 'segment-wrap-compact' : ''}`}>
      {label ? <div className="segment-label">{label}</div> : null}
      <div className="segment">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`segment-btn ${value === option.value ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(SegmentedControl);
