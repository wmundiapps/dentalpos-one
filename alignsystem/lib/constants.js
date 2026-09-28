export const CASE_STATUS = {
  novo: 'Novo contato',
  fotos_enviadas: 'Fotos enviadas',
  parecer_enviado: 'Parecer enviado',
  documentacao_agendada: 'Documentação agendada',
  documentacao_realizada: 'Documentação realizada',
  plano_apresentado: 'Plano apresentado',
  contrato_enviado: 'Contrato enviado',
  contrato_assinado: 'Contrato assinado',
  em_tratamento: 'Em tratamento',
  finalizado: 'Finalizado',
  perdido: 'Perdido / desistiu',
};

export const DENTIST_STATUS = {
  lead: 'Novo interessado',
  em_analise: 'Em análise',
  aprovado: 'Aprovado (aguardando termo)',
  ativo: 'Ativo',
  inativo: 'Inativo',
  recusado: 'Recusado',
};

export const ASSESSMENT = {
  indicado: 'Alinhadores provavelmente indicados',
  avaliacao_presencial: 'Precisa de avaliação presencial',
  nao_indicado: 'Alinhadores não indicados para o caso',
};

export const MILESTONES = {
  documentacao: 'Documentação',
  instalacao: 'Instalação',
  inicio_alinhadores: 'Início dos alinhadores',
  acompanhamento: 'Acompanhamento',
  finalizacao: 'Finalização',
  consulta_avulsa: 'Consulta avulsa',
};

// As 7 fotos da pré-avaliação (mesmo roteiro do guia)
export const PHOTO_SLOTS = [
  { slot: 1, title: 'Frente, sério(a)', hint: 'Olhe para a câmera, sem sorrir, enquadrando cabeça e ombros.' },
  { slot: 2, title: 'Frente, sorrindo', hint: 'Mesma posição, agora com um sorriso natural e aberto.' },
  { slot: 3, title: 'Lado direito', hint: 'Vire o rosto 90°, perfil direito, enquadrando cabeça e ombros.' },
  { slot: 4, title: 'Lado esquerdo', hint: 'Vire para o outro lado, perfil esquerdo, mesmo enquadramento.' },
  { slot: 5, title: 'Sorriso de perto', hint: 'Aproxime a câmera e fotografe apenas o sorriso, bem de perto.' },
  { slot: 6, title: 'Arcada de cima', hint: 'Com a boca aberta, fotografe só os dentes de cima.' },
  { slot: 7, title: 'Arcada de baixo', hint: 'Da mesma forma, fotografe só os dentes de baixo.' },
];

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_PHOTOS_PER_CASE = 40;
