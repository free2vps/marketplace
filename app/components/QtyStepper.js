'use client';

export default function QtyStepper({ value, onChange, max = 99, disabled = false }) {
  const clamp = (n) => Math.max(1, Math.min(Number.isFinite(n) ? n : 1, Math.max(max, 1)));
  return (
    <div className="qty">
      <button type="button" aria-label="Kurangi" onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= 1}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
        aria-label="Jumlah"
      />
      <button type="button" aria-label="Tambah" onClick={() => onChange(clamp(value + 1))} disabled={disabled || value >= max}>
        +
      </button>
    </div>
  );
}
