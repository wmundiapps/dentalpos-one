import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { WRITE } from './common'
import { EIXOS_SINAES } from './cpaLogic'

type P = { eixo: number; dimensao?: number; texto: string; tipo?: 'LIKERT5' | 'SIM_NAO' | 'TEXTO' }

const COMUNS: P[] = [
  { eixo: 1, dimensao: 8, texto: 'Conheço o processo de autoavaliação da instituição e seus objetivos.' },
  { eixo: 1, dimensao: 8, texto: 'Os resultados da autoavaliação anterior foram divulgados e levados em conta pela instituição.' },
  { eixo: 2, dimensao: 1, texto: 'Conheço a missão, a visão e os objetivos do Plano de Desenvolvimento Institucional (PDI).' },
  { eixo: 2, dimensao: 3, texto: 'A instituição contribui para o desenvolvimento da região e para a inclusão social.' },
  { eixo: 3, dimensao: 4, texto: 'Os canais de comunicação da instituição com a comunidade são claros e eficientes.' },
  { eixo: 5, dimensao: 7, texto: 'As instalações (salas, laboratórios, biblioteca, banheiros) atendem adequadamente às necessidades.' },
  { eixo: 5, dimensao: 7, texto: 'Os recursos de acessibilidade (física, digital e comunicacional) são adequados.' },
  { eixo: 5, dimensao: 7, texto: 'Os recursos de tecnologia da informação (internet, plataformas, equipamentos) são adequados.' },
]
const POR_SEGMENTO: Record<string, P[]> = {
  DISCENTE: [
    { eixo: 3, dimensao: 2, texto: 'Os professores demonstram domínio dos conteúdos e clareza nas aulas.' },
    { eixo: 3, dimensao: 2, texto: 'O curso oferece oportunidades de pesquisa, extensão e iniciação científica.' },
    { eixo: 3, dimensao: 2, texto: 'Os instrumentos de avaliação da aprendizagem são coerentes com o que foi ensinado.' },
    { eixo: 3, dimensao: 9, texto: 'Os programas de apoio ao estudante (bolsas, monitoria, nivelamento, apoio psicopedagógico) são suficientes.' },
    { eixo: 3, dimensao: 9, texto: 'O atendimento da secretaria e da coordenação resolve minhas demandas com agilidade.' },
    { eixo: 4, dimensao: 6, texto: 'A coordenação do curso é acessível e conduz bem a gestão acadêmica.' },
    { eixo: 3, dimensao: 2, texto: 'Que sugestão você daria para melhorar o seu curso?', tipo: 'TEXTO' },
  ],
  DOCENTE: [
    { eixo: 3, dimensao: 2, texto: 'O Projeto Pedagógico do Curso (PPC) é conhecido e orienta o meu planejamento.' },
    { eixo: 3, dimensao: 2, texto: 'A instituição incentiva a pesquisa e a extensão.' },
    { eixo: 4, dimensao: 5, texto: 'A política de capacitação e qualificação docente é adequada.' },
    { eixo: 4, dimensao: 5, texto: 'O plano de carreira docente é claro e aplicado de forma transparente.' },
    { eixo: 4, dimensao: 6, texto: 'A gestão institucional é participativa e as decisões dos colegiados são divulgadas.' },
    { eixo: 4, dimensao: 10, texto: 'Os salários e benefícios são pagos regularmente e de forma adequada.' },
    { eixo: 4, dimensao: 6, texto: 'Que sugestão você daria para melhorar a gestão da instituição?', tipo: 'TEXTO' },
  ],
  TECNICO_ADMINISTRATIVO: [
    { eixo: 4, dimensao: 5, texto: 'As condições de trabalho e o clima organizacional são adequados.' },
    { eixo: 4, dimensao: 5, texto: 'Há oportunidades de capacitação e crescimento na carreira.' },
    { eixo: 4, dimensao: 6, texto: 'As atribuições do meu setor e os fluxos de trabalho são claros.' },
    { eixo: 4, dimensao: 6, texto: 'Sinto que a gestão ouve e considera as sugestões do corpo técnico-administrativo.' },
    { eixo: 4, dimensao: 10, texto: 'Os recursos materiais e tecnológicos de que preciso estão disponíveis.' },
    { eixo: 4, dimensao: 5, texto: 'Que sugestão você daria para melhorar o seu ambiente de trabalho?', tipo: 'TEXTO' },
  ],
  SOCIEDADE_CIVIL: [
    { eixo: 2, dimensao: 3, texto: 'A instituição mantém relação constante e útil com a comunidade e as empresas da região.' },
    { eixo: 2, dimensao: 3, texto: 'Os projetos de extensão e ações sociais da instituição têm impacto positivo local.' },
    { eixo: 3, dimensao: 4, texto: 'A instituição divulga suas atividades e resultados de forma transparente.' },
    { eixo: 3, dimensao: 2, texto: 'Os egressos da instituição estão bem preparados para o mercado de trabalho.' },
    { eixo: 2, dimensao: 3, texto: 'Que ações a instituição poderia desenvolver em benefício da comunidade?', tipo: 'TEXTO' },
  ],
}
const TITULO_SEG: Record<string, string> = { DISCENTE: 'Discentes', DOCENTE: 'Docentes', TECNICO_ADMINISTRATIVO: 'Técnico-administrativos', SOCIEDADE_CIVIL: 'Sociedade civil' }

