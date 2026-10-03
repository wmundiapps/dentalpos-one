// Anatomia dental de referência (valores médios — Wheeler/Ash; Andrews 1972/2015 para tip/torque).
import type { Vec3 } from "./math";

export type Jaw = "upper" | "lower";
export type ToothType = "central" | "lateral" | "canine" | "premolar1" | "premolar2" | "molar1" | "molar2" | "molar3";
export const ANTERIOR: ToothType[] = ["central", "lateral", "canine"];
export const isAnterior = (t: ToothType) => ANTERIOR.includes(t);
export const isPosterior = (t: ToothType) => !isAnterior(t);

export interface ToothRef {
  fdi: number;
  jaw: Jaw;
  side: "R" | "L";
  type: ToothType;
  /** posição na hemiarcada: 1 = central … 8 = terceiro molar */
  index: number;
  name: string;
}

const TYPE_ORDER: ToothType[] = ["central", "lateral", "canine", "premolar1", "premolar2", "molar1", "molar2", "molar3"];
const TYPE_NAME: Record<ToothType, string> = {
  central: "Incisivo central", lateral: "Incisivo lateral", canine: "Canino",
  premolar1: "1º pré-molar", premolar2: "2º pré-molar", molar1: "1º molar", molar2: "2º molar", molar3: "3º molar",
};

export function toothRef(fdi: number): ToothRef {
  const q = Math.floor(fdi / 10), index = fdi % 10;
  if (q < 1 || q > 4 || index < 1 || index > 8) throw new Error(`FDI inválido: ${fdi}`);
  const jaw: Jaw = q <= 2 ? "upper" : "lower";
  const side = q === 1 || q === 4 ? "R" : "L";
  const type = TYPE_ORDER[index - 1];
  return { fdi, jaw, side, type, index, name: `${TYPE_NAME[type]} ${jaw === "upper" ? "superior" : "inferior"} ${side === "R" ? "direito" : "esquerdo"}` };
}
export const allFdi = (withThirdMolars = false): number[] => {
  const out: number[] = [];
  for (const q of [1, 2, 3, 4]) for (let i = 1; i <= (withThirdMolars ? 8 : 7); i++) out.push(q * 10 + i);
  return out;
};
export const mirrorFdi = (fdi: number) => {
  const q = Math.floor(fdi / 10);
  const m = { 1: 2, 2: 1, 3: 4, 4: 3 }[q as 1 | 2 | 3 | 4];
  return m * 10 + (fdi % 10);
};
export const antagonistFdi = (fdi: number) => {
  const q = Math.floor(fdi / 10);
  const m = { 1: 4, 2: 3, 3: 2, 4: 1 }[q as 1 | 2 | 3 | 4];
  return m * 10 + (fdi % 10);
};

export interface ToothDims { md: number; bl: number; h: number } // mesiodistal, vestíbulo-lingual, altura de coroa
export const MEAN_DIMS: Record<Jaw, Record<ToothType, ToothDims>> = {
  upper: {
    central: { md: 8.5, bl: 7.0, h: 10.5 }, lateral: { md: 6.5, bl: 6.0, h: 9.0 }, canine: { md: 7.5, bl: 8.0, h: 10.0 },
    premolar1: { md: 7.0, bl: 9.0, h: 8.5 }, premolar2: { md: 6.5, bl: 9.0, h: 8.5 },
    molar1: { md: 10.0, bl: 11.0, h: 7.5 }, molar2: { md: 9.0, bl: 11.0, h: 7.0 }, molar3: { md: 8.5, bl: 10.0, h: 6.5 },
  },
  lower: {
    central: { md: 5.0, bl: 6.0, h: 9.0 }, lateral: { md: 5.5, bl: 6.5, h: 9.5 }, canine: { md: 7.0, bl: 7.5, h: 11.0 },
    premolar1: { md: 7.0, bl: 7.5, h: 8.5 }, premolar2: { md: 7.0, bl: 8.0, h: 8.0 },
    molar1: { md: 11.0, bl: 10.5, h: 7.5 }, molar2: { md: 10.5, bl: 10.0, h: 7.0 }, molar3: { md: 10.0, bl: 9.5, h: 7.0 },
  },
};

/** Norma de Andrews — angulação (tip, ° + = cervical mais distal) e inclinação (torque, ° + = coroa vestibular p/ incisal). */
export const ANDREWS_NORMS: Record<Jaw, Record<ToothType, { tip: number; torque: number }>> = {
  upper: {
    central: { tip: 5, torque: 7 }, lateral: { tip: 9, torque: 3 }, canine: { tip: 11, torque: -7 },
    premolar1: { tip: 2, torque: -7 }, premolar2: { tip: 2, torque: -8 }, molar1: { tip: 5, torque: -10 }, molar2: { tip: 5, torque: -12 }, molar3: { tip: 5, torque: -14 },
  },
  lower: {
    central: { tip: 2, torque: -1 }, lateral: { tip: 2, torque: -1 }, canine: { tip: 5, torque: -11 },
    premolar1: { tip: 2, torque: -17 }, premolar2: { tip: 2, torque: -22 }, molar1: { tip: 2, torque: -30 }, molar2: { tip: 2, torque: -35 }, molar3: { tip: 2, torque: -35 },
  },
};

/**
 * Esquema de alturas de coroa em função de X (mm), conforme o protocolo clínico:
 * superiores: pré-molar = X · 1º molar = X−0,5 · 2º molar = X−1 · canino = X+0,5 · lateral = X · central = X+0,5;
 * inferiores: incisivos e pré-molares = X · molares = X−0,5 · canino = X+0,5.
 */
export const HEIGHT_OFFSETS: Record<Jaw, Record<ToothType, number>> = {
  upper: { central: 0.5, lateral: 0, canine: 0.5, premolar1: 0, premolar2: 0, molar1: -0.5, molar2: -1, molar3: -1.5 },
  lower: { central: 0, lateral: 0, canine: 0.5, premolar1: 0, premolar2: 0, molar1: -0.5, molar2: -0.5, molar3: -1 },
};
export interface HeightScheme { enabled: boolean; xUpper: number; xLower: number }
export const DEFAULT_HEIGHTS: HeightScheme = { enabled: true, xUpper: 9.5, xLower: 9.0 };
export const schemeHeight = (jaw: Jaw, t: ToothType, h: HeightScheme) => (jaw === "upper" ? h.xUpper : h.xLower) + HEIGHT_OFFSETS[jaw][t];

/** Fração do overbite (trespasse vertical) aplicada a cada tipo ao nivelar o plano oclusal superior. */
export const OVERBITE_TAPER: Record<ToothType, number> = {
  central: 1, lateral: 1, canine: 0.8, premolar1: 0.25, premolar2: 0, molar1: 0, molar2: 0, molar3: 0,
};

export interface Landmarks {
  /** pontos no referencial local do dente (x distal+, y vestibular+, z oclusal+) */
  incisalMid: Vec3; // borda incisal / ponta de cúspide principal
  facialEdge: Vec3; // ponto mais vestibular da borda incisal/cúspide vestibular
  lingualEdge: Vec3;
  mesialContact: Vec3;
  distalContact: Vec3;
  cervicalFacial: Vec3; // zênite gengival (vestibular)
  cervicalCenter: Vec3;
  cusps: Vec3[]; // pontas de cúspides (posteriores) ou [incisalMid]
  mesialAngle: Vec3; // ângulo incisal mesial
  distalAngle: Vec3;
  /** ponto de ancoragem no arco: centro da borda incisal / mesa oclusal */
  anchor: Vec3;
}
