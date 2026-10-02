// IA integrada do DentalPos CAD.
//  1) Assistente local determinístico (sem rede, sem custo): autocorreção iterativa, recomendação de desenho, explicações.
//  2) Provedor opcional de LLM (ex.: Claude) para explicações/justificativas em linguagem natural — interface plugável.
import { analyze, type AutoFix, type Issue, type Report } from "./rules";
import { createProject, evaluate, type CadProject } from "./project";
import { FACE_TO_FORM, FORM_LABEL, FACE_LABEL, SEX_LABEL, ETHNICITY_LABEL, AGE_LABEL, styleModifiers, type PatientProfile } from "./profiles";
import { analyzeFace } from "./smile";

export interface AutoCorrectResult { project: CadProject; applied: Array<{ code: string; label: string; teeth: number[] }>; before: Report; after: Report; rounds: number }

/** Aplica as correções automáticas disponíveis em rodadas, até convergir (ou nada mais ser corrigível). */
export function autoCorrect(p0: CadProject, opts: { maxRounds?: number; minSeverity?: "error" | "warning" | "info"; categories?: string[] } = {}): AutoCorrectResult {
  const maxRounds = opts.maxRounds ?? 12;
  const level = { error: 0, warning: 1, info: 2 }[opts.minSeverity ?? "warning"];
  const rank = (s: string) => ({ error: 0, warning: 1, info: 2, ok: 3 } as Record<string, number>)[s];
  let p = p0;
  const before = analyze(p0);
  const applied: AutoCorrectResult["applied"] = [];
  const tried = new Set<string>();
  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    const rep = analyze(p);
    const cand = rep.issues.filter((i) => i.fix && rank(i.severity) <= level && (!opts.categories || opts.categories.includes(i.category)) && !tried.has(`${i.code}|${i.teeth.join(",")}|${i.fix.label}`));
    if (!cand.length) break;
    // ordem de prioridade: oclusão/Andrews primeiro, depois estética/proporção (evita retrabalho)
    const prio: Record<string, number> = { oclusao: 0, andrews: 1, contatos: 2, proporcao: 3, estetica: 4, material: 5, foto: 6, implante: 7 };
    cand.sort((a, b) => rank(a.severity) - rank(b.severity) || prio[a.category] - prio[b.category]);
    let progressed = false;
    const touched = new Set<number>();
    for (const i of cand) {
      const k = `${i.code}|${i.teeth.join(",")}|${i.fix!.label}`;
      if (i.teeth.some((t) => touched.has(t))) continue; // mesmo dente já alterado nesta rodada: reavalia antes
      tried.add(k);
      const q = i.fix!.apply(p);
      if (JSON.stringify(q) !== JSON.stringify(p)) { p = q; applied.push({ code: i.code, label: i.fix!.label, teeth: i.teeth }); progressed = true; i.teeth.forEach((t) => touched.add(t)); }
    }
    if (!progressed) break;
  }
  return { project: p, applied, before, after: analyze(p), rounds };
}

export interface DesignRecommendation {
  form: keyof typeof FORM_LABEL;
  alternatives: Array<keyof typeof FORM_LABEL>;
  summary: string;
  bullets: string[];
  suggestedShade: string;
  proportion: CadProject["proportion"];
  arch: "ovoid" | "square" | "tapered";
}
/** Recomenda forma, proporção e cor a partir do perfil do paciente (e, se houver, da análise facial da foto). */
export function recommendDesign(profile: PatientProfile, photo?: CadProject["photo"]): DesignRecommendation {
  const face = photo?.landmarks ? analyzeFace(photo.landmarks) : null;
  const shape = face?.shape ?? profile.face;
  const rec = FACE_TO_FORM[shape];
  const mods = styleModifiers({ ...profile, face: shape }, rec.primary);
  const shade = profile.age === "senior" ? "A3" : profile.age === "mature" ? "A2" : profile.style === "hollywood" ? "BL2" : profile.age === "young" ? "A1" : "A1";
  const arch = rec.primary === "square" ? "square" : rec.primary === "tapered" ? "tapered" : "ovoid";
  const bullets = [
    `Face ${FACE_LABEL[shape]}${face ? ` (detectada na foto: L/A ${face.lengthWidth}, mandíbula/zigoma ${face.jawRatio})` : ""} → forma ${FORM_LABEL[rec.primary]}. ${rec.why}`,
    `Perfil: ${SEX_LABEL[profile.sex]}, ${ETHNICITY_LABEL[profile.ethnicity]}, ${AGE_LABEL[profile.age]}.`,
    ...mods.notes,
    `Largura do central ≈ ${(8.5 * mods.widthScale).toFixed(1)} mm; altura ≈ ${(10.5 * mods.heightScale).toFixed(1)} mm (L/A ${(Math.round((8.5 * mods.widthScale) / (10.5 * mods.heightScale) * 100))}%).`,
    "Referências populacionais são estatísticas — individualize por fotos, fonética e desejo do paciente.",
  ];
  return { form: rec.primary, alternatives: rec.alternatives, summary: `${FORM_LABEL[rec.primary]} (alternativas: ${rec.alternatives.map((a) => FORM_LABEL[a]).join(", ")})`, bullets, suggestedShade: shade, proportion: profile.style === "hollywood" ? "golden" : "red70", arch };
}

