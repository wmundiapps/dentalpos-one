// Escaneamento intraoral e documentação, pagos antes do tratamento.
// Preços ficam na tabela settings (tela "Preços" do painel); o termo é versionado e aceito com "Li e aceito".
import { escapeHtml as e, brl, sha256 } from './util.js';
import { MODEL } from './pricing.js';

export const SCAN_TERMS_VERSION = 'escaneamento-2026-10-11';

export async function getPrices(sql) {
  const [row] = await sql`select value from settings where key = 'prices'`;
  const v = row?.value || {};
  const n = (x) => (Number(x) > 0 ? Math.round(Number(x) * 100) / 100 : null);
  // tabela da AlignSystem por marca (até 3): tratamento por grau + custo dos alinhadores por grau
  const brands = (Array.isArray(v.brands) ? v.brands : []).map((b) => ({
    name: String(b.name || ''), origin: b.origin === 'importado' ? 'importado' : 'nacional',
    simples: n(b.simples), mediano: n(b.mediano), complexo: n(b.complexo),
    aligner: { simples: n(b.aligner?.simples), mediano: n(b.aligner?.mediano), complexo: n(b.aligner?.complexo) },
  }));
  const min = (k) => { const vals = brands.map((b) => b[k]).filter(Boolean); return vals.length ? Math.min(...vals) : n(v[k]); };
  return {
    scan: n(v.scan), simples: min('simples'), mediano: min('mediano'), complexo: min('complexo'), brands,
    // custo dos alinhadores por complexidade sem marca (tabela antiga), usado só se a marca do caso não estiver na tabela
    aligner: { simples: n(v.aligner?.simples), mediano: n(v.aligner?.mediano), complexo: n(v.aligner?.complexo) },
  };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Custo dos alinhadores da marca do caso, no grau de dificuldade do caso (modelo preço próprio)
export function alignerCostFor(prices, brand, complexity) {
  const key = norm(brand);
  const hit = key && prices.brands.find((b) => norm(b.name) === key);
  if (hit) return hit.aligner[complexity] || null;
  return prices.brands.length ? null : prices.aligner[complexity] || null;
}

export function scanTerms(price) {
  const body = [
    '<h3>Termo de contratação do escaneamento</h3>',
    `<p>1. O escaneamento intraoral digital e a documentação ortodôntica (fotografias e radiografias, conforme indicação clínica) custam <b>${e(brl(price))}</b>, pagos antecipadamente, e são realizados por clínica de radiologia e documentação indicada pela AlignSystem (Instituto Ravel de Ensino Superior Ltda).</p>`,
    '<p>2. O escaneamento serve para o dentista confirmar a indicação dos alinhadores, definir o grau de dificuldade do caso (simples, média complexidade ou complexo) e elaborar o plano de tratamento. O tratamento com alinhadores é contratado à parte, com contrato próprio, somente depois da apresentação do plano.</p>',
    '<p><b>3. Direito de arrependimento: você pode desistir desta contratação em até 7 (sete) dias, nos termos do art. 49 do Código de Defesa do Consumidor. Se desistir antes de o escaneamento ser realizado, o valor é devolvido integralmente. Depois de realizado o escaneamento, o valor não é devolvido, porque corresponde a serviço já prestado e repassado à clínica de radiologia.</b></p>',
    '<p>4. Depois de conhecer o plano e o valor do tratamento, você é livre para não contratá-lo. Nesse caso, nada mais é cobrado além do escaneamento.</p>',
    '<p>5. O agendamento é confirmado pela equipe AlignSystem conforme a disponibilidade da clínica de radiologia mais próxima. Faltas sem aviso com pelo menos 24 horas de antecedência podem exigir novo pagamento para remarcar.</p>',
    '<p>6. Seus dados e imagens são usados somente para o seu atendimento, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e a política de privacidade da AlignSystem.</p>',
  ].join('');
  return { version: SCAN_TERMS_VERSION, body, hash: sha256(body) };
}

export const consultLimits = MODEL.consultLimits;
