import type { LocaleCode } from '../../shared/types';

export const LEGAL_DOCS = [
  'terms', 'booking-rules', 'cancellation-refunds', 'penalties', 'space-norms', 'guarantor-deposit',
  'reviews', 'payments', 'host-obligations', 'disputes', 'privacy', 'country-rules',
] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

const files = import.meta.glob<string>('../../docs/legal/*/*.md', { query: '?raw', import: 'default' });

// Documento no idioma escolhido; na falta, inglês; por fim o original em português.
export async function loadLegal(doc: LegalDoc, locale: LocaleCode): Promise<{ text: string; locale: LocaleCode } | null> {
  for (const l of [locale, 'en', 'pt-BR'] as LocaleCode[]) {
    const loader = files[`../../docs/legal/${l}/${doc}.md`];
    if (loader) return { text: await loader(), locale: l };
  }
  return null;
}
