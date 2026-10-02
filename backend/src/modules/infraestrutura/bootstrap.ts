import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { GESTAO, LEITURA, MODULO } from './util'

export const CATEGORIAS_PADRAO = [
  { codigo: 'MOBILIARIO', nome: 'Mobiliário (carteiras, mesas, armários)', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'MOVEL' },
  { codigo: 'COMPUTADOR', nome: 'Computadores e notebooks', vidaUtilMeses: 60, valorResidualPct: 10, grupo: 'TI' },
  { codigo: 'PROJETOR', nome: 'Projetores e telas', vidaUtilMeses: 60, valorResidualPct: 10, grupo: 'EQUIPAMENTO' },
  { codigo: 'AR-COND', nome: 'Ar-condicionado', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'EQUIPAMENTO' },
  { codigo: 'MICROSCOPIO', nome: 'Microscópios', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'BALANCA', nome: 'Balanças analíticas', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'AUTOCLAVE', nome: 'Autoclaves e esterilizadores', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'CAPELA', nome: 'Capelas de exaustão', vidaUtilMeses: 180, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'BANCADA-LAB', nome: 'Bancadas e equipamentos de laboratório', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'CADEIRA-ODONTO', nome: 'Cadeiras/equipos odontológicos', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'MANEQUIM', nome: 'Manequins e simuladores', vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' },
  { codigo: 'SERVIDOR', nome: 'Servidores e redes', vidaUtilMeses: 60, valorResidualPct: 5, grupo: 'TI' },
  { codigo: 'ACERVO', nome: 'Acervo bibliográfico (equipamentos)', vidaUtilMeses: 120, valorResidualPct: 0, grupo: 'EQUIPAMENTO' },
  { codigo: 'VEICULO', nome: 'Veículos', vidaUtilMeses: 60, valorResidualPct: 20, grupo: 'VEICULO' },
  { codigo: 'EXTINTOR', nome: 'Extintores e segurança', vidaUtilMeses: 120, valorResidualPct: 0, grupo: 'EQUIPAMENTO' },
  { codigo: 'GERADOR', nome: 'Geradores e nobreaks', vidaUtilMeses: 180, valorResidualPct: 10, grupo: 'EQUIPAMENTO' },
  { codigo: 'ELEVADOR', nome: 'Elevadores e plataformas de acessibilidade', vidaUtilMeses: 240, valorResidualPct: 10, grupo: 'EQUIPAMENTO' },
  { codigo: 'EQUIP-ESPORTE', nome: 'Equipamentos esportivos', vidaUtilMeses: 60, valorResidualPct: 5, grupo: 'EQUIPAMENTO' },
]

export const REGRAS_PADRAO = [
  { titulo: 'Reserva prévia obrigatória', texto: 'Eventos em áreas comuns exigem solicitação com antecedência mínima de 48 horas e aprovação da Infraestrutura.' },
  { titulo: 'Responsabilidade pela área', texto: 'O solicitante responde pela organização, limpeza ao final e eventuais danos ao patrimônio durante o evento.' },
  { titulo: 'Som e ruído', texto: 'Uso de som amplificado somente com autorização expressa e respeitando o limite de horário e de decibéis estabelecido pela instituição.' },
  { titulo: 'Alimentos e bebidas', texto: 'Comercialização de alimentos e bebidas alcoólicas é proibida sem autorização da Direção. Fumar é proibido nas áreas comuns.' },
  { titulo: 'Segurança e capacidade', texto: 'Respeitar a capacidade máxima da área, manter saídas de emergência livres e seguir as orientações da equipe de segurança.' },
  { titulo: 'Acessibilidade', texto: 'O evento deve garantir circulação acessível; vagas PcD e idosos não podem ser ocupadas por estruturas do evento.' },
]

export const EFICIENCIA_PADRAO = [
  { titulo: 'Troca de iluminação por LED', tipo: 'ENERGIA', economiaEstimadaPct: 40, descricao: 'Substituir lâmpadas fluorescentes/vapor por LED nos blocos e áreas externas.' },
  { titulo: 'Sensores de presença em corredores e banheiros', tipo: 'ENERGIA', economiaEstimadaPct: 15, descricao: 'Instalar sensores para desligamento automático.' },
  { titulo: 'Arejadores e válvulas de descarga econômicas', tipo: 'AGUA', economiaEstimadaPct: 25, descricao: 'Reduzir consumo de água em sanitários e torneiras.' },
  { titulo: 'Captação de água de chuva', tipo: 'AGUA', economiaEstimadaPct: 20, descricao: 'Reuso para jardins e limpeza de áreas externas.' },
  { titulo: 'Programação de ar-condicionado por horário de aula', tipo: 'ENERGIA', economiaEstimadaPct: 12, descricao: 'Integrar o acionamento ao cronograma de aulas.' },
]

// Modelos de checklist para planos/OS preventivas (o front pode usar ao criar o plano).
export const MODELOS_CHECKLIST: Record<string, { titulo: string; periodicidadeDiasSugerida: number; itens: Array<{ item: string; obrigatorio: boolean }> }> = {
  'ar-condicionado': { titulo: 'Preventiva de ar-condicionado', periodicidadeDiasSugerida: 90, itens: [
    { item: 'Limpar/trocar filtros', obrigatorio: true }, { item: 'Limpar serpentina evaporadora e condensadora', obrigatorio: true },
    { item: 'Verificar dreno e bandeja', obrigatorio: true }, { item: 'Medir corrente e pressão do gás', obrigatorio: true }, { item: 'Verificar fixações e isolamento', obrigatorio: false } ] },
  extintor: { titulo: 'Inspeção de extintores', periodicidadeDiasSugerida: 30, itens: [
    { item: 'Lacre e pino de segurança íntegros', obrigatorio: true }, { item: 'Manômetro na faixa verde', obrigatorio: true },
    { item: 'Validade da carga e do teste hidrostático', obrigatorio: true }, { item: 'Sinalização e acesso desobstruídos', obrigatorio: true } ] },
  elevador: { titulo: 'Manutenção de elevador', periodicidadeDiasSugerida: 30, itens: [
    { item: 'Verificar cabos e polias', obrigatorio: true }, { item: 'Testar portas e sensores', obrigatorio: true }, { item: 'Testar freio e dispositivo de emergência', obrigatorio: true }, { item: 'Registrar no livro de inspeção', obrigatorio: true } ] },
  gerador: { titulo: 'Teste de gerador/nobreak', periodicidadeDiasSugerida: 30, itens: [
    { item: 'Verificar nível de combustível, óleo e água', obrigatorio: true }, { item: 'Teste em carga por 15 min', obrigatorio: true }, { item: 'Verificar baterias', obrigatorio: true } ] },
  'caixa-dagua': { titulo: 'Limpeza de reservatório de água', periodicidadeDiasSugerida: 180, itens: [
    { item: 'Esvaziar, lavar e desinfetar', obrigatorio: true }, { item: 'Verificar tampa, boia e vedação', obrigatorio: true }, { item: 'Emitir certificado de limpeza', obrigatorio: true } ] },
  spda: { titulo: 'Inspeção de SPDA (para-raios) e aterramento', periodicidadeDiasSugerida: 365, itens: [
    { item: 'Medir resistência de aterramento', obrigatorio: true }, { item: 'Inspecionar captores e descidas', obrigatorio: true }, { item: 'Emitir laudo/ART', obrigatorio: true } ] },
  autoclave: { titulo: 'Manutenção de autoclave', periodicidadeDiasSugerida: 90, itens: [
    { item: 'Verificar vedação da porta e válvulas', obrigatorio: true }, { item: 'Teste biológico/químico de eficácia', obrigatorio: true }, { item: 'Calibrar manômetro e termômetro', obrigatorio: true } ] },
  laboratorio: { titulo: 'Inspeção de laboratório', periodicidadeDiasSugerida: 90, itens: [
    { item: 'Chuveiro de emergência e lava-olhos funcionando', obrigatorio: true }, { item: 'Exaustão/capela operando', obrigatorio: true }, { item: 'Calibração de balanças e pipetas', obrigatorio: false }, { item: 'Kit de primeiros socorros completo', obrigatorio: true } ] },
  'ti-rede': { titulo: 'Preventiva de rede e TI', periodicidadeDiasSugerida: 90, itens: [
    { item: 'Atualizar firmware/antivírus', obrigatorio: true }, { item: 'Verificar backups', obrigatorio: true }, { item: 'Limpeza física dos equipamentos', obrigatorio: false } ] },
}

export function mountBootstrap(router: Router) {
  router.post(
    '/bootstrap',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      let categorias = 0, regras = 0, acoes = 0
      for (const c of CATEGORIAS_PADRAO) {
        const r = await prisma.infCategoriaBem.upsert({ where: { tenantId_codigo: { tenantId, codigo: c.codigo } }, create: { tenantId, ...c }, update: {} })
        if (r.createdAt.getTime() > Date.now() - 5000) categorias++
      }
      for (const [i, r] of REGRAS_PADRAO.entries()) {
        if (!(await prisma.infRegraUso.findFirst({ where: { tenantId, spaceId: null, titulo: r.titulo } }))) { await prisma.infRegraUso.create({ data: { tenantId, ...r, ordem: i + 1 } }); regras++ }
      }
      for (const a of EFICIENCIA_PADRAO) {
        if (!(await prisma.infAcaoEficiencia.findFirst({ where: { tenantId, titulo: a.titulo } }))) { await prisma.infAcaoEficiencia.create({ data: { tenantId, ...a } }); acoes++ }
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOOTSTRAP', detalhes: { categorias, regras, acoes } })
      res.json({ ok: true, criados: { categorias, regrasUso: regras, acoesEficiencia: acoes }, modelosChecklist: Object.keys(MODELOS_CHECKLIST) })
    }),
  )

  router.get('/modelos-checklist', requireRole(...LEITURA), (_req, res) => {
    res.json(MODELOS_CHECKLIST)
  })
}
