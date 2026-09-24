import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useI18n } from '../i18n';
import { LEGAL_DOCS, loadLegal, type LegalDoc } from '../legal';
import { LOCALE_NATIVE_NAMES } from '../../../shared/countries';

export default function LegalPage() {
  const { doc } = useParams();
  const { t, locale } = useI18n();
  const current = (LEGAL_DOCS.includes(doc as LegalDoc) ? doc : 'terms') as LegalDoc;
  const [content, setContent] = useState<{ html: string; locale: string } | null>(null);
  useEffect(() => {
    setContent(null);
    loadLegal(current, locale).then((r) => r && setContent({ html: marked.parse(r.text, { async: false }) as string, locale: r.locale }));
  }, [current, locale]);
  return (
    <div className="container legal-layout">
      <nav className="legal-nav">
        <h2>{t('nav.rules')}</h2>
        <ul>{LEGAL_DOCS.map((d) => <li key={d}><Link className={d === current ? 'active' : ''} to={`/regras/${d}`}>{t(`legal.${d}` as never)}</Link></li>)}</ul>
      </nav>
      <article className="legal">
        {content && content.locale !== locale && <p className="notice small">{t('legal.fallback', { lang: LOCALE_NATIVE_NAMES[content.locale as keyof typeof LOCALE_NATIVE_NAMES] })}</p>}
        {content ? <div dangerouslySetInnerHTML={{ __html: content.html }} /> : <div className="skeleton hero-skeleton" />}
      </article>
    </div>
  );
}
