import { Box, Typography } from '@mui/material'
import type { ClinicalState, DentalChartEntry, ToothSurface } from '../types/dentalChart'

export const TODO_COLOR = '#d32f2f'
export const DONE_COLOR = '#111111'
const EMPTY_COLOR = '#ffffff'

export const isDone = (s: ClinicalState) => s === 'COMPLETED'

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]
const UPPER_CHILD = [55,54,53,52,51,61,62,63,64,65]
const LOWER_CHILD = [85,84,83,82,81,71,72,73,74,75]

// vermelho (a fazer) tem prioridade sobre preto (concluído) na mesma face
function faceColor(list: DentalChartEntry[], surface: ToothSurface) {
  const own = list.filter(e => e.surface === surface)
  const whole = list.filter(e => !e.surface)
  const all = [...own, ...whole]
  if (!all.length) return EMPTY_COLOR
  return all.some(e => !isDone(e.clinicalState)) ? TODO_COLOR : DONE_COLOR
}

export function summarize(entries: DentalChartEntry[]) {
  return {
    todo: entries.filter(e => !isDone(e.clinicalState)).length,
    done: entries.filter(e => isDone(e.clinicalState)).length
  }
}

export function OdontogramLegend({ entries }: { entries: DentalChartEntry[] }) {
  const s = summarize(entries)
  const item = (color: string, label: string, n: number, border?: boolean) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
      <Box sx={{ width: 26, height: 26, borderRadius: 1, bgcolor: color, border: border ? '2px solid #777' : '2px solid transparent', flexShrink: 0 }} />
      <Box><Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>{label}</Typography><Typography variant="caption" color="text.secondary">{n} marcação(ões)</Typography></Box>
    </Box>
  )
  return (
    <Box sx={{ display: 'grid', gap: 1.8, minWidth: 190 }}>
      <Typography sx={{ fontWeight: 900 }}>Legenda</Typography>
      {item(TODO_COLOR, 'Vermelho: a fazer', s.todo)}
      {item(DONE_COLOR, 'Preto: concluído', s.done)}
      {item(EMPTY_COLOR, 'Branco: sem marcação', 0, true)}
      <Typography variant="caption" color="text.secondary">Clique no dente para ver o que falta, concluir ou adicionar um procedimento.</Typography>
    </Box>
  )
}

function Tooth({ tooth, list, size, onClick }: { tooth: number; list: DentalChartEntry[]; size: number; onClick: (t: number) => void }) {
  const cell = size / 3
  const faces: [ToothSurface, number, number][] = [['V', 2, 1], ['M', 1, 2], ['O', 2, 2], ['D', 3, 2], ['L', 2, 3]]
  const whole = list.filter(e => !e.surface)
  const wholeColor = whole.length ? (whole.some(e => !isDone(e.clinicalState)) ? TODO_COLOR : DONE_COLOR) : undefined
  const todo = list.filter(e => !isDone(e.clinicalState))
  return (
    <Box onClick={() => onClick(tooth)} sx={{ textAlign: 'center', cursor: 'pointer', p: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
      <Typography sx={{ fontWeight: 900, fontSize: 14, color: todo.length ? TODO_COLOR : 'text.primary' }}>{tooth}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(3,${cell}px)`, gridTemplateRows: `repeat(3,${cell}px)`, justifyContent: 'center', my: 0.4, outline: wholeColor ? `3px solid ${wholeColor}` : 'none', outlineOffset: 2, borderRadius: 1 }}>
        {faces.map(([s, c, r]) => (
          <Box key={s} sx={{ gridColumn: c, gridRow: r, bgcolor: faceColor(list, s), border: '1px solid #555' }} />
        ))}
      </Box>
      {whole.slice(0, 2).map(e => (
        <Typography key={e.id} sx={{ fontSize: 10, fontWeight: 800, lineHeight: 1.15, color: isDone(e.clinicalState) ? DONE_COLOR : TODO_COLOR }}>{e.findingLabel}</Typography>
      ))}
    </Box>
  )
}

export default function OdontogramBoard({ entries, dentition, onToothClick, big }: {
  entries: DentalChartEntry[]; dentition: 'ADULT' | 'CHILD'; onToothClick: (tooth: number) => void; big?: boolean
}) {
  const upper = dentition === 'CHILD' ? UPPER_CHILD : UPPER
  const lower = dentition === 'CHILD' ? LOWER_CHILD : LOWER
  const size = big ? 54 : 36
  const byTooth = (t: number) => entries.filter(e => e.tooth === t && e.dentition === dentition && e.status === 'ACTIVE')
  const row = (teeth: number[]) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${teeth.length}, minmax(0,1fr))`, gap: big ? 1 : 0.5 }}>
      {teeth.map(t => <Tooth key={t} tooth={t} list={byTooth(t)} size={size} onClick={onToothClick} />)}
    </Box>
  )
  return (
    <Box sx={{ display: 'grid', gap: big ? 4 : 2, overflowX: 'auto' }}>
      <Box sx={{ minWidth: 640 }}>{row(upper)}</Box>
      <Box sx={{ minWidth: 640 }}>{row(lower)}</Box>
    </Box>
  )
}
