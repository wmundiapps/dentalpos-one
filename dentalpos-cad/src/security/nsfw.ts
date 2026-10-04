// Filtro de conteúdo explícito (nudez/pornografia) executado localmente (modelo NSFWJS MobileNetV2 embutido). A imagem não sai do computador.
let model: Promise<{ classify(img: HTMLCanvasElement): Promise<Array<{ className: string; probability: number }>> }> | null = null;
async function load() {
  const tf = await import("@tensorflow/tfjs");
  // CPU: o modelo é pequeno (224×224) e evita disputar o contexto WebGL com o visualizador 3D
  await tf.setBackend("cpu"); await tf.ready();
  const { load: nload } = await import("nsfwjs/core");
  const { MobileNetV2Model } = await import("nsfwjs/models/mobilenet_v2");
  return nload("MobileNetV2", { modelDefinitions: [MobileNetV2Model] }) as never;
}
export interface NsfwVerdict { blocked: boolean; scores: Record<string, number> }
/** bloqueia se Porn+Hentai ≥ 0,45 ou Sexy ≥ 0,85 (fotos clínicas de sorriso ficam em “Neutral”) */
export async function checkExplicit(canvas: HTMLCanvasElement): Promise<NsfwVerdict> {
  model ??= load();
  const guard = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Não foi possível verificar o conteúdo da imagem (tempo esgotado). Tente novamente.")), 60_000));
  const preds = await Promise.race([(async () => (await model!).classify(canvas))(), guard]);
  const s: Record<string, number> = {}; for (const p of preds) s[p.className] = p.probability;
  const blocked = (s.Porn ?? 0) + (s.Hentai ?? 0) >= 0.45 || (s.Sexy ?? 0) >= 0.85;
  return { blocked, scores: s };
}
