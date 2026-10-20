import type { LocaleCode } from '../../shared/types';

export const LEGAL_DOCS = [
  'terms', 'booking-rules', 'cancellation-refunds', 'penalties', 'space-norms', 'guarantor-deposit',
  'reviews', 'payments', 'host-obligations', 'disputes', 'privacy',
] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

const files = import.meta.glob<string>('../../docs/legal/pt-BR/*.md', { query: '?raw', import: 'default' });

// SpaceHour Brasil: os documentos jurídicos valem só em português (versão brasileira, parecer jurídico 2026-10).
export async function loadLegal(doc: LegalDoc, _locale: LocaleCode): Promise<{ text: string; locale: LocaleCode } | null> {
  const loader = files[`../../docs/legal/pt-BR/${doc}.md`];
  return loader ? { text: await loader(), locale: 'pt-BR' } : null;
}
