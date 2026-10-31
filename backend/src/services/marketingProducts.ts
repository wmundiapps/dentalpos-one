// Produtos vendidos pela WMundi no atendimento automatico de vendas.
// Para ensinar o robo sobre um produto, preencha `facts` (fatos verdadeiros e aprovados) e `url`.
// Enquanto `facts` estiver vazio, o robo so registra o interesse e nao inventa nada.

export interface MarketingProduct {
  key: string
  name: string
  aliases: string[]
  facts: string[]
  // Limites combinados para negociar (valores, descontos, condicoes). Sem regra aqui, o robo nao negocia preco.
  negotiation?: string[]
  url: string | null
  kind?: 'venda' | 'emprego' | 'outros'
}

export const PRODUCTS: MarketingProduct[] = [
  { key: 'dentalpos', name: 'DentalPos (também chamado CompletoDonto)', aliases: ['dentalpos', 'dental pos', 'completodonto', 'completo donto', 'sistema odontologico', 'sistema para dentista', 'clinica odontologica'], facts: ['__DENTALPOS__'], negotiation: ['Não existe desconto além da promoção vigente (50% nos 12 meses seguintes ao teste, até a data informada) e do teste grátis de 30 dias. Se a pessoa pedir mais, explique com gentileza que não pode, reforce o valor e o fato de não haver fidelidade nem cobrança nos 30 dias.', 'Pode explicar os valores dos três planos e as condições de pagamento (cartão de crédito, cobrança mensal automática).'], url: 'https://app.dentalpos.com.br/cadastro' },
  { key: 'studiobeautybarber', name: 'Studio Beauty Barber', aliases: ['studio beauty', 'beauty barber', 'barbearia', 'barber', 'salao de beleza'], facts: [], url: null },
  { key: 'spacehour', name: 'SpaceHour', aliases: ['spacehour', 'space hour', 'aluguel de espaco', 'reserva de espaco', 'sala por hora'], facts: [
    'Marketplace para alugar por hora, nos horários ociosos, espaços profissionais prontos: consultórios odontológicos, clínicas médicas, salas de psicologia, advocacia, salas de aula, auditórios, salas de reunião e estúdios.',
    'Quem tem o espaço (anfitrião) anuncia os horários ociosos e ganha com isso; quem precisa (locatário) reserva só as horas de que precisa.',
    'Reserva de um dia, dias seguidos (até 5) ou recorrência semanal (até 12 semanas); reserva instantânea ou por solicitação (o anfitrião responde em até 24 horas).',
    'No Brasil, pagamento por Pix, boleto ou cartão. O repasse ao anfitrião acontece 24 horas após o início da reserva.',
    'O locatário profissional envia o registro no conselho (número e foto ou PDF da carteira) e o sistema confere; o anfitrião é o responsável final pela aprovação.',
    'Tem política de cancelamento (flexível, moderada ou rígida), avaliações dos dois lados, regras para danos e atrasos, e mediação em caso de disputa.',
    'Operação aberta só no Brasil por enquanto. É um app independente do DentalPos. Site: https://space-hour.com. Suporte: support@space-hour.com.',
  ], negotiation: ['Não há desconto negociável pelo atendimento: as taxas e preços de cada espaço são definidos na plataforma. Não prometa desconto nem informe percentuais de taxa.'], url: 'https://space-hour.com' },
  { key: 'alignsystem', name: 'AlignSystem', aliases: ['alignsystem', 'align system', 'alinhadores', 'alinhador'], facts: [], url: null },
  { key: 'clubefaz', name: 'ClubeFaz', aliases: ['clubefaz', 'clube faz'], facts: [], url: null },
  { key: 'emprego', name: 'Vagas de emprego', aliases: ['emprego', 'vaga de emprego', 'curriculo', 'trabalhe conosco', 'oportunidade de trabalho'], facts: [], url: null, kind: 'emprego' },
  { key: 'edumaster', name: 'EduMaster', aliases: ['edumaster', 'edu master'], facts: [], url: null },
  { key: 'simulaclinic', name: 'SimulaClinic', aliases: ['simulaclinic', 'simula clinic'], facts: [], url: null },
  { key: 'allcollege', name: 'AllCollege', aliases: ['allcollege', 'all college'], facts: [], url: null },
  { key: 'imedico', name: 'iMédico', aliases: ['imedico', 'i medico', 'consultorio medico', 'clinica medica'], facts: [], url: null },
  { key: 'outros', name: 'Outros', aliases: [], facts: [], url: null, kind: 'outros' },
]

const strip = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function productByKey(key?: string | null) {
  return PRODUCTS.find(p => p.key === key) || null
}

// Procura o produto citado no texto (palavras inteiras). Retorna a chave ou null.
export function detectProduct(text: string) {
  const t = strip(text)
  for (const p of PRODUCTS) {
    for (const a of p.aliases) {
      const alias = strip(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^a-z0-9])${alias}($|[^a-z0-9])`).test(t)) return p.key
    }
  }
  return null
}
