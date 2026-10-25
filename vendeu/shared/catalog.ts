// Catálogo fixo: abas (operação), categorias e condição. O servidor valida tudo contra estas listas.

export const OPERATIONS = ['venda', 'locacao'] as const;
export type Operation = (typeof OPERATIONS)[number];
export const OPERATION_LABEL: Record<Operation, string> = { venda: 'Venda', locacao: 'Locação' };

/** Novos e usados nunca se misturam: toda busca exige uma das duas. */
export const CONDITIONS = ['novo', 'usado'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABEL: Record<Condition, string> = { novo: 'Novos', usado: 'Usados' };

export const CATEGORIES = [
  { slug: 'moveis', label: 'Móveis', icon: '🛋️' },
  { slug: 'imoveis', label: 'Imóveis', icon: '🏠' },
  { slug: 'brinquedos', label: 'Brinquedos', icon: '🧸' },
  { slug: 'automoveis', label: 'Automóveis', icon: '🚗' },
  { slug: 'utilidades-lar', label: 'Utilidades para o lar', icon: '🍳' },
  { slug: 'outros', label: 'Outros', icon: '📦' },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]['slug'];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

/** Categorias em que a origem do bem exige documento extra na declaração. */
export const REGISTERED_ASSET: Partial<Record<CategorySlug, { field: string; label: string }>> = {
  automoveis: { field: 'placa', label: 'Placa do veículo' },
  imoveis: { field: 'matricula', label: 'Número da matrícula do imóvel' },
};

export const ORIGIN_KINDS = [
  { value: 'compra_nota', label: 'Comprei com nota fiscal / recibo' },
  { value: 'compra_sem_nota', label: 'Comprei de particular (sem nota)' },
  { value: 'uso_proprio', label: 'É meu, de uso próprio' },
  { value: 'heranca', label: 'Herança / inventário' },
  { value: 'doacao', label: 'Doação / presente' },
  { value: 'fabricacao', label: 'Eu fabrico / produzo' },
  { value: 'comerciante', label: 'Sou comerciante (estoque próprio)' },
] as const;
export const ORIGIN_KIND_VALUES = ORIGIN_KINDS.map((o) => o.value) as [string, ...string[]];

export const MAX_PHOTOS = 10;
export const MIN_PHOTOS = 1;
