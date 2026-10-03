import type { Marks, Pt } from './types'
import type { MarkTool } from '../store/store'

export interface MarkDef {
  key: Exclude<MarkTool, null>
  label: string
  hint: string
  color: string
  short: string
  group: 'facial' | 'labial' | 'extra' | 'calib' | 'profile'
}

export const MARK_DEFS: MarkDef[] = [
  { key: 'pupilR', label: 'Pupila direita do paciente', hint: 'Clique no centro da pupila do olho direito do paciente (lado esquerdo da foto).', color: '#38bdf8', short: 'OD', group: 'facial' },
  { key: 'pupilL', label: 'Pupila esquerda do paciente', hint: 'Clique no centro da pupila do olho esquerdo do paciente (lado direito da foto).', color: '#38bdf8', short: 'OE', group: 'facial' },
  { key: 'midTop', label: 'Linha média facial — alto', hint: 'Clique na glabela / ponto entre as sobrancelhas (násio).', color: '#fbbf24', short: 'LM↑', group: 'facial' },
  { key: 'midBottom', label: 'Linha média facial — baixo', hint: 'Clique na ponta do mento (queixo), no centro do rosto.', color: '#fbbf24', short: 'LM↓', group: 'facial' },
  { key: 'commR', label: 'Comissura direita', hint: 'Clique no canto da boca (lado esquerdo da foto).', color: '#fb7185', short: 'CD', group: 'labial' },
  { key: 'commL', label: 'Comissura esquerda', hint: 'Clique no canto da boca (lado direito da foto).', color: '#fb7185', short: 'CE', group: 'labial' },
  { key: 'upMid', label: 'Borda inferior do lábio superior', hint: 'Clique na borda inferior do lábio superior, na linha média.', color: '#f472b6', short: 'LS', group: 'labial' },
  { key: 'lowMid', label: 'Borda superior do lábio inferior', hint: 'Clique na borda superior do lábio inferior, na linha média.', color: '#f472b6', short: 'LI', group: 'labial' },
  { key: 'alarR', label: 'Asa nasal direita', hint: 'Opcional — ponto mais lateral da asa nasal (lado esquerdo da foto).', color: '#a78bfa', short: 'AD', group: 'extra' },
  { key: 'alarL', label: 'Asa nasal esquerda', hint: 'Opcional — ponto mais lateral da asa nasal (lado direito da foto).', color: '#a78bfa', short: 'AE', group: 'extra' },
  { key: 'zygR', label: 'Zigoma direito', hint: 'Opcional — ponto mais lateral da face (arco zigomático) à esquerda da foto.', color: '#a78bfa', short: 'ZD', group: 'extra' },
  { key: 'zygL', label: 'Zigoma esquerdo', hint: 'Opcional — ponto mais lateral da face (arco zigomático) à direita da foto.', color: '#a78bfa', short: 'ZE', group: 'extra' },
  { key: 'calibA', label: 'Calibração — ponto A', hint: 'Clique no 1º extremo de uma medida conhecida (régua, largura do central…).', color: '#34d399', short: 'A', group: 'calib' },
  { key: 'calibB', label: 'Calibração — ponto B', hint: 'Clique no 2º extremo da medida conhecida.', color: '#34d399', short: 'B', group: 'calib' },
  { key: 'profComm', label: 'Perfil — comissura', hint: 'Foto de PERFIL: clique na comissura labial (canto da boca).', color: '#fbbf24', short: 'C', group: 'profile' },
  { key: 'profTragus', label: 'Perfil — trágus', hint: 'Foto de PERFIL: clique no trágus (cartilagem na frente do ouvido).', color: '#fbbf24', short: 'T', group: 'profile' },
]

export const WIZARD_ORDER: Exclude<MarkTool, null>[] = ['pupilR', 'pupilL', 'midTop', 'midBottom', 'commR', 'commL', 'upMid', 'lowMid']

export const getMark = (m: Marks, k: Exclude<MarkTool, null>): Pt | undefined => m[k]
export function setMark(m: Marks, k: Exclude<MarkTool, null>, p: Pt | undefined) {
  ;(m as Record<string, Pt | undefined>)[k] = p
}
