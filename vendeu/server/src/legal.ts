// Documentos legais ficam em docs/legal/pt-BR/*.md (versão em <!-- versao: AAAA-MM-DD -->).
// Cada aceite grava a versão e o hash do texto exato que a pessoa viu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './secure.js';
import { HttpError } from './http.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'legal', 'pt-BR');

export const LEGAL_KEYS = ['termos-de-uso', 'politica-de-privacidade', 'regras-de-anuncio', 'termo-de-responsabilidade-origem', 'politica-de-taxas', 'politica-de-cookies', 'seguranca-e-anti-golpe'] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];
/** Aceites obrigatórios: no cadastro e antes de publicar o primeiro anúncio. */
export const SIGNUP_TERMS: LegalKey[] = ['termos-de-uso', 'politica-de-privacidade'];
export const SELLER_TERMS: LegalKey[] = ['regras-de-anuncio', 'termo-de-responsabilidade-origem', 'politica-de-taxas'];

export interface LegalDoc { key: LegalKey; title: string; version: string; hash: string; markdown: string }
const cache = new Map<string, LegalDoc>();

export function getLegal(key: string): LegalDoc {
  if (!(LEGAL_KEYS as readonly string[]).includes(key)) throw new HttpError(404, 'not_found');
  const hit = cache.get(key);
  if (hit) return hit;
  const file = path.join(dir, `${key}.md`);
  if (!fs.existsSync(file)) throw new HttpError(404, 'not_found');
  const markdown = fs.readFileSync(file, 'utf8');
  const doc: LegalDoc = {
    key: key as LegalKey,
    title: markdown.match(/^#\s+(.+)$/m)?.[1] ?? key,
    version: markdown.match(/<!--\s*versao:\s*([^\s>]+)\s*-->/)?.[1] ?? '0',
    hash: sha256(markdown),
    markdown,
  };
  cache.set(key, doc);
  return doc;
}
export const legalIndex = () => LEGAL_KEYS.map((k) => { const d = getLegal(k); return { key: d.key, title: d.title, version: d.version }; });

/** Declaração de origem lícita assinada em cada anúncio. O texto exato (com os dados do anúncio) é o que vira hash. */
export const DECLARATION_VERSION = '2026-10-25';
export function declarationText(p: { signerName: string; listingTitle: string; originLabel: string; assetRef?: string | null }) {
  return [
    `Eu, ${p.signerName}, declaro sob as penas da lei que:`,
    `1. Sou o legítimo proprietário (ou tenho poderes para anunciar) do bem "${p.listingTitle}".`,
    `2. A origem do bem é: ${p.originLabel}.${p.assetRef ? ` Identificação do bem: ${p.assetRef}.` : ''}`,
    '3. O bem não é furtado, roubado, receptado, falsificado, contrabandeado, nem de procedência duvidosa, e não tem restrição que impeça a venda/locação (alienação, penhora, financiamento sem anuência, etc.).',
    '4. As fotos são do bem real e as informações são verdadeiras.',
    '5. Entendi que o Vendeu é apenas uma plataforma de anúncios, não participa da negociação, não garante o bem nem a boa-fé de ninguém, e não responde por produtos clandestinos ou de origem duvidosa; a responsabilidade é exclusivamente minha.',
    '6. Autorizo o registro e a guarda do meu IP, e-mail, telefone e dados do dispositivo, e o fornecimento deles a autoridades mediante ordem judicial ou requisição legal.',
    '7. Sei que, ao vender ou alugar, devo encerrar o anúncio pelo Vendeu e pagar a taxa de sucesso da tabela vigente.',
  ].join('\n');
}
