import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { LEGAL_DOCS } from '../legal';

// Identificação da operadora (Decreto 7.962/2013) e do encarregado (LGPD, Res. CD/ANPD 18/2024)
const OPERATOR = { company: 'Instituto Ravel de Ensino Superior Ltda.', cnpj: '03.162.275/0001-10', address: 'Av. XV de Novembro, 255 · Maringá/PR · CEP 87013-230', dpo: 'Robson Ravel de Oliveira', dpoEmail: 'info@wmundi.com' };

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
        <div>
          <strong>SpaceHour</strong>
          <ul>
            <li><button type="button" className="link-button" onClick={() => window.dispatchEvent(new CustomEvent('open-feedback', { detail: 'rating' }))}>{t('footer.feedback')}</button></li>
            <li>{t('footer.contact')}: <a href="mailto:support@space-hour.com">support@space-hour.com</a></li>
          </ul>
        </div>
      </div>
      <div className="container muted small footer-bottom">
        © {new Date().getFullYear()} SpaceHour · {t('footer.operator', { company: OPERATOR.company, cnpj: OPERATOR.cnpj })} · {OPERATOR.address}
        {' · '}{t('footer.dpo', { name: OPERATOR.dpo })} (<a href={`mailto:${OPERATOR.dpoEmail}`}>{OPERATOR.dpoEmail}</a>)
        <br />{t('footer.legalNote')}
      </div>
    </footer>
  );
}
