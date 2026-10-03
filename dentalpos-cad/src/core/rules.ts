// Motor de regras clínicas: Andrews (6 chaves), overjet/overbite, Spee/Wilson, proporções (áurea/RED/Preston),
// simetria, estética, materiais. Cada achado traz mensagem, dica e (quando possível) correção automática.
import { ANDREWS_NORMS, ANTERIOR, DEFAULT_HEIGHTS, isAnterior, schemeHeight, toothRef } from "./anatomy";
import { type CadProject, type Evaluated, type ProportionRule, designOf, evaluate } from "./project";
import { type Measurements, measure } from "./measure";
import { MATERIALS } from "./materials";
import { clamp, round } from "./math";
import { analyzePhoto } from "./smile";
import { analyzeGuide } from "./guide";

export type Severity = "error" | "warning" | "info" | "ok";
export type Category = "andrews" | "oclusao" | "proporcao" | "estetica" | "contatos" | "material" | "implante" | "foto";

export interface AutoFix { label: string; apply: (p: CadProject) => CadProject }
export interface Issue {
  id: string; code: string; severity: Severity; category: Category;
  teeth: number[]; title: string; message: string; tip: string;
  value?: number; target?: string; fix?: AutoFix;
}
export interface Report {
  issues: Issue[];
  meas: Measurements;
  scores: Record<Category, number>;
  overall: number;
  counts: Record<Severity, number>;
}

export const PROPORTION_LABEL: Record<ProportionRule, string> = {
  golden: "Proporção áurea (1 : 0,618 : 0,382 percebida)", red70: "RED 70% (proporção estética dental recorrente)", red80: "RED 80%",
  preston: "Preston (1 : 0,66 : 0,84)", none: "Livre (sem regra)",
};
/** razões alvo de largura aparente: lateral/central e canino/lateral */
export function proportionTargets(rule: ProportionRule): { lat: number; can: number } | null {
  switch (rule) {
    case "golden": return { lat: 0.618, can: 0.618 };
    case "red70": return { lat: 0.7, can: 0.7 };
    case "red80": return { lat: 0.8, can: 0.8 };
    case "preston": return { lat: 0.66, can: 1.27 };
    default: return null;
  }
}

export const THRESHOLDS = {
  overjet: { ideal: [1, 2], warn: [0.5, 3], err: [0, 5] },
  overbite: { ideal: [1, 2], warn: [0.5, 3], err: [-0.3, 5] },
  tipWarn: 3, tipErr: 6, torqueWarn: 3, torqueErr: 7, rotWarn: 3, rotErr: 8,
  gapWarn: 0.3, gapErr: 0.8, overlapWarn: -0.4, overlapErr: -1.0,
  speeWarn: 2.0, speeErr: 3.0,
  wilson: [60, 250],
  whCentral: [0.72, 0.88], centralHeight: [9.0, 12.0],
  lateralShorter: [0.3, 2.0],
  midlineWarn: 1.0, midlineErr: 2.0,
  molarWarn: 1.0, molarErr: 2.5,
  symWidth: 0.3, symWidthErr: 0.7, symEdge: 0.4, symEdgeErr: 0.9,
  bolton: { anterior: [75.5, 79.0], overall: [89.4, 93.2] },
  proportionTol: 0.07,
  zenithLat: [-1.6, 0.2],
  zenithTol: 0.7, ridgeTol: 0.5,
};

let uid = 0;
const mk = (code: string, severity: Severity, category: Category, teeth: number[], title: string, message: string, tip: string, extra: Partial<Issue> = {}): Issue =>
  ({ id: `${code}-${teeth.join("_")}-${uid++}`, code, severity, category, teeth, title, message, tip, ...extra });

const setAdj = (p: CadProject, fdi: number, patch: Partial<NonNullable<CadProject["adjust"][number]>>): CadProject => ({
  ...p, adjust: { ...p.adjust, [fdi]: { ...(p.adjust[fdi] ?? {}), ...patch } },
});
const f = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "—" : n.toFixed(d).replace(".", ","));