const PAUTAS: Array<{ chave: string; titulo: string; itens: Array<{ titulo: string; tipo: 'INFORME' | 'DELIBERACAO' }> }> = [
  { chave: 'CONSUP_ORDINARIA', titulo: 'CONSUP — reunião ordinária', itens: [
    { titulo: 'Verificação de quórum e abertura', tipo: 'INFORME' }, { titulo: 'Leitura e aprovação da ata anterior', tipo: 'DELIBERACAO' },
    { titulo: 'Informes da Reitoria', tipo: 'INFORME' }, { titulo: 'Prestação de contas e execução orçamentária', tipo: 'DELIBERACAO' },
    { titulo: 'Acompanhamento do PDI', tipo: 'INFORME' }, { titulo: 'Assuntos gerais e encerramento', tipo: 'INFORME' } ] },
  { chave: 'CONSEPE_ORDINARIA', titulo: 'CONSEPE — reunião ordinária', itens: [
    { titulo: 'Verificação de quórum e abertura', tipo: 'INFORME' }, { titulo: 'Aprovação da ata anterior', tipo: 'DELIBERACAO' },
    { titulo: 'Criação/alteração de cursos e PPCs', tipo: 'DELIBERACAO' }, { titulo: 'Calendário acadêmico', tipo: 'DELIBERACAO' },
    { titulo: 'Normas acadêmicas e resoluções', tipo: 'DELIBERACAO' }, { titulo: 'Informes e encerramento', tipo: 'INFORME' } ] },
  { chave: 'COLEGIADO_CURSO', titulo: 'Colegiado de curso — reunião ordinária', itens: [
    { titulo: 'Verificação de quórum e abertura', tipo: 'INFORME' }, { titulo: 'Aprovação da ata anterior', tipo: 'DELIBERACAO' },
    { titulo: 'Planos de ensino e oferta de disciplinas', tipo: 'DELIBERACAO' }, { titulo: 'Desempenho discente, evasão e retenção', tipo: 'INFORME' },
    { titulo: 'Atividades complementares, estágios e TCC', tipo: 'DELIBERACAO' }, { titulo: 'Informes e encerramento', tipo: 'INFORME' } ] },
  { chave: 'NDE', titulo: 'NDE — reunião ordinária', itens: [
    { titulo: 'Acompanhamento da implementação do PPC', tipo: 'INFORME' }, { titulo: 'Atualização das ementas e bibliografias', tipo: 'DELIBERACAO' },
    { titulo: 'Resultados do ENADE e da CPA para o curso', tipo: 'INFORME' }, { titulo: 'Encaminhamentos', tipo: 'DELIBERACAO' } ] },
  { chave: 'CIPA_MENSAL', titulo: 'CIPA — reunião ordinária mensal', itens: [
    { titulo: 'Leitura e aprovação da ata anterior', tipo: 'DELIBERACAO' }, { titulo: 'Acidentes e incidentes do período', tipo: 'INFORME' },
    { titulo: 'Acompanhamento do mapa de riscos e plano de ação', tipo: 'INFORME' }, { titulo: 'Planejamento de inspeções e da SIPAT', tipo: 'DELIBERACAO' } ] },
]

