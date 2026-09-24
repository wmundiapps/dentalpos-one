export function Stars({ value, count, compact }: { value?: number | null; count?: number; compact?: boolean }) {
  if (!value) return null;
  return (
    <span className="stars" aria-label={`${value.toFixed(2)} / 5`}>
      ★ {value.toFixed(compact ? 1 : 2)}{count !== undefined && <span className="muted"> ({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="star-input" role="radiogroup" aria-label={label}>
      <span className="star-label">{label}</span>
      <span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n}`}>★</button>
        ))}
      </span>
    </div>
  );
}
