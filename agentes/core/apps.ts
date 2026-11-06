// Quais dos 5 agentes iniciais servem para cada aplicativo da WMundi, e o que o agente precisa ler do sistema.

import type { AgenteId, Vertical } from './types.ts'

export type AplicativoWmundi = {
  nome: string
  vertical: Vertical
  agentes: AgenteId[]
  /** O que o agente precisa que o aplicativo ofereça (adaptador). */
  integracao: string
}

const TODOS: AgenteId[] = ['atendente', 'agenda', 'cobranca-atraso', 'pos-atendimento', 'resumo-diario']

export const APLICATIVOS: AplicativoWmundi[] = [
  { nome: 'Completodonto', vertical: 'odonto', agentes: TODOS, integracao: 'Agenda, pacientes (primeiro nome e contato), financeiro (pendências) e orçamentos.' },
  { nome: 'Gerenciador Odontológico', vertical: 'odonto', agentes: TODOS, integracao: 'Agenda, pacientes, financeiro e orçamentos.' },
  { nome: 'AlignSystem', vertical: 'odonto', agentes: ['atendente', 'agenda', 'pos-atendimento', 'resumo-diario'], integracao: 'Agenda de consultas on-line e acompanhamento de pacientes de alinhadores.' },
  { nome: 'MedicinaOnline', vertical: 'saude', agentes: ['atendente', 'agenda', 'pos-atendimento', 'resumo-diario'], integracao: 'Agenda de teleconsultas e cadastro de pacientes.' },
  { nome: 'REVAH', vertical: 'marketing', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Contatos, conversas multicanal e campanhas (já tem robô e canais).' },
  { nome: 'WMundi AI Agent', vertical: 'marketing', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'É a própria plataforma de agentes: usa este núcleo diretamente.' },
  { nome: 'Mundi Business', vertical: 'marketing', agentes: ['atendente', 'resumo-diario'], integracao: 'Listas e disparos; o agente responde às respostas dos disparos.' },
  { nome: 'WhatSpeak', vertical: 'marketing', agentes: ['atendente'], integracao: 'Conversas de WhatsApp.' },
  { nome: 'Venda de Empresas', vertical: 'marketing', agentes: ['atendente', 'resumo-diario'], integracao: 'Anúncios e contatos de interessados.' },
  { nome: 'AllCollege', vertical: 'escola', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Cadastro de alunos e dúvidas frequentes.' },
  { nome: 'EduMaster Pro', vertical: 'escola', agentes: TODOS, integracao: 'Alunos, matrículas, mensalidades (pendências) e calendário.' },
  { nome: 'Equivalia', vertical: 'escola', agentes: ['atendente', 'agenda', 'pos-atendimento'], integracao: 'Pedidos de equivalência e agendamento de atendimento.' },
  { nome: 'Studio BeautyBarber', vertical: 'comercio', agentes: TODOS, integracao: 'Agenda de profissionais, clientes e financeiro.' },
  { nome: 'Lavacar Smartwash', vertical: 'servicos', agentes: TODOS, integracao: 'Agenda de serviços, clientes e financeiro.' },
  { nome: 'SpaceHour', vertical: 'servicos', agentes: ['atendente', 'agenda', 'cobranca-atraso', 'pos-atendimento', 'resumo-diario'], integracao: 'Reservas de salas, anfitriões e cobrança de uso.' },
  { nome: 'Clubefaz', vertical: 'servicos', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Marketplace de serviços: atendimento e avaliação.' },
  { nome: 'Cashbacksmart', vertical: 'comercio', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Lojas parceiras e clientes da rede de cashback.' },
  { nome: 'Smartcar', vertical: 'mobilidade', agentes: TODOS, integracao: 'Agenda de serviços automotivos, clientes e financeiro.' },
  { nome: 'UrbanFlow', vertical: 'mobilidade', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Vagas de estacionamento e dúvidas de usuários.' },
  { nome: 'EarlyCar', vertical: 'mobilidade', agentes: ['atendente', 'agenda', 'pos-atendimento'], integracao: 'Caronas compartilhadas: combinação de horários e avaliação.' },
  { nome: 'CobrançaHub', vertical: 'financeiro', agentes: ['atendente', 'cobranca-atraso', 'resumo-diario'], integracao: 'É a cobrança automatizada: usa o agente de cobrança de atraso.' },
  { nome: 'BoletoHub', vertical: 'financeiro', agentes: ['atendente', 'cobranca-atraso', 'resumo-diario'], integracao: 'Boletos e segundas vias.' },
  { nome: 'MeuEmprego', vertical: 'carreira', agentes: ['atendente', 'pos-atendimento', 'resumo-diario'], integracao: 'Candidatos e vagas: atendimento e retorno.' },
]

export function agentesDoAplicativo(nome: string): AgenteId[] {
  return APLICATIVOS.find((a) => a.nome.toLowerCase() === nome.toLowerCase())?.agentes ?? []
}