export function analyze(p: CadProject, evIn?: Evaluated): Report {
  uid = 0;
  const ev = evIn ?? evaluate(p);
  const m = measure(ev);
  const T = THRESHOLDS;
  const issues: Issue[] = [];

  // ---------- Overjet / Overbite ----------
  if (m.overjet !== null) {
    const v = m.overjet;
    const fix: AutoFix = { label: "Ajustar overjet para 1,5 mm", apply: (q) => ({ ...q, occlusion: { ...q.occlusion, overjet: 1.5 } }) };
    if (v < T.overjet.err[0]) issues.push(mk("OJ_NEG", "error", "oclusao", [11, 21, 31, 41], "Mordida cruzada anterior", `Overjet negativo (${f(v)} mm): incisivos superiores atrás dos inferiores.`, "Avance os incisivos superiores/ajuste torque (+) ou revise a relação esquelética; confirme se é uma Classe III real.", { value: v, target: "1–2 mm", fix }));
    else if (v > T.overjet.err[1]) issues.push(mk("OJ_HIGH", "error", "oclusao", [11, 21], "Overjet excessivo", `Overjet de ${f(v)} mm (ideal 1–2 mm).`, "Retroinclinar os incisivos superiores ou reduzir o volume vestibular da restauração.", { value: v, target: "1–2 mm", fix }));
    else if (v < T.overjet.warn[0] || v > T.overjet.warn[1]) issues.push(mk("OJ_WARN", "warning", "oclusao", [11, 21], v < 1 ? "Overjet reduzido" : "Overjet aumentado", `Overjet de ${f(v)} mm; faixa ideal 1–2 mm.`, v < 1 ? "Risco de contato de topo e interferência na protrusiva." : "Pode comprometer fonética (sons F/V) e guia anterior.", { value: v, target: "1–2 mm", fix }));
    else issues.push(mk("OJ_OK", "ok", "oclusao", [11, 21], "Overjet adequado", `${f(v)} mm (ideal 1–2 mm).`, "Mantenha o guia anterior suave para desoclusão posterior na protrusiva.", { value: v }));
  }
  if (m.overbite !== null) {
    const v = m.overbite;
    const fix: AutoFix = { label: "Ajustar overbite para 1,5 mm", apply: (q) => ({ ...q, occlusion: { ...q.occlusion, overbite: 1.5 } }) };
    if (v < T.overbite.err[0]) issues.push(mk("OB_OPEN", "error", "oclusao", [11, 21, 31, 41], "Mordida aberta anterior", `Overbite de ${f(v)} mm (sem trespasse vertical).`, "Estenda as bordas incisais superiores ou verticalize a oclusão; sem contato anterior há sobrecarga posterior.", { value: v, target: "1–2 mm", fix }));
    else if (v > T.overbite.err[1]) issues.push(mk("OB_DEEP", "error", "oclusao", [11, 21], "Mordida profunda", `Overbite de ${f(v)} mm (${f(m.overbitePct, 0)}% da coroa inferior).`, "Encurte as bordas incisais superiores ou nivele a curva de Spee.", { value: v, target: "1–2 mm", fix }));
    else if (v < T.overbite.warn[0] || v > T.overbite.warn[1]) issues.push(mk("OB_WARN", "warning", "oclusao", [11, 21], v < 1 ? "Overbite reduzido / topo a topo" : "Overbite aumentado", `Overbite de ${f(v)} mm (${f(m.overbitePct, 0)}% da coroa inferior); ideal 1–2 mm.`, "Revise o comprimento incisal superior e o plano oclusal.", { value: v, target: "1–2 mm", fix }));
    else issues.push(mk("OB_OK", "ok", "oclusao", [11, 21], "Overbite adequado", `${f(v)} mm — ${f(m.overbitePct, 0)}% da coroa inferior.`, "Trespasse vertical favorece a guia anterior.", { value: v }));
  }

  // ---------- Curva de Spee / Wilson ----------
  if (m.speeDepth.max !== null) {
    const v = m.speeDepth.max;
    const fix: AutoFix = { label: "Suavizar curva de Spee (raio 135 mm)", apply: (q) => ({ ...q, occlusion: { ...q.occlusion, speeRadius: 135 } }) };
    if (v > T.speeErr) issues.push(mk("SPEE_DEEP", "error", "oclusao", [], "Curva de Spee muito profunda", `Profundidade de ${f(v)} mm (ideal 0–1,5 mm).`, "Nivele os dentes posteriores ou aumente o raio de Spee; pode causar interferências em lateralidade.", { value: v, target: "0–1,5 mm", fix }));
    else if (v > T.speeWarn) issues.push(mk("SPEE_WARN", "warning", "oclusao", [], "Curva de Spee acentuada", `Profundidade de ${f(v)} mm (ideal ≤ 1,5–2 mm).`, "Aumente o raio da curva de Spee.", { value: v, fix }));
    else if (v < -0.3) issues.push(mk("SPEE_REV", "warning", "oclusao", [], "Curva de Spee reversa", `Profundidade de ${f(v)} mm (convexa).`, "Curva reversa dificulta a desoclusão; restabeleça leve concavidade.", { value: v, fix: { label: "Restaurar Spee (raio 135 mm)", apply: fix.apply } }));
    else issues.push(mk("SPEE_OK", "ok", "oclusao", [], "Curva de Spee adequada", `${f(v)} mm (Andrews 6ª chave: plano plano até 1,5 mm).`, "", { value: v }));
  }
  if (m.wilsonRadius !== null) {
    const v = m.wilsonRadius;
    if (v < T.wilson[0] || v > T.wilson[1]) issues.push(mk("WILSON", "warning", "oclusao", [36, 46], "Curva de Wilson fora do padrão", `Raio estimado ${f(v, 0)} mm (esperado ${T.wilson[0]}–${T.wilson[1]} mm).`, "Ajuste o torque (inclinação lingual) dos molares inferiores/ raio de Wilson.", { value: v, fix: { label: "Raio de Wilson 160 mm", apply: (q) => ({ ...q, occlusion: { ...q.occlusion, wilsonRadius: 160 } }) } }));
    else issues.push(mk("WILSON_OK", "ok", "oclusao", [36, 46], "Curva de Wilson adequada", `Raio ${f(v, 0)} mm.`, "", { value: v }));
  }

  // ---------- Andrews: chave 1 (relação oclusal) ----------
  for (const [side, val, upper, lower] of [["direito", m.molar.R, 16, 46], ["esquerdo", m.molar.L, 26, 36]] as const) {
    if (val === null) continue;
    const a = Math.abs(val);
    const cls = val < -T.molarWarn ? "Classe II" : val > T.molarWarn ? "Classe III" : "Classe I";
    const fix: AutoFix = { label: "Reposicionar para Classe I", apply: (q) => ({ ...q, occlusion: { ...q.occlusion, molarOffset: 0 } }) };
    if (a > T.molarErr) issues.push(mk("K1_MOLAR", "error", "andrews", [upper, lower], `1ª chave: relação molar ${cls} (${side})`, `Cúspide MV do ${upper} está ${f(a)} mm ${val < 0 ? "mesial" : "distal"} ao sulco vestibular do ${lower}.`, "Na Classe I a cúspide MV do 1º molar superior oclui no sulco entre as cúspides MV e média do 1º molar inferior.", { value: val, target: "±1 mm", fix }));
    else if (a > T.molarWarn) issues.push(mk("K1_MOLAR", "warning", "andrews", [upper, lower], `1ª chave: relação molar limítrofe (${side})`, `Desvio de ${f(val)} mm do sulco ideal (tendência ${cls}).`, "Pequenos desvios são toleráveis em restaurações unitárias.", { value: val, fix }));
    else issues.push(mk("K1_OK", "ok", "andrews", [upper, lower], `1ª chave: Classe I molar (${side})`, `Desvio ${f(val)} mm.`, ""));
  }
  for (const [side, val, upper] of [["direito", m.canine.R, 13], ["esquerdo", m.canine.L, 23]] as const) {
    if (val === null) continue;
    if (Math.abs(val) > 2) issues.push(mk("K1_CANINE", "warning", "andrews", [upper], `1ª chave: relação canina fora do padrão (${side})`, `Ponta do canino superior ${f(Math.abs(val))} mm ${val < 0 ? "mesial" : "distal"} à ameia canino/pré-molar inferior.`, "A cúspide do canino superior deve ocluir na ameia entre canino e 1º pré-molar inferior."));
  }
  if (m.crossbite.length) issues.push(mk("XBITE", "error", "oclusao", m.crossbite, "Mordida cruzada posterior", `Cúspides vestibulares superiores internas às inferiores nos dentes ${m.crossbite.join(", ")}.`, "Alargue o arco superior (ou estreite o inferior) para restabelecer o trespasse vestibular de 1–2 mm.", { fix: { label: "Alargar arco superior em 2 mm", apply: (q) => ({ ...q, arches: { ...q.arches, upper: { ...q.arches.upper, width: q.arches.upper.width + 2 } } }) } }));

  // ---------- Chaves 2, 3, 4: angulação, inclinação, rotação ----------
  for (const t of ev.teeth.values()) {
    const e = m.tipErr[t.fdi], g = m.torqueErr[t.fdi], r = m.rotation[t.fdi];
    const n = ANDREWS_NORMS[t.ref.jaw][t.ref.type];
    if (Math.abs(e) > T.tipWarn) issues.push(mk("K2_TIP", Math.abs(e) > T.tipErr ? "error" : "warning", "andrews", [t.fdi], `2ª chave: angulação (tip) do ${t.fdi}`, `Angulação ${f(t.pose.tip, 0)}° (norma ${n.tip}°, desvio ${f(e)}°).`, "Coroa com a porção gengival mais distal que a incisal (+). Verifique o paralelismo radicular.", { value: t.pose.tip, target: `${n.tip}° ±${T.tipWarn}°`, fix: { label: `Restaurar angulação do ${t.fdi}`, apply: (q) => setAdj(q, t.fdi, { tip: 0 }) } }));
    if (Math.abs(g) > T.torqueWarn) issues.push(mk("K3_TORQUE", Math.abs(g) > T.torqueErr ? "error" : "warning", "andrews", [t.fdi], `3ª chave: inclinação (torque) do ${t.fdi}`, `Torque ${f(t.pose.torque, 0)}° (norma ${n.torque}°, desvio ${f(g)}°).`, isAnterior(t.ref.type) && t.ref.jaw === "upper" ? "Torque excessivo altera o overjet e o suporte labial." : "Inclinação lingual progressiva dos posteriores inferiores forma a curva de Wilson.", { value: t.pose.torque, target: `${n.torque}° ±${T.torqueWarn}°`, fix: { label: `Restaurar torque do ${t.fdi}`, apply: (q) => setAdj(q, t.fdi, { torque: 0 }) } }));
    if (Math.abs(r) > T.rotWarn) issues.push(mk("K4_ROT", Math.abs(r) > T.rotErr ? "error" : "warning", "andrews", [t.fdi], `4ª chave: rotação do ${t.fdi}`, `Rotação de ${f(r, 0)}° sobre o longo eixo.`, "Rotações fecham/abrem contatos e alteram a ameia; corrija para 0°.", { value: r, target: "0°", fix: { label: `Zerar rotação do ${t.fdi}`, apply: (q) => setAdj(q, t.fdi, { rotation: 0 }) } }));
  }

  // ---------- Chave 5: contatos ----------
  for (const c of m.contacts) {
    const moved = (q: CadProject, fd: number) => !!(q.adjust[fd]?.dx || q.adjust[fd]?.dy);
    const closeFix = (label: string): AutoFix => ({ label, apply: (q) => {
      // 1º: desfaz deslocamentos manuais dos dentes envolvidos; 2º: ajusta a largura do dente distal
      if (moved(q, c.a) || moved(q, c.b)) { let r = q; for (const fd of [c.a, c.b]) if (moved(r, fd)) r = setAdj(r, fd, { dx: 0, dy: 0 }); return r; }
      return setAdj(q, c.b, { scaleMd: clamp((q.adjust[c.b]?.scaleMd ?? 1) + c.gap / (ev.teeth.get(c.b)?.dims.md ?? 8), 0.8, 1.25) });
    } });
    const fixClose = closeFix(`Fechar contato ${c.a}–${c.b}`);
    if (c.gap > T.gapErr) issues.push(mk("K5_GAP", "error", "contatos", [c.a, c.b], `5ª chave: espaço entre ${c.a} e ${c.b}`, `Diastema de ${f(c.gap)} mm (contatos devem ser firmes, 0 mm).`, "Aumente a largura mesiodistal ou mova o dente para fechar o espaço (retenção de alimentos).", { value: c.gap, target: "0 mm", fix: fixClose }));
    else if (c.gap > T.gapWarn) issues.push(mk("K5_GAP", "warning", "contatos", [c.a, c.b], `5ª chave: contato frouxo ${c.a}–${c.b}`, `Espaço de ${f(c.gap)} mm.`, "Contato proximal deve ser puntiforme e firme (fio dental com leve resistência).", { value: c.gap, fix: fixClose }));
    else if (c.gap < T.overlapErr) issues.push(mk("K5_OVERLAP", "error", "contatos", [c.a, c.b], `Sobreposição entre ${c.a} e ${c.b}`, `Interpenetração de ${f(-c.gap)} mm — contato impossível/apinhamento.`, "Reduza a largura MD, gire ou posicione os dentes para eliminar a colisão.", { value: c.gap, fix: closeFix(`Resolver sobreposição ${c.a}–${c.b}`) }));
    else if (c.gap < T.overlapWarn) issues.push(mk("K5_OVERLAP", "warning", "contatos", [c.a, c.b], `Contato apertado ${c.a}–${c.b}`, `Interpenetração leve de ${f(-c.gap)} mm.`, "Alivie o contato proximal (0,05–0,1 mm) para permitir inserção.", { value: c.gap, fix: closeFix(`Resolver sobreposição ${c.a}–${c.b}`) }));
  }

  // ---------- Linha média ----------
  if (m.midlineDev !== null) {
    const v = Math.abs(m.midlineDev);
    const fix: AutoFix = { label: "Centralizar linhas médias", apply: (q) => { let r = q; for (const fd of [31, 41, 32, 42, 33, 43]) if (r.adjust[fd]?.dx) r = setAdj(r, fd, { dx: 0 }); return r; } };
    if (v > T.midlineErr) issues.push(mk("MIDLINE", "error", "estetica", [11, 21, 31, 41], "Desvio de linha média dentária", `Linhas médias superior/inferior desviadas ${f(v)} mm.`, "Desvios >2 mm são percebidos por leigos; reposicione os incisivos.", { value: v, target: "≤ 1 mm", fix }));
    else if (v > T.midlineWarn) issues.push(mk("MIDLINE", "warning", "estetica", [11, 21, 31, 41], "Linhas médias não coincidentes", `Desvio de ${f(v)} mm.`, "A linha média superior deve coincidir com a facial; a inferior pode divergir até 1–2 mm.", { value: v, fix }));
  }

  // ---------- Bolton ----------
  if (m.bolton.anterior !== null && (m.bolton.anterior < T.bolton.anterior[0] || m.bolton.anterior > T.bolton.anterior[1]))
    issues.push(mk("BOLTON_A", "info", "oclusao", [13, 12, 11, 21, 22, 23, 33, 32, 31, 41, 42, 43], "Discrepância de Bolton anterior", `Razão anterior ${f(m.bolton.anterior)}% (norma 77,2 ± 1,65%).`, m.bolton.anterior > 78 ? "Excesso de massa dentária inferior: considere reduzir inferiores (stripping) ou ampliar superiores." : "Excesso superior: reduza largura dos superiores ou amplie os inferiores.", { value: m.bolton.anterior }));
  if (m.bolton.overall !== null && (m.bolton.overall < T.bolton.overall[0] || m.bolton.overall > T.bolton.overall[1]))
    issues.push(mk("BOLTON_T", "info", "oclusao", [], "Discrepância de Bolton total", `Razão geral ${f(m.bolton.overall)}% (norma 91,3 ± 1,91%).`, "Pode comprometer o engrenamento posterior."));

  // ---------- Proporções anteriores ----------
  addProportion(p, ev, m, issues);

  // ---------- Simetria direita/esquerda ----------
  for (const idx of [1, 2, 3]) {
    const a = ev.teeth.get(10 + idx), b = ev.teeth.get(20 + idx);
    if (!a || !b) continue;
    const dw = Math.abs(a.dims.md - b.dims.md), dh = Math.abs(a.dims.h - b.dims.h), de = Math.abs(a.lm.incisalMid[2] - b.lm.incisalMid[2]);
    if (dw > T.symWidth) issues.push(mk("SYM_W", dw > T.symWidthErr ? "error" : "warning", "estetica", [a.fdi, b.fdi], `Assimetria de largura ${a.fdi}/${b.fdi}`, `Diferença de ${f(dw)} mm.`, "Dentes contralaterais devem ter largura igual (±0,3 mm).", { value: dw, fix: { label: `Espelhar ${a.fdi} → ${b.fdi}`, apply: (q) => ({ ...q, adjust: { ...q.adjust, [b.fdi]: { ...(q.adjust[b.fdi] ?? {}), scaleMd: q.adjust[a.fdi]?.scaleMd ?? 1, scaleH: q.adjust[a.fdi]?.scaleH ?? 1, scale: q.adjust[a.fdi]?.scale ?? 1 } } }) } }));
    if (de > T.symEdge) issues.push(mk("SYM_EDGE", de > T.symEdgeErr ? "error" : "warning", "estetica", [a.fdi, b.fdi], `Bordas incisais assimétricas ${a.fdi}/${b.fdi}`, `Diferença de nível de ${f(de)} mm.`, "Nivele as bordas — assimetrias >0,5 mm são notadas.", { value: de, fix: { label: "Nivelar bordas", apply: (q) => ({ ...q, adjust: { ...q.adjust, [b.fdi]: { ...(q.adjust[b.fdi] ?? {}), dz: q.adjust[a.fdi]?.dz ?? 0 } } }) } }));
    void dh;
  }

  // ---------- Altura/largura e escalonamento ----------
  for (const fd of [11, 21]) {
    const t = ev.teeth.get(fd); if (!t) continue;
    const wh = t.dims.md / t.dims.h;
    if (wh < T.whCentral[0] || wh > T.whCentral[1]) issues.push(mk("WH_CENTRAL", "warning", "proporcao", [fd], `Razão largura/altura do ${fd}`, `L/A = ${f(wh * 100, 0)}% (ideal 75–85%).`, wh > T.whCentral[1] ? "Dente muito largo/curto (quadrado): aumente a altura." : "Dente alongado: aumente a largura ou reduza a altura.", { value: wh, target: "75–85%", fix: { label: `Ajustar altura do ${fd} (L/A 80%)`, apply: (q) => setAdj(q, fd, { scaleH: clamp(((t.dims.md / 0.8) / t.dims.h) * (q.adjust[fd]?.scaleH ?? 1), 0.8, 1.2) }) } }));
    if (t.dims.h < T.centralHeight[0] || t.dims.h > T.centralHeight[1]) issues.push(mk("H_CENTRAL", "info", "proporcao", [fd], `Altura do incisivo central ${fd}`, `${f(t.dims.h)} mm (típico ${T.centralHeight[0]}–${T.centralHeight[1]} mm).`, "Confirme com a exibição incisal em repouso e a fonética."));
  }
  {
    const c = ev.teeth.get(11) ?? ev.teeth.get(21), l = ev.teeth.get(12) ?? ev.teeth.get(22);
    if (c && l) {
      const d = c.lm.incisalMid[2] - l.lm.incisalMid[2]; // superior: borda lateral mais cervical = z maior
      const step = -d;
      if (step < T.lateralShorter[0] || step > T.lateralShorter[1]) issues.push(mk("LAT_STEP", "warning", "estetica", [c.fdi, l.fdi], "Degrau incisal lateral/central", `Lateral ${step >= 0 ? "mais curto" : "mais longo"} em ${f(Math.abs(step))} mm (ideal 0,3–1,5 mm mais curto).`, "Lateral ligeiramente mais curto cria o sorriso em 'asa de gaivota'.", { value: step, fix: { label: `Ajustar degrau incisal do ${l.fdi} (0,8 mm)`, apply: (q) => setAdj(q, l.fdi, { dz: (q.adjust[l.fdi]?.dz ?? 0) + (0.8 - step) }) } }));
    }
  }

  // ---------- Esquema de alturas (X) ----------
  {
    const hs = p.heights ?? DEFAULT_HEIGHTS;
    if (hs.enabled) {
      const off: number[] = [];
      for (const t of ev.teeth.values()) {
        const want = schemeHeight(t.ref.jaw, t.ref.type, hs) * ev.mods.heightScale;
        if (Math.abs(t.dims.h - want) > 0.45) off.push(t.fdi);
      }
      if (off.length) issues.push(mk("H_SCHEME", "info", "proporcao", off, "Alturas fora do esquema X", `Dentes ${off.join(", ")} diferem do esquema (sup.: central X+0,5 · lateral X · canino X+0,5 · PM X · 1º M X−0,5 · 2º M X−1 · inf.: incisivos/PM X · canino X+0,5 · molares X−0,5).`, "Restabeleça as alturas padrão para manter a harmonia do plano oclusal.", { fix: { label: "Restaurar alturas do esquema", apply: (q) => ({ ...q, adjust: Object.fromEntries(Object.entries(q.adjust).map(([k, v]) => [k, { ...v, scaleH: undefined }])) }) } }));
    }
  }

  // ---------- Contorno gengival (zênites) ----------
  // central ≈ canino; lateral ≈ 1º pré-molar; molares seguem a cervical do 2º pré-molar
  const alignZenith = (fdi: number, target: number): ((q: CadProject) => CadProject) => (q) => {
    const t = ev.teeth.get(fdi); if (!t) return q;
    const cur = m.zenith[fdi], dz = target - cur; // superior: cervical mais alta = z maior
    const sgn = t.ref.jaw === "upper" ? 1 : -1;
    return setAdj(q, fdi, { scaleH: clamp((q.adjust[fdi]?.scaleH ?? 1) * ((t.dims.h + sgn * dz) / t.dims.h), 0.8, 1.2) });
  };
  for (const side of [1, 2]) {
    const c = side * 10 + 1, l = side * 10 + 2, k = side * 10 + 3, p1 = side * 10 + 4, p2 = side * 10 + 5, m1 = side * 10 + 6;
    const z = (n: number) => m.zenith[n];
    if (ev.teeth.has(c) && ev.teeth.has(k) && Math.abs(z(c) - z(k)) > T.zenithTol) {
      issues.push(mk("ZENITH_CK", "warning", "estetica", [c, k], `Contorno gengival ${c}/${k}`, `Zênites do central e do canino diferem ${f(Math.abs(z(c) - z(k)))} mm (devem ser semelhantes).`, "Nivele a margem gengival do canino com a do incisivo central.", { value: z(c) - z(k), fix: { label: `Alinhar zênite do ${k} ao do ${c}`, apply: alignZenith(k, z(c)) } }));
    }
    if (ev.teeth.has(l) && ev.teeth.has(p1) && Math.abs(z(l) - z(p1)) > T.zenithTol + 0.3) {
      issues.push(mk("ZENITH_LP", "info", "estetica", [l, p1], `Contorno gengival ${l}/${p1}`, `Zênites do lateral e do 1º pré-molar diferem ${f(Math.abs(z(l) - z(p1)))} mm (devem ser semelhantes).`, "Laterais e pré-molares compartilham o mesmo nível cervical, ligeiramente incisal ao de central/canino.", { value: z(l) - z(p1), fix: { label: `Alinhar zênite do ${p1} ao do ${l}`, apply: alignZenith(p1, z(l)) } }));
    }
    if (ev.teeth.has(m1) && ev.teeth.has(p2) && Math.abs(z(m1) - z(p2)) > T.zenithTol + 0.6) {
      issues.push(mk("ZENITH_M", "info", "estetica", [p2, m1], `Cervical do ${m1}`, `A cervical do 1º molar difere ${f(Math.abs(z(m1) - z(p2)))} mm da do 2º pré-molar (molares seguem a cervical dos pré-molares).`, "Acompanhe a linha cervical dos pré-molares.", { value: z(m1) - z(p2), fix: { label: `Alinhar cervical do ${m1} ao ${p2}`, apply: alignZenith(m1, z(p2)) } }));
    }
  }

  // ---------- Cristas marginais: seguem a altura do dente vizinho ----------
  for (const [a, b] of [[14, 15], [15, 16], [16, 17], [24, 25], [25, 26], [26, 27], [34, 35], [35, 36], [36, 37], [44, 45], [45, 46], [46, 47]]) {
    const A = ev.teeth.get(a), B = ev.teeth.get(b);
    if (!A?.lm.distalRidge || !B?.lm.mesialRidge) continue;
    // a crista distal de A (lado distal do arco) toca a mesial de B
    const d = A.lm.distalRidge[2] - B.lm.mesialRidge[2];
    if (Math.abs(d) > T.ridgeTol) issues.push(mk("RIDGE", Math.abs(d) > T.ridgeTol * 2 ? "warning" : "info", "contatos", [a, b], `Cristas marginais ${a}/${b}`, `Degrau de ${f(Math.abs(d))} mm entre as cristas marginais (devem seguir a altura do vizinho).`, "Nivele as cristas marginais para evitar retenção alimentar e interferência oclusal.", { value: d, fix: { label: `Nivelar crista do ${b} à do ${a}`, apply: (q) => setAdj(q, b, { dz: (q.adjust[b]?.dz ?? 0) + d }) } }));
  }

  // ---------- Material / espessura / conectores ----------
  addMaterial(p, ev, issues);

  // ---------- Foto ----------
  for (const i of analyzePhoto(p, ev)) issues.push(i);

  // ---------- Implantes ----------
  for (const i of analyzeGuide(p, ev)) issues.push(i);

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const cats: Category[] = ["andrews", "oclusao", "proporcao", "estetica", "contatos", "material", "implante", "foto"];
  const scores = {} as Record<Category, number>;
  for (const c of cats) {
    const list = issues.filter((i) => i.category === c);
    scores[c] = round(clamp(100 - list.reduce((s, i) => s + (i.severity === "error" ? 18 : i.severity === "warning" ? 7 : i.severity === "info" ? 2 : 0), 0), 0, 100), 0);
  }
  const counts = { error: 0, warning: 0, info: 0, ok: 0 } as Record<Severity, number>;
  for (const i of issues) counts[i.severity]++;
  const used = cats.filter((c) => issues.some((i) => i.category === c));
  const overall = used.length ? round(used.reduce((s, c) => s + scores[c], 0) / used.length, 0) : 100;
  return { issues, meas: m, scores, overall, counts };
}

