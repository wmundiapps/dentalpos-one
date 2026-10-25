import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync, usePageTitle } from '../lib/hooks';
import { Alert, Empty, ErrorState, Loading, Markdown, PageHead } from '../components/ui';

export interface LegalDoc { key: string; title: string; version: string; markdown: string }

export const isDraft = (md: string) => /minuta/i.test(md);
export const stripTitle = (md: string) => md.replace(/^\s*#\s+.+\n/, '');

export function DraftBanner() {
  return <Alert tone="warn" title="MINUTA">Este texto é uma minuta, ainda em revisão jurídica, e pode mudar antes de entrar em vigor.</Alert>;
}

export function LegalIndex() {
  usePageTitle('Documentos legais');
  const l = useAsync(() => api.get<{ documents: { key: string; title: string; version: string }[] }>('/legal'), []);
  return (
    <div className="narrow stack-l">
      <PageHead title="Documentos legais" sub="Leia como o Vendeu funciona, como cuidamos dos seus dados e quais são as regras." />
      {l.loading ? <Loading /> : l.error ? <ErrorState error={l.error} onRetry={l.reload} /> : (
        <ul className="rows">
          {l.data!.documents.map((d) => (
            <li key={d.key} className="row-card">
              <div className="row-main"><Link className="row-title" to={`/legal/${d.key}`}>{d.title}</Link><span className="small muted">Versão {d.version}</span></div>
              <Link to={`/legal/${d.key}`} className="btn btn-outline btn-sm">Ler</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LegalReader() {
  const { key } = useParams();
  const d = useAsync(() => api.get<LegalDoc>(`/legal/${key}`), [key]);
  usePageTitle(d.data?.title ?? 'Documento legal');
  if (d.loading) return <Loading />;
  if (d.error) {
    const nf = (d.error as { status?: number }).status === 404;
    return nf ? <Empty icon="📄" title="Documento não encontrado">Veja a <Link to="/legal">lista de documentos</Link>.</Empty> : <ErrorState error={d.error} onRetry={d.reload} />;
  }
  const doc = d.data!;
  return (
    <article className="narrow">
      <p className="small"><Link to="/legal">← Todos os documentos</Link></p>
      <PageHead title={doc.title} sub={`Versão ${doc.version}`} />
      {isDraft(doc.markdown) && <DraftBanner />}
      <Markdown>{stripTitle(doc.markdown)}</Markdown>
    </article>
  );
}
