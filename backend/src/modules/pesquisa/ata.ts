import { Branding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'

export interface AtaDefesaInput {
  numero: string
  tipoRotulo: string           // "Trabalho de Conclusão de Curso", "Dissertação de Mestrado"...
  titulo: string
  alunoNome: string
  programaNome?: string | null
  orientadorNome?: string | null
  coorientadorNome?: string | null
  dataDefesa: Date
  local?: string | null
  modo?: string | null
  banca: Array<{ nome: string; papel: string; instituicao?: string | null; titulacao?: string | null; nota?: number | null; parecer?: string | null }>
  media: number | null
  resultado?: string | null
  ressalvas?: string | null
  similaridadePct?: number | null
  fase?: 'DEFESA' | 'QUALIFICACAO'
}

const PAPEL: Record<string, string> = { PRESIDENTE: 'Presidente / Orientador(a)', EXAMINADOR_INTERNO: 'Examinador(a) interno(a)', EXAMINADOR_EXTERNO: 'Examinador(a) externo(a)', SUPLENTE: 'Suplente' }
const RES: Record<string, string> = { APROVADO: 'APROVADO(A)', APROVADO_COM_RESSALVAS: 'APROVADO(A) COM RESSALVAS', REPROVADO: 'REPROVADO(A)' }

const extenso = (d: Date) =>
  d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

// Ata de defesa/qualificação em HTML pronto para impressão, com cabeçalho institucional e espaço de logomarca.
export function ataDefesaHtml(b: Branding, a: AtaDefesaInput): string {
  const fase = a.fase ?? 'DEFESA'
  const titulares = a.banca.filter((m) => m.papel !== 'SUPLENTE')
  const linhas = a.banca
    .map(
      (m) => `<tr><td>${esc(m.nome)}${m.titulacao ? `<br/><small>${esc(m.titulacao)}</small>` : ''}</td><td>${esc(m.instituicao || '—')}</td><td>${esc(PAPEL[m.papel] || m.papel)}</td><td style="text-align:center">${m.nota != null ? m.nota.toFixed(1).replace('.', ',') : '—'}</td></tr>`,
    )
    .join('')
  const assinaturas = [...titulares.map((m) => ({ nome: m.nome, rotulo: PAPEL[m.papel] || m.papel })), { nome: a.alunoNome, rotulo: 'Discente' }]
    .map((s) => `<div style="flex:1 1 44%;min-width:240px;margin-top:44px;text-align:center"><div style="border-top:1px solid #0f172a;padding-top:4px;font-size:12px"><b>${esc(s.nome)}</b><br/>${esc(s.rotulo)}</div></div>`)
    .join('')
  const resultado = a.resultado ? RES[a.resultado] || a.resultado : 'PENDENTE'
  const pareceres = a.banca.filter((m) => m.parecer).map((m) => `<li><b>${esc(m.nome)}:</b> ${esc(m.parecer)}</li>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Ata ${esc(a.numero)}</title>
<style>@page{size:A4;margin:16mm}body{font-family:Georgia,serif;color:#0f172a;max-width:800px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:13px;vertical-align:top}th{background:#f1f5f9;text-align:left}p{line-height:1.6;text-align:justify;font-size:14px}.res{margin:16px 0;padding:12px;border:2px solid ${esc(b.cores.primaria)};text-align:center;font-weight:700;letter-spacing:.05em}</style></head><body>
${brandHeaderHtml(b, { titulo: `Ata de ${fase === 'DEFESA' ? 'Defesa' : 'Qualificação'} nº ${a.numero}`, subtitulo: a.programaNome || a.tipoRotulo })}
<div style="padding:20px 28px">
<p>Aos ${esc(extenso(a.dataDefesa))}, às ${esc(hora(a.dataDefesa))}, ${a.local ? `no local <b>${esc(a.local)}</b>` : 'em local previamente designado'}${a.modo ? ` (modalidade ${esc(a.modo.toLowerCase())})` : ''}, reuniu-se a banca examinadora constituída para a ${fase === 'DEFESA' ? 'defesa pública' : 'qualificação'} do(a) ${esc(a.tipoRotulo)} intitulado(a) <b>“${esc(a.titulo)}”</b>, de autoria de <b>${esc(a.alunoNome)}</b>${a.orientadorNome ? `, sob orientação de <b>${esc(a.orientadorNome)}</b>` : ''}${a.coorientadorNome ? ` e coorientação de <b>${esc(a.coorientadorNome)}</b>` : ''}.</p>
<table><thead><tr><th>Membro</th><th>Instituição</th><th>Função</th><th style="width:70px">Nota</th></tr></thead><tbody>${linhas}</tbody></table>
<p>Após a exposição do(a) candidato(a) e a arguição pelos membros da banca, procedeu-se à avaliação. A média final atribuída foi <b>${a.media != null ? a.media.toFixed(2).replace('.', ',') : '—'}</b>.${a.similaridadePct != null ? ` O índice de similaridade verificado foi de ${a.similaridadePct.toFixed(1).replace('.', ',')}%.` : ''}</p>
<div class="res">RESULTADO: ${esc(resultado)}</div>
${a.ressalvas ? `<p><b>Ressalvas / correções exigidas:</b> ${esc(a.ressalvas)}</p>` : ''}
${pareceres ? `<p><b>Pareceres:</b></p><ul style="font-size:13px">${pareceres}</ul>` : ''}
<p>Nada mais havendo a tratar, lavrou-se a presente ata, que vai assinada pelos membros da banca e pelo(a) discente.</p>
<div style="display:flex;flex-wrap:wrap;gap:24px">${assinaturas}</div>
<p style="font-size:11px;color:#64748b;margin-top:32px;text-align:center">Documento gerado em ${esc(new Date().toLocaleDateString('pt-BR'))} · ${esc(b.nome)}</p>
</div></body></html>`
}
