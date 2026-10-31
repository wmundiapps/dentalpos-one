// Produtos vendidos pela WMundi no atendimento automatico de vendas.
// Para ensinar o robo sobre um produto, preencha `facts` (fatos verdadeiros e aprovados) e `url`.
// Enquanto `facts` estiver vazio, o robo so registra o interesse e nao inventa nada.

export interface MarketingProduct {
  key: string
  name: string
  aliases: string[]
  facts: string[]
  url: string | null
  kind?: 'venda' | 'emprego' | 'outros'
}

export const PRODUCTS: MarketingProduct[] = [
  { key: 'dentalpos', name: 'DentalPos (também chamado CompletoDonto)', aliases: ['dentalpos', 'dental pos', 'completodonto', 'completo donto', 'sistema odontologico', 'sistema para dentista', 'clinica odontologica'], facts: ['__DENTALPOS__'], url: 'https://app.dentalpos.com.br/cadastro' },
  { key: 'studiobeautybarber', name: 'Studio Beauty Barber', aliases: ['studio beauty', 'beauty barber', 'barbearia', 'barber', 'salao de beleza'], facts: [], url: null },
  { key: 'spacehour', name: 'SpaceHour', aliases: ['spacehour', 'space hour', 'aluguel de espaco', 'reserva de espaco', 'sala por hora'], facts: [], url: null },
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
