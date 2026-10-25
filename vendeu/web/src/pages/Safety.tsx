import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, usePageTitle } from '../lib/hooks';
import { Alert, ErrorState, Loading, Markdown, PageHead } from '../components/ui';
import { DraftBanner, isDraft, stripTitle, type LegalDoc } from './Legal';

const RULES: [string, string, string][] = [
  ['💸', 'Nunca pague antes de ver', 'O Vendeu não pede Pix antecipado, sinal nem taxa de liberação. Quem pede, é golpe.'],
  ['🔢', 'Nunca informe códigos', 'Códigos de SMS, e-mail ou WhatsApp dão acesso à sua conta. Nem o Vendeu pede.'],
  ['📍', 'Encontre em lugar público', 'Combine em local movimentado e iluminado, de preferência de dia e acompanhado.'],
  ['🔍', 'Confira o produto', 'Teste, veja os documentos (placa, matrícula, nota) e confirme se o vendedor é o dono.'],
  ['🏦', 'Confirme o dinheiro', 'Comprovante não é pagamento. Veja o valor na sua conta antes de entregar.'],
  ['💬', 'Fique no chat do Vendeu', 'Fora dele você perde o registro e os avisos de segurança. Desconfie de quem pede para sair.'],
];

export function Safety() {
  usePageTitle('Segurança e anti-golpe');
  const d = useAsync(() => api.get<LegalDoc>('/legal/seguranca-e-anti-golpe'), []);
  return (
    <div className="narrow stack-l">
      <PageHead title="Segurança e anti-golpe" sub="Seis regras de ouro para comprar, vender e alugar sem susto." />
      <ul className="rule-cards">
        {RULES.map(([i, t, x]) => <li key={t} className="rule-card"><span className="rule-ico" aria-hidden="true">{i}</span><h2>{t}</h2><p>{x}</p></li>)}
      </ul>
      <Alert tone="warn" title="O Vendeu nunca pede:">sua senha, códigos recebidos por SMS/WhatsApp, Pix antecipado ou dados completos do cartão por mensagem. Foi vítima? Registre um boletim de ocorrência e avise <a href="mailto:suporte@vendeu.app">suporte@vendeu.app</a>.</Alert>
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
