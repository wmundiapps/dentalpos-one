// Biblioteca de materiais — espessuras mínimas e parâmetros CAM. Valores de referência (literatura/IFU típicas);
// SEMPRE conferir a instrução de uso do fabricante/lote. Ver docs/PESQUISA-MERCADO.md.
export type MaterialId = "zirconia-ml" | "zirconia-ht" | "zirconia-st" | "emax-cad" | "emax-press" | "pmma" | "composite-cad" | "hybrid-ceramic" | "titanium" | "cocr" | "feldspathic";
export interface MaterialSpec {
  id: MaterialId; name: string; brandsRef: string; family: "zirconia" | "glass-ceramic" | "polymer" | "metal" | "hybrid";
  /** espessuras mínimas (mm) */
  min: { axialAnterior: number; axialPosterior: number; incisal: number; occlusal: number; veneer: number; lingual: number };
  /** área mínima do conector em ponte (mm²) anterior/posterior e altura/largura mínimas */
  connector: { anterior: number; posterior: number; minHeight: number; minWidth: number; maxUnits: number } | null;
  /** fator de sinterização linear (zircônia) — vem do lote do disco */
  sinterFactor?: number;
  cementGap: number; // mm
  note: string;
}
export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  "zirconia-ml": { id: "zirconia-ml", name: "Zircônia multicamada 4Y/5Y (monolítica)", brandsRef: "Amann Girrbach Zolid, Katana STML, Ivoclar IPS e.max ZirCAD Prime", family: "zirconia",
    min: { axialAnterior: 0.8, axialPosterior: 1.0, incisal: 1.0, occlusal: 1.2, veneer: 0.6, lingual: 1.2 }, connector: { anterior: 12, posterior: 16, minHeight: 4, minWidth: 3, maxUnits: 14 }, sinterFactor: 1.23, cementGap: 0.08, note: "Posterior monolítica: 1,2–1,5 mm oclusal; conectores ≥12 mm² (ant.) e ≥16 mm² (post.)." },
  "zirconia-ht": { id: "zirconia-ht", name: "Zircônia 3Y alta resistência (infraestrutura)", brandsRef: "Ceramill Zolid HT+, Katana HT, Lava", family: "zirconia",
    min: { axialAnterior: 0.5, axialPosterior: 0.6, incisal: 0.8, occlusal: 0.8, veneer: 0.5, lingual: 0.5 }, connector: { anterior: 9, posterior: 12, minHeight: 4, minWidth: 3, maxUnits: 14 }, sinterFactor: 1.25, cementGap: 0.08, note: "Cobertura cerâmica estratificada requer espaço extra (≥1,0 mm vestibular)." },
  "zirconia-st": { id: "zirconia-st", name: "Zircônia super-translúcida 5Y", brandsRef: "Katana UTML, Zolid Fusion/Gen-X", family: "zirconia",
    min: { axialAnterior: 0.8, axialPosterior: 1.0, incisal: 1.0, occlusal: 1.0, veneer: 0.6, lingual: 1.0 }, connector: { anterior: 12, posterior: 16, minHeight: 4, minWidth: 3.5, maxUnits: 3 }, sinterFactor: 1.25, cementGap: 0.08, note: "Menor resistência flexural: restringir a 3 elementos e conectores generosos." },
  "emax-cad": { id: "emax-cad", name: "Dissilicato de lítio CAD (e.max CAD)", brandsRef: "Ivoclar IPS e.max CAD, Amber Mill, Rosetta", family: "glass-ceramic",
    min: { axialAnterior: 1.0, axialPosterior: 1.0, incisal: 1.2, occlusal: 1.5, veneer: 0.4, lingual: 1.2 }, connector: { anterior: 16, posterior: 16, minHeight: 4, minWidth: 4, maxUnits: 3 }, cementGap: 0.08, note: "Ponte de 3 elementos até 2º pré-molar; oclusal ≥1,5 mm; faceta 0,3–0,6 mm." },
  "emax-press": { id: "emax-press", name: "Dissilicato de lítio prensado (e.max Press)", brandsRef: "Ivoclar IPS e.max Press (wax-up → muflagem)", family: "glass-ceramic",
    min: { axialAnterior: 0.9, axialPosterior: 1.0, incisal: 1.2, occlusal: 1.5, veneer: 0.4, lingual: 1.0 }, connector: { anterior: 16, posterior: 16, minHeight: 4, minWidth: 4, maxUnits: 3 }, cementGap: 0.06, note: "Requer enceramento com 0,3 mm de compensação para o acabamento." },
  pmma: { id: "pmma", name: "PMMA (provisório)", brandsRef: "Telio CAD, Ceramill Temp, Vita CAD-Temp", family: "polymer",
    min: { axialAnterior: 0.8, axialPosterior: 1.0, incisal: 1.0, occlusal: 1.2, veneer: 0.6, lingual: 0.8 }, connector: { anterior: 9, posterior: 12, minHeight: 4, minWidth: 3, maxUnits: 14 }, cementGap: 0.1, note: "Provisórios longos exigem conectores amplos." },
  "composite-cad": { id: "composite-cad", name: "Resina composta CAD/CAM", brandsRef: "Lava Ultimate, Cerasmart, Grandio disc", family: "polymer",
    min: { axialAnterior: 0.6, axialPosterior: 0.8, incisal: 1.0, occlusal: 1.0, veneer: 0.5, lingual: 0.8 }, connector: null, cementGap: 0.08, note: "Indicada para coroas unitárias, onlays e facetas finas." },
  "hybrid-ceramic": { id: "hybrid-ceramic", name: "Cerâmica híbrida (rede polimérica infiltrada)", brandsRef: "Vita Enamic", family: "hybrid",
    min: { axialAnterior: 0.8, axialPosterior: 1.0, incisal: 1.0, occlusal: 1.0, veneer: 0.4, lingual: 0.8 }, connector: null, cementGap: 0.08, note: "Absorve impacto; indicada para implantes e dentes frágeis." },
  titanium: { id: "titanium", name: "Titânio grau 5 (barras/estruturas/ pilares)", brandsRef: "Straumann CARES, Zirkonzahn", family: "metal",
    min: { axialAnterior: 0.4, axialPosterior: 0.5, incisal: 0.6, occlusal: 0.6, veneer: 0.4, lingual: 0.4 }, connector: { anterior: 7, posterior: 9, minHeight: 4, minWidth: 3, maxUnits: 14 }, cementGap: 0.05, note: "Espessura de parede do pilar ≥0,5 mm no ponto mais delgado." },
  cocr: { id: "cocr", name: "Cobalto-cromo (sinterizado/fresado)", brandsRef: "Ceramill Sintron, SLM", family: "metal",
    min: { axialAnterior: 0.3, axialPosterior: 0.4, incisal: 0.5, occlusal: 0.5, veneer: 0.3, lingual: 0.3 }, connector: { anterior: 6, posterior: 7, minHeight: 3, minWidth: 2.5, maxUnits: 14 }, cementGap: 0.05, note: "Coping metálico para cobertura cerâmica." },
  feldspathic: { id: "feldspathic", name: "Cerâmica feldspática", brandsRef: "Vitablocs Mark II, CEREC Blocs", family: "glass-ceramic",
    min: { axialAnterior: 0.8, axialPosterior: 1.2, incisal: 1.2, occlusal: 1.5, veneer: 0.3, lingual: 1.0 }, connector: null, cementGap: 0.08, note: "Excelente para facetas ultrafinas; não indicada para pontes." },
};
export const materialList = () => Object.values(MATERIALS);
export const SHADES = {
  vita: ["A1", "A2", "A3", "A3.5", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D2", "D3", "D4"],
  bleach: ["BL1", "BL2", "BL3", "BL4", "0M1", "0M2", "0M3"],
};
const SHADE_RGB: Record<string, [number, number, number]> = {
  BL1: [250, 246, 236], BL2: [247, 241, 228], BL3: [244, 236, 219], BL4: [240, 230, 208], "0M1": [248, 243, 232], "0M2": [245, 238, 223], "0M3": [241, 232, 212],
  A1: [236, 224, 200], A2: [232, 216, 186], A3: [226, 206, 170], "A3.5": [220, 198, 160], A4: [210, 186, 148],
  B1: [238, 228, 205], B2: [234, 220, 192], B3: [228, 210, 174], B4: [222, 202, 160],
  C1: [226, 218, 198], C2: [218, 208, 186], C3: [208, 196, 172], C4: [196, 184, 160],
  D2: [228, 220, 204], D3: [220, 208, 190], D4: [210, 198, 180],
};
export const shadeRgb = (s: string): [number, number, number] => SHADE_RGB[s] ?? SHADE_RGB.A1;
