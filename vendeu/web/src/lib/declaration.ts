// Texto da declaração de origem assinada em cada anúncio.
// ATENÇÃO: espelho de declarationText() em server/src/legal.ts (versão DECLARATION_VERSION abaixo).
// O servidor grava o hash do texto que ele mesmo gera; esta cópia serve só para a pessoa ler antes de assinar.
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
