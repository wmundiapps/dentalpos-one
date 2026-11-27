/**
 * Seed do ACOMPANHAMENTO VIRTUAL DO ALUNO (EduMaster Pro): cria as regras padrão de e-mail (volta aos estudos, videoaulas, atividades,
 * provas, aulas práticas, estágios, ENADE/PIESC e resumo semanal), cadastra ENADE e PIESC no calendário e executa a régua uma vez,
 * gerando o histórico que aparece em Comunicação > Acompanhamento do aluno. Dados fictícios. Idempotente.
 */
type Api = (method: string, path: string, body?: any) => Promise<any>
export async function seedAcompanhamento(api: Api, ctx: { failures?: string[] } = {}) {
  const falha = (m: string, e?: any) => { ctx.failures?.push(`seedAcompanhamento: ${m} ${e?.message ?? ''}`); console.log('!! seedAcompanhamento:', m, e?.message ?? '') }
  const dia = 86_400_000
  const em = (d: number, h = 9) => { const x = new Date(Date.now() + d * dia); x.setHours(h, 0, 0, 0); return x.toISOString() }
  try {
    const eventos = await api('GET', '/edu/calendario/eventos?pageSize=500').catch(() => null)
    const lista: any[] = Array.isArray(eventos) ? eventos : eventos?.items ?? []
    if (!lista.some((e) => e.tipo === 'ENADE' && new Date(e.inicio) > new Date())) await api('POST', '/edu/calendario/eventos', { tipo: 'ENADE', titulo: 'ENADE — Exame Nacional de Desempenho dos Estudantes', inicio: em(25), fim: em(25, 18), diaInteiro: true, publico: 'ALUNOS' })
    if (!lista.some((e) => /PIESC/.test(e.titulo) && new Date(e.inicio) > new Date())) await api('POST', '/edu/calendario/eventos', { tipo: 'EVENTO_INSTITUCIONAL', titulo: 'PIESC — entrega do relatório de atividades', inicio: em(10), fim: em(10, 18), diaInteiro: true, publico: 'ALUNOS' })
  } catch (e) { falha('eventos de calendário', e) }
  try { await api('POST', '/edu/acompanhamento/bootstrap', {}) } catch (e) { falha('regras padrão', e) }
  try { await api('PUT', '/edu/acompanhamento/config', { maxPorAlunoDia: 2, maxPorAlunoSemana: 5, remetenteNome: 'UNINGÁ' }) } catch (e) { falha('config', e) }
  try { const r = await api('POST', '/edu/acompanhamento/executar', {}); console.log('acompanhamento: e-mails enfileirados', r?.enfileiradas) } catch (e) { falha('execução inicial', e) }
}