function addProportion(p: CadProject, ev: Evaluated, m: Measurements, issues: Issue[]) {
  const tg = proportionTargets(p.proportion);
  if (!tg) return;
  for (const side of [1, 2]) {
    const c = ev.teeth.get(side * 10 + 1), l = ev.teeth.get(side * 10 + 2), k = ev.teeth.get(side * 10 + 3);
    if (!c || !l) continue;
    const wc = m.apparent[c.fdi], wl = m.apparent[l.fdi];
    const rLat = wl / wc;
    const tol = THRESHOLDS.proportionTol;
    if (Math.abs(rLat - tg.lat) > tol) {
      const need = tg.lat * wc;
      issues.push(mk("PROP_LAT", Math.abs(rLat - tg.lat) > tol * 2 ? "warning" : "info", "proporcao", [l.fdi, c.fdi], `Proporção lateral/central (${l.fdi}/${c.fdi})`, `Largura aparente do lateral = ${f(rLat * 100, 0)}% do central (alvo ${f(tg.lat * 100, 0)}% — ${PROPORTION_LABEL[p.proportion].split(" (")[0]}).`, `Ajuste a largura do ${l.fdi} para ≈ ${f(need)} mm (aparente).`, { value: rLat, target: `${f(tg.lat * 100, 0)}%`, fix: { label: `Ajustar largura do ${l.fdi} (${f(need)} mm aparente)`, apply: (q) => setAdj(q, l.fdi, { scaleMd: clamp((q.adjust[l.fdi]?.scaleMd ?? 1) * (need / wl), 0.7, 1.3) }) } }));
    }
    if (k) {
      const wk = m.apparent[k.fdi];
      const rCan = p.proportion === "preston" ? wk / wc : wk / wl;
      const goal = p.proportion === "preston" ? 0.84 : tg.can;
      if (Math.abs(rCan - goal) > tol * (p.proportion === "preston" ? 1.4 : 1.8)) {
        const base = p.proportion === "preston" ? wc : wl;
        const need = goal * base;
        issues.push(mk("PROP_CAN", "info", "proporcao", [k.fdi, l.fdi], `Proporção canino (${k.fdi})`, `Largura aparente do canino = ${f(rCan * 100, 0)}% (alvo ${f(goal * 100, 0)}%).`, `Largura aparente alvo ≈ ${f(need)} mm.`, { value: rCan, target: `${f(goal * 100, 0)}%`, fix: { label: `Ajustar largura do ${k.fdi}`, apply: (q) => setAdj(q, k.fdi, { scaleMd: clamp((q.adjust[k.fdi]?.scaleMd ?? 1) * (need / wk), 0.7, 1.3) }) } }));
      }
    }
  }
}

