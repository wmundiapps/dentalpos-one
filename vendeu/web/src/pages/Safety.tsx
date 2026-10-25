import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, usePageTitle } from '../lib/hooks';
import { Alert, ErrorState, Loading, Markdown, PageHead } from '../components/ui';
import { DraftBanner, isDraft, stripTitle, type LegalDoc } from './Legal';

const RULES: [string, string, string][] = [
  ['🚫', 'Nunca negocie nem pague fora do app', 'Pagou por fora, perdeu o pagamento retido e os 7 dias para devolver. Pix direto, sinal ou "taxa de liberação" é golpe.'],
  ['📦', 'Só confirme "Recebi" com o produto em mãos', 'Confirmar o recebimento libera os contatos e inicia os 7 dias de devolução. Não confirme antes.'],
  ['🔢', 'Só passe o código depois de receber', 'Na retirada em mãos, o código de 6 dígitos só vai para o vendedor depois que você estiver com o produto. Nunca por mensagem.'],
  ['📍', 'Encontre em lugar público', 'Combine a retirada em local movimentado e iluminado, de preferência de dia e acompanhado.'],
  ['🔍', 'Confira o produto', 'Teste, veja os documentos (placa, matrícula, nota) e, se algo não bater, peça devolução ou abra disputa no pedido.'],
  ['💬', 'Fique no chat do Vendeu', 'Telefone, e-mail e links ficam ocultos até o recebimento. Desconfie de quem pede para sair do chat.'],
];

export function Safety() {
  usePageTitle('Segurança e anti-golpe');
  const d = useAsync(() => api.get<LegalDoc>('/legal/seguranca-e-anti-golpe'), []);
  return (
    <div className="narrow stack-l">
      <PageHead title="Segurança e anti-golpe" sub="Seis regras para comprar, vender e alugar pelo Vendeu sem susto." />
      <ul className="rule-cards">
        {RULES.map(([i, t, x]) => <li key={t} className="rule-card"><span className="rule-ico" aria-hidden="true">{i}</span><h2>{t}</h2><p>{x}</p></li>)}
      </ul>
      <Alert tone="warn" title="O Vendeu nunca pede:">sua senha, códigos recebidos por SMS/WhatsApp, Pix fora do pedido ou dados do cartão por mensagem. O pagamento é feito só pelo pedido, no próprio Vendeu. Foi vítima? Registre um boletim de ocorrência e avise <a href="mailto:suporte@vendeu.app">suporte@vendeu.app</a>.</Alert>
      <section>
        {d.loading ? <Loading /> : d.error ? (
          <ErrorState error={d.error} onRetry={d.reload} title="O guia completo ainda não está disponível" />
        ) : (<>
          {isDraft(d.data!.markdown) && <DraftBanner />}
          <p className="small muted">Versão {d.data!.version}</p>
          <Markdown>{stripTitle(d.data!.markdown)}</Markdown>
        </>)}
      </section>
      <p>Viu algo suspeito? Use o botão <strong>Denunciar</strong> no anúncio. Veja também as <Link to="/legal/regras-de-anuncio">Regras de Anúncio</Link>.</p>
    </div>
  );
}