/** "Wizard": cria um projeto completo já harmonizado (perfil → forma → proporções → correções). */
export function autoDesign(profile: Partial<PatientProfile>, photo?: CadProject["photo"]): { project: CadProject; recommendation: DesignRecommendation; correction: AutoCorrectResult } {
  const base = createProject(profile);
  const rec = recommendDesign(base.patient, photo);
  let p: CadProject = { ...base, form: rec.form, shade: rec.suggestedShade, proportion: rec.proportion, photo: photo ?? base.photo };
  p = { ...p, arches: { upper: { ...p.arches.upper, form: rec.arch }, lower: { ...p.arches.lower, form: rec.arch } } };
  const correction = autoCorrect(p, { minSeverity: "info" });
  return { project: correction.project, recommendation: rec, correction };
}

/** Explicação passo a passo de um achado (conteúdo local). */
export function explain(i: Issue): string {
  return [`${i.title}`, i.message, i.target ? `Meta: ${i.target}.` : "", `Como corrigir: ${i.tip}`, i.fix ? `Correção automática disponível: ${i.fix.label}.` : "Correção manual necessária."].filter(Boolean).join("\n");
}

// ---------------- Provedor opcional de LLM ----------------
export interface LlmProvider { name: string; complete(prompt: string, system?: string): Promise<string> }
/** Provedor Claude via API Messages (a chave fica no navegador do usuário/servidor proxy — nunca no repositório). */
export function claudeProvider(opts: { apiKey?: string; endpoint?: string; model?: string }): LlmProvider {
  return {
    name: "Claude",
    async complete(prompt, system) {
      const res = await fetch(opts.endpoint ?? "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...(opts.apiKey ? { "x-api-key": opts.apiKey, "anthropic-dangerous-direct-browser-access": "true" } : {}) },
        body: JSON.stringify({ model: opts.model ?? "claude-sonnet-5-5", max_tokens: 900, system, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`LLM ${res.status}`);
      const j = await res.json();
      return (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    },
  };
}
export async function llmReview(provider: LlmProvider, p: CadProject, report: Report): Promise<string> {
  const ev = evaluate(p);
  const resumo = report.issues.filter((i) => i.severity !== "ok").slice(0, 25).map((i) => `- [${i.severity}] ${i.title}: ${i.message}`).join("\n");
  const prompt = `Você é um protético/dentista especialista em CAD. Caso: face ${p.patient.face}, sexo ${p.patient.sex}, etnia ${p.patient.ethnicity}, idade ${p.patient.age}, forma ${p.form}, ${ev.teeth.size} dentes.\nMedições: overjet ${report.meas.overjet?.toFixed(1)} mm, overbite ${report.meas.overbite?.toFixed(1)} mm, Spee ${report.meas.speeDepth.max?.toFixed(1)} mm.\nAchados:\n${resumo}\n\nEscreva em português (máx. 8 linhas) uma revisão objetiva com prioridades de correção e riscos clínicos.`;
  return provider.complete(prompt, "Responda sempre em português do Brasil, de forma técnica e concisa. Não faça diagnóstico; apoie a decisão do profissional.");
}
export type { AutoFix };