const NIVEIS_DOCENTE = [
  { codigo: 'AUX', nome: 'Professor Auxiliar', classe: 'A', titulacaoMinima: 'ESPECIALISTA', intersticioMeses: 0, pontuacaoMinima: 0, avaliacaoMinima: 0, salarioBase: 4500 },
  { codigo: 'ASS', nome: 'Professor Assistente', classe: 'B', titulacaoMinima: 'ESPECIALISTA', intersticioMeses: 24, pontuacaoMinima: 40, avaliacaoMinima: 7, salarioBase: 5800 },
  { codigo: 'ADJ', nome: 'Professor Adjunto', classe: 'C', titulacaoMinima: 'MESTRE', intersticioMeses: 24, pontuacaoMinima: 80, avaliacaoMinima: 7, salarioBase: 7600 },
  { codigo: 'ASC', nome: 'Professor Associado', classe: 'D', titulacaoMinima: 'DOUTOR', intersticioMeses: 36, pontuacaoMinima: 150, avaliacaoMinima: 8, salarioBase: 10200 },
  { codigo: 'TIT', nome: 'Professor Titular', classe: 'E', titulacaoMinima: 'DOUTOR', intersticioMeses: 48, pontuacaoMinima: 300, avaliacaoMinima: 8.5, salarioBase: 13500 },
]
const NIVEIS_TAE = [
  { codigo: 'N1', nome: 'Auxiliar Administrativo', classe: 'A', intersticioMeses: 0, pontuacaoMinima: 0, avaliacaoMinima: 0, salarioBase: 2200 },
  { codigo: 'N2', nome: 'Assistente Administrativo', classe: 'B', intersticioMeses: 24, pontuacaoMinima: 20, avaliacaoMinima: 7, salarioBase: 2800 },
  { codigo: 'N3', nome: 'Analista', classe: 'C', intersticioMeses: 30, pontuacaoMinima: 40, avaliacaoMinima: 7.5, salarioBase: 4200 },
  { codigo: 'N4', nome: 'Analista Sênior / Coordenador', classe: 'D', intersticioMeses: 36, pontuacaoMinima: 70, avaliacaoMinima: 8, salarioBase: 6200 },
]

export function registerBootstrap(router: Router) {
  router.post('/bootstrap', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const out = { modelosQuestionario: 0, pautasModelo: 0, planosCarreira: 0, niveis: 0, pdi: 0, eixosPdi: 0 }

    for (const seg of Object.keys(POR_SEGMENTO)) {
      const chave = `CPA_${seg}`
      const perguntas = [...COMUNS, ...POR_SEGMENTO[seg]].sort((a, b) => a.eixo - b.eixo)
      const ex = await prisma.govCpaModeloQuestionario.findUnique({ where: { tenantId_chave: { tenantId, chave } } })
      if (!ex) { await prisma.govCpaModeloQuestionario.create({ data: { tenantId, chave, titulo: `Autoavaliação institucional — ${TITULO_SEG[seg]}`, segmento: seg as any, perguntas: perguntas.map((p) => ({ tipo: 'LIKERT5', ...p })) as any } }); out.modelosQuestionario++ }
    }
    for (const p of PAUTAS) {
      const ex = await prisma.govPautaModelo.findUnique({ where: { tenantId_chave: { tenantId, chave: p.chave } } })
      if (!ex) { await prisma.govPautaModelo.create({ data: { tenantId, chave: p.chave, titulo: p.titulo, itens: p.itens as any } }); out.pautasModelo++ }
    }
    const planos: Array<[string, 'DOCENTE' | 'TECNICO_ADMINISTRATIVO', any[]]> = [
      ['Plano de Carreira Docente (modelo)', 'DOCENTE', NIVEIS_DOCENTE], ['Plano de Carreira Técnico-Administrativo (modelo)', 'TECNICO_ADMINISTRATIVO', NIVEIS_TAE],
    ]
    for (const [nome, tipo, niveis] of planos) {
      let plano = await prisma.govCarreiraPlano.findFirst({ where: { tenantId, nome } })
      if (!plano) { plano = await prisma.govCarreiraPlano.create({ data: { tenantId, nome, tipo } }); out.planosCarreira++ }
      for (let i = 0; i < niveis.length; i++) {
        const ex = await prisma.govCarreiraNivel.findFirst({ where: { tenantId, planoId: plano.id, ordem: i + 1 } })
        if (!ex) { await prisma.govCarreiraNivel.create({ data: { tenantId, planoId: plano.id, ordem: i + 1, ...niveis[i] } }); out.niveis++ }
      }
    }
    if ((await prisma.govPdi.count({ where: { tenantId } })) === 0) {
      const ano = new Date().getFullYear()
      const pdi = await prisma.govPdi.create({ data: { tenantId, titulo: `PDI ${ano}–${ano + 4}`, anoInicio: ano, anoFim: ano + 4 } })
      out.pdi++
      for (const [k, e] of Object.entries(EIXOS_SINAES)) {
        await prisma.govPdiEixo.create({ data: { tenantId, pdiId: pdi.id, nome: e.nome, eixoSinaes: Number(k), dimensaoSinaes: e.dimensoes[0]?.n, ordem: Number(k) } })
        out.eixosPdi++
      }
    }
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca', acao: 'BOOTSTRAP', detalhes: out })
    res.json({ ok: true, criados: out })
  }))
}
