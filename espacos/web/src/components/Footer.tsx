import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { LEGAL_DOCS } from '../legal';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <strong>SpaceHour</strong>
          <p className="muted small">{t('footer.tagline')}</p>
        </div>
        <div>
          <strong>{t('footer.policies')}</strong>
          <ul>{LEGAL_DOCS.map((d) => <li key={d}><Link to={`/regras/${d}`}>{t(`legal.${d}` as never)}</Link></li>)}</ul>
        </div>
        <div>
          <strong>{t('footer.hosting')}</strong>
          <ul>
            <li><Link to="/anfitriao/novo">{t('nav.newListing')}</Link></li>
            <li><Link to="/regras/host-obligations">{t('legal.host-obligations')}</Link></li>
            <li><Link to="/regras/penalties">{t('legal.penalties')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="container muted small footer-bottom">© {new Date().getFullYear()} SpaceHour · {t('footer.legalNote')}</div>
    </footer>
  );
}
