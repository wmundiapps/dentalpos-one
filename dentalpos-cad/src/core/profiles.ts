// Perfil do paciente → recomendações de forma/tamanho/caráter. Tendências estatísticas da literatura
// (Williams 1914, Frush & Fisher 1955-58 "dentogênica", Hollywood/natural). Nunca substitui o julgamento clínico.
import type { Jaw } from "./anatomy";

export type FaceShape = "oval" | "round" | "square" | "elongated" | "triangular" | "inverted-triangle" | "diamond";
export type Sex = "female" | "male" | "neutral";
export type Ethnicity = "caucasian" | "african" | "asian" | "latin" | "indigenous" | "middle-eastern" | "mixed";
export type AgeBand = "young" | "adult" | "mature" | "senior";
export type ToothForm = "square" | "ovoid" | "tapered" | "rectangular" | "round" | "squareovoid";
export type Personality = "delicate" | "balanced" | "vigorous";
export type Style = "natural" | "hollywood" | "youthful" | "mature" | "rejuvenated";

export const FACE_LABEL: Record<FaceShape, string> = {
  oval: "Oval", round: "Redondo", square: "Quadrado", elongated: "Alongado", triangular: "Triangular (queixo largo)",
  "inverted-triangle": "Triangular invertido (coração)", diamond: "Diamante",
};
export const SEX_LABEL: Record<Sex, string> = { female: "Feminino", male: "Masculino", neutral: "Neutro" };
export const ETHNICITY_LABEL: Record<Ethnicity, string> = {
  caucasian: "Caucasiano", african: "Afrodescendente", asian: "Asiático", latin: "Latino / miscigenado",
  indigenous: "Indígena / ameríndio", "middle-eastern": "Oriente Médio", mixed: "Misto / não informado",
};
export const AGE_LABEL: Record<AgeBand, string> = { young: "Jovem (<30)", adult: "Adulto (30–50)", mature: "Maduro (50–65)", senior: "Idoso (65+)" };
export const FORM_LABEL: Record<ToothForm, string> = {
  square: "Quadrado", ovoid: "Ovoide", tapered: "Triangular / afunilado", rectangular: "Retangular (alongado)", round: "Arredondado", squareovoid: "Quadrado-ovoide",
};

export interface PatientProfile {
  face: FaceShape;
  sex: Sex;
  ethnicity: Ethnicity;
  age: AgeBand;
  personality: Personality;
  style: Style;
  /** largura bizigomática (mm) — opcional, usada p/ escala; padrão 135 */
  bizygomaticMm?: number;
  /** distância interpupilar (mm) — escala de fotos; padrão 63 */
  ipdMm?: number;
}
export const DEFAULT_PROFILE: PatientProfile = { face: "oval", sex: "female", ethnicity: "mixed", age: "adult", personality: "balanced", style: "natural" };

/** Williams: a forma do incisivo central tende a espelhar o contorno facial invertido. */
export const FACE_TO_FORM: Record<FaceShape, { primary: ToothForm; alternatives: ToothForm[]; why: string }> = {
  oval: { primary: "ovoid", alternatives: ["squareovoid", "tapered"], why: "Face oval é harmônica com incisivos ovoides; admite variações suaves." },
  round: { primary: "squareovoid", alternatives: ["rectangular", "square"], why: "Face redonda ganha verticalidade: coroas mais retangulares e menos arredondadas alongam visualmente." },
  square: { primary: "square", alternatives: ["squareovoid", "ovoid"], why: "Face quadrada (mandíbula marcada) harmoniza com ângulos incisais definidos; ovoide suaviza o conjunto." },
  elongated: { primary: "squareovoid", alternatives: ["round", "ovoid"], why: "Face alongada pede coroas mais largas/curtas e bordas arredondadas para reduzir verticalidade." },
  triangular: { primary: "square", alternatives: ["squareovoid", "ovoid"], why: "Queixo/mandíbula largos acompanham dentes quadrados com ameias discretas." },
  "inverted-triangle": { primary: "tapered", alternatives: ["ovoid", "squareovoid"], why: "Testa larga e queixo estreito (coração) combinam com incisivos triangulares/afunilados." },
  diamond: { primary: "ovoid", alternatives: ["tapered", "squareovoid"], why: "Zigomático proeminente: ovoide equilibra; triangular enfatiza o estreitamento mandibular." },
};

