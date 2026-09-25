import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { PlaceLanguageModal } from './PlaceLanguageModal';
import { countryName, flag } from '../format';
import { LOCALE_NATIVE_NAMES } from '../../../shared/countries';
import { api } from '../api';
import type { Notification } from '../../../shared/types';

export function Header() {
  const { t, locale } = useI18n();
  const { me, country, region, city, logout } = useApp();
  const [modal, setModal] = useState<null | 'place' | 'language'>(null);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!me) return;
    api<Notification[]>('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
  }, [me]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const place = country ? `${flag(country)} ${city ? `${city}${region ? ` - ${region}` : ''}` : region || countryName(country, locale)}` : `🌎 ${t('place.anywhere')}`;

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo" aria-label="SpaceHour">
          <span className="logo-mark">S</span><span className="logo-text">SpaceHour</span>
        </Link>
        <button className="search-pill" onClick={() => setModal('place')}>
          <span>{place}</span>
          <span className="sep" />
          <span className="muted">{t('header.anyTime')}</span>
          <span className="search-icon" aria-hidden>⌕</span>
        </button>
        <nav className="header-actions">
          <Link to={me?.roles.includes('host') ? '/anfitriao' : '/anfitriao/novo'} className="ghost-link hide-sm">{me?.roles.includes('host') ? t('header.hostMode') : t('header.becomeHost')}</Link>
          <button className="icon-btn" onClick={() => setModal('language')} aria-label={t('place.language')} title={LOCALE_NATIVE_NAMES[locale]}>🌐</button>
          <div className="menu-wrap" ref={menuRef}>
            <button className="user-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
              ☰ <span className="avatar">{me ? me.name[0] : '👤'}</span>
              {unread > 0 && <span className="dot" aria-label={t('notifications.unread', { n: unread })} />}
            </button>
            {menu && (
              <div className="menu" role="menu" onClick={() => setMenu(false)}>
                {!me && <>
                  <Link role="menuitem" to="/entrar"><strong>{t('auth.login')}</strong></Link>
                  <Link role="menuitem" to="/cadastro">{t('auth.register')}</Link>
                  <hr />
                  <Link role="menuitem" to="/anfitriao/novo">{t('header.becomeHost')}</Link>
                </>}
                {me && <>
                  <Link role="menuitem" to="/reservas"><strong>{t('nav.trips')}</strong></Link>
                  <Link role="menuitem" to="/favoritos">{t('nav.favorites')}</Link>
                  <Link role="menuitem" to="/notificacoes">{t('nav.notifications')}{unread ? ` (${unread})` : ''}</Link>
                  <hr />
                  <Link role="menuitem" to="/anfitriao">{t('nav.hostDashboard')}</Link>
                  <Link role="menuitem" to="/anfitriao?aba=anuncios">{t('nav.myListings')}</Link>
                  <Link role="menuitem" to="/anfitriao/novo">{t('nav.newListing')}</Link>
                  <Link role="menuitem" to="/perfil">{t('nav.profile')}</Link>
                  {me.roles.includes('admin') && <Link role="menuitem" to="/admin">{t('nav.admin')}</Link>}
                  <hr />
                </>}
                <Link role="menuitem" to="/regras">{t('nav.rules')}</Link>
                {me && <button role="menuitem" onClick={() => { logout(); nav('/'); }}>{t('auth.logout')}</button>}
              </div>
            )}
          </div>
        </nav>
      </div>
      {modal && <PlaceLanguageModal initialTab={modal} onClose={() => setModal(null)} />}
    </header>
  );
}
