import { Box, Button, Chip, Typography } from '@mui/material'

interface Props {
  /** Dentes da dentição atual, na ordem do odontograma (arcada superior, depois a inferior). */
  teeth: number[]
  value: number[]
  onChange: (next: number[]) => void
  label?: string
}

// Escolha de vários dentes de uma vez (boca toda, arcada superior ou inferior) ou um a um.
export default function TeethPicker({ teeth, value, onChange, label = 'Dentes' }: Props) {
  const half = Math.ceil(teeth.length / 2)
  const upper = teeth.slice(0, half), lower = teeth.slice(half)
  const set = new Set(value)
  const order = (list: number[]) => teeth.filter((t) => list.includes(t))
  const toggle = (t: number) => onChange(order(set.has(t) ? value.filter((x) => x !== t) : [...value, t]))
  const addAll = (list: number[]) => onChange(order([...value, ...list]))
  const row = (list: number[]) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {list.map((t) => (
        <Chip key={t} size="small" label={t} clickable color={set.has(t) ? 'primary' : 'default'} variant={set.has(t) ? 'filled' : 'outlined'} onClick={() => toggle(t)} sx={{ fontWeight: 700, minWidth: 40 }} />
      ))}
    </Box>
  )
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800 }}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{value.length ? `${value.length} selecionado(s): ${value.join(', ')}` : 'Toque nos dentes ou use os atalhos.'}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" onClick={() => onChange(teeth)}>Boca toda</Button>
        <Button size="small" variant="outlined" onClick={() => addAll(upper)}>Arcada superior</Button>
        <Button size="small" variant="outlined" onClick={() => addAll(lower)}>Arcada inferior</Button>
        <Button size="small" disabled={!value.length} onClick={() => onChange([])}>Limpar</Button>
      </Box>
      {row(upper)}
      {row(lower)}
    </Box>
  )
}
