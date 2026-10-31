// Small coloured chips for host categories and sender frames. Colours come from config.

/** A host category, e.g. "Gold", tinted with the category colour. */
export function CategoryChip({ category, suffix }) {
  if (!category) return null
  const color = category.color || '#6B7280'
  return (
    <span
      className="a-row a-nowrap"
      style={{
        display: 'inline-flex',
        gap: 6,
        height: 22,
        padding: '0 9px',
        borderRadius: 11,
        fontSize: 12,
        fontWeight: 700,
        color,
        background: `${color}1F`,
        border: `1px solid ${color}55`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      {category.name}
      {suffix ? <span style={{ fontWeight: 600, opacity: 0.85 }}>{suffix}</span> : null}
    </span>
  )
}

/** A sender frame tier; tiers without a colour show as plain text. */
export function FrameChip({ tier }) {
  if (!tier) return null
  if (!tier.color) return <span className="a-muted a-small">{tier.name}</span>
  return <CategoryChip category={tier} />
}

/** Colour swatch + native colour picker + hex text box. */
export function ColorInput({ value, onChange, allowNone, invalid }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <span className="a-row" style={{ gap: 6 }}>
      <label
        title="Pick a colour"
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 8,
          cursor: 'pointer',
          border: '1px solid var(--border-strong)',
          // No colour: an empty, dashed swatch.
          background: value ? hex : 'var(--surface-2)',
          borderStyle: value ? 'solid' : 'dashed',
        }}
      >
        <input
          type="color"
          value={hex}
          onChange={e => onChange(e.target.value.toUpperCase())}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        />
      </label>
      <input
        className="a-input a-mono"
        value={value}
        placeholder={allowNone ? 'None' : '#RRGGBB'}
        maxLength={7}
        onChange={e => onChange(e.target.value.trim())}
        style={{ width: 96, ...(invalid ? { borderColor: 'var(--danger)' } : null) }}
      />
    </span>
  )
}