export interface StyleModifiers {
  /** fator sobre md médio de cada dente */
  widthScale: number;
  heightScale: number;
  /** largura cervical relativa (0.55 triangular … 0.95 quadrado) */
  cervicalRatio: number;
  /** expoente da superelipse (2 = elipse, 4+ = retangular) */
  squareness: number;
  /** curvatura dos ângulos incisais (0 = vivos, 1 = muito arredondados) */
  cornerRounding: number;
  /** altura dos mamelões (mm) */
  mamelon: number;
  /** desgaste incisal/oclusal (0..1) — idade */
  wear: number;
  /** convexidade vestibular (0..1) */
  labialConvexity: number;
  /** diferença incisal lateral-central (mm); mulher/jovem maior */
  lateralStep: number;
  /** projeção/assimetria canina (mm de queda da ponta) */
  cuspDrop: number;
  /** intensidade das cúspides posteriores 0..1 */
  cuspRelief: number;
  notes: string[];
}

export function styleModifiers(p: PatientProfile, form?: ToothForm): StyleModifiers {
  const f = form ?? FACE_TO_FORM[p.face].primary;
  const notes: string[] = [];
  const base: Record<ToothForm, Partial<StyleModifiers>> = {
    square: { cervicalRatio: 0.92, squareness: 4.2, cornerRounding: 0.15, widthScale: 1.03, heightScale: 0.98 },
    squareovoid: { cervicalRatio: 0.84, squareness: 3.2, cornerRounding: 0.3, widthScale: 1.0, heightScale: 1.0 },
    ovoid: { cervicalRatio: 0.76, squareness: 2.5, cornerRounding: 0.5, widthScale: 1.0, heightScale: 1.0 },
    tapered: { cervicalRatio: 0.6, squareness: 2.2, cornerRounding: 0.35, widthScale: 0.98, heightScale: 1.02 },
    rectangular: { cervicalRatio: 0.88, squareness: 3.8, cornerRounding: 0.2, widthScale: 0.96, heightScale: 1.06 },
    round: { cervicalRatio: 0.78, squareness: 2.1, cornerRounding: 0.7, widthScale: 1.04, heightScale: 0.94 },
  };
  const m: StyleModifiers = {
    widthScale: 1, heightScale: 1, cervicalRatio: 0.8, squareness: 3, cornerRounding: 0.3, mamelon: 0.25, wear: 0,
    labialConvexity: 0.5, lateralStep: 0.5, cuspDrop: 2.2, cuspRelief: 0.8, notes, ...base[f],
  };
  // Sexo (Frush & Fisher): feminino = arredondado/delicado; masculino = angular/vigoroso. Homens: dentes ~3–5% maiores.
  if (p.sex === "female") { m.cornerRounding += 0.15; m.widthScale *= 0.98; m.lateralStep += 0.3; m.cuspDrop -= 0.2; notes.push("Feminino: ângulos arredondados, lateral ~0,8 mm mais curto."); }
  if (p.sex === "male") { m.cornerRounding -= 0.12; m.widthScale *= 1.035; m.heightScale *= 1.01; m.lateralStep -= 0.3; m.cuspDrop += 0.3; notes.push("Masculino: coroas ~3% maiores, ângulos mais vivos, canino mais pontiagudo."); }
  // Personalidade
  if (p.personality === "delicate") { m.cornerRounding += 0.12; m.widthScale *= 0.97; m.cuspDrop -= 0.2; m.labialConvexity -= 0.1; }
  if (p.personality === "vigorous") { m.cornerRounding -= 0.1; m.widthScale *= 1.03; m.cuspDrop += 0.3; m.labialConvexity += 0.1; }
  // Etnia — tendências populacionais; o clínico individualiza.
  switch (p.ethnicity) {
    case "african": m.widthScale *= 1.03; m.heightScale *= 0.99; m.cornerRounding += 0.05; m.labialConvexity += 0.1; notes.push("Afrodescendente: coroas ligeiramente mais largas e convexas; ameias discretas."); break;
    case "asian": m.widthScale *= 1.02; m.heightScale *= 0.97; m.cervicalRatio += 0.03; m.labialConvexity += 0.08; m.cornerRounding += 0.05; notes.push("Asiático: tendência a coroas mais curtas/largas e vestibular convexo."); break;
    case "caucasian": m.cuspDrop += 0.2; m.cervicalRatio -= 0.02; notes.push("Caucasiano: caninos mais pontiagudos e ameias incisais mais evidentes."); break;
    case "indigenous": m.widthScale *= 1.02; m.cervicalRatio += 0.04; m.squareness += 0.2; notes.push("Ameríndio: incisivos em forma de pá (cíngulo e cristas marginais acentuados)."); break;
    case "middle-eastern": m.cuspDrop += 0.1; m.widthScale *= 1.01; break;
    case "latin": m.cornerRounding += 0.03; break;
    default: break;
  }
  // Idade — desgaste, mamelões e arredondamento
  switch (p.age) {
    case "young": m.mamelon = 0.45; m.wear = 0; m.heightScale *= 1.02; m.lateralStep += 0.2; break;
    case "adult": m.mamelon = 0.2; m.wear = 0.15; break;
    case "mature": m.mamelon = 0; m.wear = 0.4; m.heightScale *= 0.97; m.lateralStep -= 0.4; m.cornerRounding += 0.1; m.cuspRelief -= 0.2; notes.push("Maduro: desgaste incisal moderado, bordas mais retas."); break;
    case "senior": m.mamelon = 0; m.wear = 0.7; m.heightScale *= 0.93; m.lateralStep -= 0.7; m.cornerRounding += 0.2; m.cuspRelief -= 0.4; notes.push("Idoso: desgaste acentuado, bordas planas."); break;
  }
  // Estilo
  switch (p.style) {
    case "hollywood": m.widthScale *= 1.04; m.heightScale *= 1.04; m.wear = 0; m.mamelon = 0.05; m.cornerRounding -= 0.05; m.cuspDrop -= 0.5; m.cuspRelief += 0.1; notes.push("Hollywood: dentes uniformes, grandes, bordas planas e sem desgaste."); break;
    case "youthful": m.mamelon = 0.5; m.wear = 0; m.lateralStep += 0.3; break;
    case "mature": m.wear = Math.max(m.wear, 0.45); m.mamelon = 0; break;
    case "rejuvenated": m.wear = Math.max(0, m.wear - 0.2); m.mamelon = Math.max(m.mamelon, 0.25); m.heightScale *= 1.02; break;
    default: break;
  }
  m.cornerRounding = Math.min(0.95, Math.max(0.02, m.cornerRounding));
  m.labialConvexity = Math.min(1, Math.max(0.1, m.labialConvexity));
  m.cuspRelief = Math.min(1, Math.max(0.2, m.cuspRelief));
  m.cuspDrop = Math.max(0.6, m.cuspDrop);
  return m;
}

