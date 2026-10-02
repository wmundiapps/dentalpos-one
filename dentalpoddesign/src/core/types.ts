// Modelo de dados do DentalPod Design.
// Unidades: milímetros no espaço do dente/arco; pixels no espaço da foto.

export type ArchId = 'upper' | 'lower'

/** Situação de cada dente no planejamento. Só dentes "desenhados" aparecem no overlay/3D. */
export type ToothStatus =
  | 'natural' // dente natural mantido (não desenhado; aparece fantasma)
  | 'veneer' // faceta / lente de contato
  | 'crown' // coroa total
  | 'pontic' // pôntico de ponte fixa
  | 'implant' // coroa sobre implante
  | 'denture' // dente de prótese removível (parcial ou total)
  | 'missing' // ausente, sem reposição
  | 'extraction' // a extrair

export const DESIGNED_STATUS: ToothStatus[] = ['veneer', 'crown', 'pontic', 'implant', 'denture']

export type ShapeId = 'ovoid' | 'square' | 'triangular' | 'rectangular' | 'round' | 'natural'
export type SizeSetId = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'custom'
export type ProportionId = 'natural' | 'golden' | 'red' | 'preston' | 'chu'
export type ArchFormId = 'tapered' | 'ovoid' | 'square'
export type RestorationMode = 'veneers' | 'crowns' | 'partial' | 'complete' | 'custom'

export interface Pt {
  x: number
  y: number
}

/** Ajustes individuais por dente (todos neutros por padrão). */
export interface ToothCfg {
  status: ToothStatus
  dx: number // mm, deslocamento mesio-distal (+ = para distal)
  dy: number // mm, deslocamento vertical (+ = incisal/oclusal)
  dz: number // mm, deslocamento vestibular (+ = para vestibular)
  w: number // multiplicador de largura
  h: number // multiplicador de comprimento
  bl: number // multiplicador de espessura vestíbulo-lingual
  tip: number // graus, angulação mesio-distal extra (+ = cervical para distal)
  torque: number // graus, inclinação vestíbulo-lingual extra
  rot: number // graus, rotação no plano oclusal
  shade?: string
  shape?: ShapeId
  locked?: boolean
}

export interface DesignParams {
  mode: RestorationMode
  shape: ShapeId
  sizeSet: SizeSetId
  centralWidth: number // mm (largura real do incisivo central)
  wl: number // razão largura/comprimento do central (0.65–1.0)
  proportion: ProportionId
  redPct: number // 0.60–0.85
  archForm: ArchFormId
  archScale: number
  archDepth: number
  smileArc: number // fator da curva do sorriso (mm no 2º pré-molar ≈ 2*fator)
  sex: number // -1 feminino … +1 masculino
  age: number // 0 jovem … 1 idoso
  personality: number // -1 suave … +1 vigoroso
  shade: string
  lowerShade: string
  translucency: number
  mamelons: number
  texture: number
  gloss: number
  upperTo: number // último dente desenhado por hemiarco (3 = canino, 5 = 2º PM, 7 = 2º molar)
  lowerEnabled: boolean
  lowerTo: number
  overbite: number // mm
  overjet: number // mm
  rollOffset: number // graus em relação à linha bipupilar
  yaw: number // graus (fotos oblíquas)
  pitch: number
  midlineShift: number // mm
  cameraDistance: number // mm (perspectiva da foto)
  incisalOffset: number // mm — desloca verticalmente todo o plano incisal
  tipScale: number // intensidade da angulação (0–1.5)
  torqueScale: number
  contactTightness: number // mm (negativo = sobreposição)
}

/** Parâmetros de renderização / aparência, independentes da geometria. */
export interface LookParams {
  exposure: number
  mouthShadow: number // sombreamento do corredor bucal
  feather: number // px
  opacity: number
  outline: boolean
  showTeeth: boolean
  eraseOld: boolean // escurece o espaço dos dentes originais ao redor do desenho
}

export interface Variant {
  id: string
  name: string
  params: DesignParams
  teeth: Record<number, ToothCfg>
  look: LookParams
  /** Ponto (px) do ponto de contato incisal entre os incisivos centrais superiores. */
  anchor: Pt | null
  note?: string
}

export type PhotoKind = 'smile' | 'face' | 'rest' | 'retracted' | 'profile' | 'occlusal' | 'other'

export interface PhotoMeta {
  id: string
  kind: PhotoKind
  name: string
  width: number
  height: number
}

export interface Marks {
  pupilR?: Pt // pupila do olho direito do paciente (lado esquerdo da imagem)
  pupilL?: Pt
  midTop?: Pt // glabela / násio
  midBottom?: Pt // mento / filtro
  commR?: Pt // comissuras
  commL?: Pt
  upMid?: Pt // borda inferior do lábio superior (linha média)
  lowMid?: Pt // borda superior do lábio inferior (linha média)
  mouth?: Pt[] // contorno interno dos lábios (spline fechada)
  alarR?: Pt
  alarL?: Pt
  zygR?: Pt
  zygL?: Pt
  calibA?: Pt
  calibB?: Pt
  gumLine?: Pt[] // linha gengival real (opcional)
  lowerLipCurve?: Pt[] // borda superior do lábio inferior (opcional, p/ arco do sorriso)
}

export type CalibMethod = 'ipd' | 'twoPoints' | 'manual'

export interface Calibration {
  method: CalibMethod
  pxPerMm: number
  ipdMm: number
  refMm: number
}

export interface ImportedModel {
  id: string
  name: string
  arch: ArchId | 'bite'
  triangles: number
  /** posição/rotação/escala manual (mm, graus) */
  tx: number
  ty: number
  tz: number
  rx: number
  ry: number
  rz: number
  scale: number
  opacity: number
  visible: boolean
}

export interface ExportSettings {
  format: 'stl' | 'obj' | 'ply' | '3mf'
  binary: boolean
  quality: 'draft' | 'standard' | 'high'
  product: 'wax' | 'veneerShell' | 'hollowCrown' | 'solid'
  shellThickness: number
  gap: number // folga de cimentação / sockets (mm)
  includeBase: boolean
  splitTeeth: boolean
  merge: boolean // união booleana (monobloco)
  orientation: 'clinical' | 'print'
  pin: boolean
  scaleToModel: boolean
}

export interface DenturePlan {
  baseThickness: number
  flangeHeight: number
  palatal: 'plate' | 'strap' | 'none'
  lowerConnector: 'lingualBar' | 'horseshoe' | 'none'
  clasps: boolean
  festoon: number
  baseColor: string
}

export interface Project {
  id: string
  version: number
  name: string
  patient: { name: string; age?: number; sex?: 'F' | 'M'; hostId?: string; notes?: string }
  createdAt: number
  updatedAt: number
  photos: PhotoMeta[]
  basePhotoId: string | null
  marks: Marks
  calib: Calibration
  variants: Variant[]
  activeVariant: string
  models: ImportedModel[]
  export: ExportSettings
  denture: DenturePlan
  notes: string
  demo?: boolean
}

export type Tri = [number, number, number]