function addMaterial(p: CadProject, ev: Evaluated, issues: Issue[]) {
  const fdis = [...ev.teeth.keys()].sort((a, b) => a - b);
  for (const fd of fdis) {
    const d = designOf(p, fd);
    if (d.kind === "natural") continue;
    const mat = MATERIALS[d.material];
    const t = ev.teeth.get(fd)!;
    const ant = ANTERIOR.includes(t.ref.type);
    if (d.prep) {
      const needAx = ant ? mat.min.axialAnterior : mat.min.axialPosterior;
      const needOc = ant ? mat.min.incisal : mat.min.occlusal;
      const isVeneer = d.kind === "veneer";
      const needAxial = isVeneer ? mat.min.veneer : needAx;
      if (d.prep.axial + 0.001 < needAxial) issues.push(mk("MAT_AXIAL", "error", "material", [fd], `Espessura axial insuficiente (${fd})`, `Redução axial ${f(d.prep.axial)} mm; ${mat.name} requer ≥ ${f(needAxial)} mm.`, "Aumente a redução do preparo ou escolha um material compatível (zircônia monolítica 0,5–0,8 mm).", { value: d.prep.axial, target: `≥ ${f(needAxial)} mm`, fix: { label: `Redução axial = ${f(needAxial)} mm`, apply: (q) => ({ ...q, designs: { ...q.designs, [fd]: { ...d, prep: { ...d.prep!, axial: needAxial } } } }) } }));
      if (!isVeneer && d.prep.occlusal + 0.001 < needOc) issues.push(mk("MAT_OCC", "error", "material", [fd], `Espessura ${ant ? "incisal" : "oclusal"} insuficiente (${fd})`, `Redução ${f(d.prep.occlusal)} mm; ${mat.name} requer ≥ ${f(needOc)} mm.`, "Risco de fratura da cerâmica. Aumente a redução oclusal ou use zircônia.", { value: d.prep.occlusal, target: `≥ ${f(needOc)} mm`, fix: { label: `Redução oclusal = ${f(needOc)} mm`, apply: (q) => ({ ...q, designs: { ...q.designs, [fd]: { ...d, prep: { ...d.prep!, occlusal: needOc } } } }) } }));
      if (d.prep.taperDeg > 20) issues.push(mk("PREP_TAPER", "warning", "material", [fd], `Conicidade excessiva do preparo (${fd})`, `Convergência total de ${f(d.prep.taperDeg, 0)}° (ideal 6–12°).`, "Retenção reduzida; considere aumentar altura ou usar cimento adesivo.", { value: d.prep.taperDeg, fix: { label: "Conicidade 10°", apply: (q) => ({ ...q, designs: { ...q.designs, [fd]: { ...d, prep: { ...d.prep!, taperDeg: 10 } } } }) } }));
      else if (d.prep.taperDeg < 4) issues.push(mk("PREP_TAPER", "warning", "material", [fd], `Preparo paralelo demais (${fd})`, `Convergência de ${f(d.prep.taperDeg, 0)}° — dificulta inserção e escoamento do cimento.`, "Use 6–12° por paredes opostas."));
      if (d.prep.finish === "featheredge" || d.prep.finish === "knife") issues.push(mk("PREP_FINISH", "info", "material", [fd], `Término em ${d.prep.finish === "knife" ? "lâmina de faca" : "bisel"} (${fd})`, "Término fino exige borda delicada; cerâmicas frágeis podem lascar.", "Prefira chanfro 0,5–1,0 mm ou ombro arredondado para cerâmicas."));
    }
    if (d.kind === "veneer" && t.dims.h < 8) issues.push(mk("VEN_SHORT", "info", "material", [fd], `Faceta em coroa curta (${fd})`, "Coroas curtas oferecem pouca área de colagem.", "Mantenha esmalte nas margens cervicais."));
  }
  // pontes: sequências de pônticos/dentes com design restaurador
  const units = fdis.filter((fd) => designOf(p, fd).kind !== "natural");
  const groups: number[][] = [];
  for (const jaw of [1, 2, 3, 4]) {
    let cur: number[] = [];
    for (let i = 1; i <= 8; i++) {
      const fd = jaw * 10 + i;
      if (units.includes(fd) && designOf(p, fd).kind !== "veneer" && designOf(p, fd).kind !== "inlay" && designOf(p, fd).kind !== "onlay") cur.push(fd); else { if (cur.length) groups.push(cur); cur = []; }
    }
    if (cur.length) groups.push(cur);
  }
  // une quadrantes adjacentes na linha média (11/21, 31/41)
  const merged: number[][] = [];
  for (const g of groups) {
    const last = merged[merged.length - 1];
    if (last && ((last.includes(11) && g.includes(21)) || (last.includes(41) && g.includes(31)))) last.push(...g); else merged.push([...g]);
  }
  for (const g of merged) {
    const hasPontic = g.some((fd) => designOf(p, fd).kind === "pontic");
    if (!hasPontic && g.length < 2) continue;
    if (!hasPontic) continue;
    const mats = new Set(g.map((fd) => designOf(p, fd).material));
    const mat = MATERIALS[[...mats][0]];
    if (!mat.connector) { issues.push(mk("BRIDGE_MAT", "error", "material", g, "Material não indicado para ponte", `${mat.name} não é indicado para estruturas com pônticos.`, "Use zircônia, dissilicato (até 3 unidades), PMMA (provisório) ou metal.", {})); continue; }
    if (mats.size > 1) issues.push(mk("BRIDGE_MIX", "warning", "material", g, "Materiais diferentes na mesma ponte", "Uma ponte deve ser fresada em um único bloco/material.", "Uniformize o material das unidades conectadas."));
    if (g.length > mat.connector.maxUnits) issues.push(mk("BRIDGE_UNITS", "error", "material", g, "Número de unidades excede o material", `${g.length} unidades; ${mat.name} permite até ${mat.connector.maxUnits}.`, "Divida a estrutura ou troque para zircônia 3Y."));
    if (mat.id.startsWith("emax") && g.some((fd) => toothRef(fd).index >= 6)) issues.push(mk("BRIDGE_EMAX", "error", "material", g, "e.max em ponte com molar", "Pontes de dissilicato terminam no 2º pré-molar (3 unidades).", "Use zircônia para estruturas envolvendo molares."));
    const ordered = [...g].sort((a, b) => ev.teeth.get(a)!.pose.arcPos - ev.teeth.get(b)!.pose.arcPos);
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ev.teeth.get(ordered[i])!, b = ev.teeth.get(ordered[i + 1])!;
      if (designOf(p, a.fdi).kind !== "pontic" && designOf(p, b.fdi).kind !== "pontic" && g.length < 3) continue;
      const hh = Math.min(a.dims.h, b.dims.h) * 0.45, ww = Math.min(a.dims.bl, b.dims.bl) * 0.5;
      const area = Math.PI * (hh / 2) * (ww / 2) * (4 / Math.PI) * 0.82; // elipse achatada ≈ h·w·0.82
      const post = a.ref.index >= 4 && b.ref.index >= 4;
      const need = post ? mat.connector.posterior : mat.connector.anterior;
      if (area < need) issues.push(mk("CONN_AREA", "warning", "material", [a.fdi, b.fdi], `Conector ${a.fdi}–${b.fdi} (estimado)`, `Área estimada ${f(area)} mm² (mín. ${f(need, 0)} mm² para ${mat.name}); altura ≈ ${f(hh)} mm, largura ≈ ${f(ww)} mm.`, `Aumente a altura do conector (≥ ${mat.connector.minHeight} mm) e largura (≥ ${mat.connector.minWidth} mm), mantendo a ameia gengival.`, { value: area, target: `≥ ${need} mm²` }));
    }
  }
}
