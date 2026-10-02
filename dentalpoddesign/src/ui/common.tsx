import type { ReactNode } from 'react'

export function Section({ title, tag, children }: { title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <div className="sec">
      <h3>
        <span>{title}</span>
        {tag ? <span className="tag">{tag}</span> : null}
      </h3>
      {children}
    </div>
  )
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  digits?: number
  title?: string
}) {
  const { label, value, min, max, step = 0.1, onChange, unit = '', digits = 1, title } = props
  return (
    <div className="row" title={title}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="val">
        {value.toFixed(digits).replace('.', ',')}
        {unit}
      </span>
    </div>
  )
}

export function Seg<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} title={o.title} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      <span style={{ flex: 1 }}>{label}</span>
    </label>
  )
}

const P = (d: string) => <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
export const Icons = {
  cases: <svg viewBox="0 0 24 24">{P('M3 7h7l2 2h9v10H3z')}</svg>,
  photo: <svg viewBox="0 0 24 24">{P('M4 7h3l2-2h6l2 2h3v12H4z')}<circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>,
  analysis: <svg viewBox="0 0 24 24">{P('M12 3v18M3 12h18M6 6l12 12')}<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>,
  design: <svg viewBox="0 0 24 24">{P('M12 4c-4 0-6 1.5-6.5 5 -.5 4 1.5 6 2 9 .3 2 1.2 3 2.2 3s1-3.5 2.3-3.5 1.3 3.5 2.3 3.5 1.9-1 2.2-3c.5-3 2.5-5 2-9C18 5.5 16 4 12 4z')}</svg>,
  cad: <svg viewBox="0 0 24 24">{P('M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5')}</svg>,
  plan: <svg viewBox="0 0 24 24">{P('M5 4h14v16H5z M8 9h8 M8 13h8 M8 17h5')}</svg>,
  present: <svg viewBox="0 0 24 24">{P('M3 5h18v11H3z M8 20h8 M12 16v4 M7 12l3-3 3 2 4-4')}</svg>,
  export: <svg viewBox="0 0 24 24">{P('M12 3v12 M7 10l5 5 5-5 M4 20h16')}</svg>,
  undo: <svg viewBox="0 0 24 24" width="18" height="18">{P('M9 7L4 12l5 5 M4 12h10a6 6 0 010 12')}</svg>,
  redo: <svg viewBox="0 0 24 24" width="18" height="18">{P('M15 7l5 5-5 5 M20 12H10a6 6 0 000 12')}</svg>,
}

export const downloadBlob = (blob: Blob, name: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1500)
}

export const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',')