export interface LibraryPreset {
  id: string;
  name: string;
  form: ToothForm;
  face: FaceShape[];
  sex: Sex;
  profile: Partial<PatientProfile>;
  description: string;
  jawScope: Jaw[];
}

/** Biblioteca de presets: face × sexo × forma × caráter — gerada de forma determinística (≈ 60 opções). */
export function buildPresetLibrary(): LibraryPreset[] {
  const out: LibraryPreset[] = [];
  const faces = Object.keys(FACE_TO_FORM) as FaceShape[];
  const sexes: Sex[] = ["female", "male"];
  for (const face of faces) {
    const rec = FACE_TO_FORM[face];
    for (const sex of sexes) {
      const forms = [rec.primary, ...rec.alternatives];
      forms.forEach((form, i) => {
        const pers: Personality = sex === "female" ? (i === 0 ? "delicate" : "balanced") : i === 0 ? "vigorous" : "balanced";
        out.push({
          id: `${face}-${sex}-${form}`,
          name: `${FACE_LABEL[face]} · ${SEX_LABEL[sex]} · ${FORM_LABEL[form]}${i === 0 ? " (recomendado)" : ""}`,
          form, face: [face], sex,
          profile: { face, sex, personality: pers },
          description: i === 0 ? rec.why : `Alternativa ${FORM_LABEL[form].toLowerCase()} para face ${FACE_LABEL[face].toLowerCase()}.`,
          jawScope: ["upper", "lower"],
        });
      });
    }
  }
  // Estilos especiais independentes da face
  const specials: Array<[string, Partial<PatientProfile>, ToothForm, string]> = [
    ["Hollywood", { style: "hollywood", age: "young" }, "squareovoid", "Dentes grandes, uniformes e brancos (BL1–BL2)."],
    ["Natural jovem", { style: "youthful", age: "young" }, "ovoid", "Mamelões e ameias incisais marcadas."],
    ["Natural maduro", { style: "mature", age: "mature" }, "squareovoid", "Bordas planas com leve desgaste."],
    ["Rejuvenescido", { style: "rejuvenated", age: "adult" }, "ovoid", "Retoma comprimento perdido por desgaste."],
  ];
  for (const [name, profile, form, d] of specials) out.push({ id: `special-${name}`, name, form, face: Object.keys(FACE_TO_FORM) as FaceShape[], sex: "neutral", profile, description: d, jawScope: ["upper", "lower"] });
  return out;
}
