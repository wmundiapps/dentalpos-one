import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { api } from '../lib/api';
import { formatBRL } from '../lib/format';

export const LEGAL_LINKS: [string, string][] = [
  ['termos-de-uso', 'Termos de Uso'],
  ['politica-de-privacidade', 'Política de Privacidade'],
  ['politica-de-cookies', 'Política de Cookies'],
  ['regras-de-anuncio', 'Regras de Anúncio'],
  ['termo-de-responsabilidade-origem', 'Termo de Responsabilidade de Origem'],
  ['politica-de-taxas', 'Política de Taxas'],
  ['seguranca-e-anti-golpe', 'Segurança e Anti-golpe'],
];

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Vendeu — página inicial">
      <img src="/symbol.svg" alt="" width="36" height="36" />
      <span>Vendeu</span>
    </Link>
  );
}

function AccountMenu() {
  const { user, logout, feesDueCount } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  if (!user) return null;
  const first = user.fullName.split(' ')[0];
  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-ghost menu-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{first[0]}</span>
        <span className="hide-sm">{first}</span>
        {feesDueCount > 0 && <span className="dot" aria-label="Há taxa pendente" />}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <div className="menu-user"><strong>{user.fullName}</strong><span className="muted small">{user.email}</span></div>
          <Link role="menuitem" to="/conta">Minha conta</Link>
          <Link role="menuitem" to="/pedidos">Meus pedidos</Link>
          <Link role="menuitem" to="/venda">Painel do anunciante{feesDueCount > 0 ? ' (taxa pendente)' : ''}</Link>
          <Link role="menuitem" to="/mensagens">Mensagens</Link>
          {user.accountType === 'anunciante' && <Link role="menuitem" to="/conta/verificacao">Verificação de identidade</Link>}
          {user.role === 'admin' && <Link role="menuitem" to="/admin">Administração</Link>}
          <button role="menuitem" onClick={async () => { await logout(); nav('/'); }}>Sair</button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, ready, unread, feesDueCents, feesDueCount } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cookiesOk, setCookiesOk] = useState(true);
  const [legal, setLegal] = useState<{ key: string; title: string }[]>([]);

  useEffect(() => { try { setCookiesOk(localStorage.getItem('vendeu.cookies') === '1'); } catch { setCookiesOk(false); } }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => { setQ(new URLSearchParams(loc.search).get('q') ?? ''); }, [loc.search, loc.pathname]);
  useEffect(() => { api.get<{ documents: { key: string; title: string }[] }>('/legal').then((r) => setLegal(r.documents)).catch(() => undefined); }, []);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const base = loc.pathname.startsWith('/locacao') ? '/locacao' : '/compra';
    const next = new URLSearchParams(base === loc.pathname ? loc.search : '');
    if (q.trim()) next.set('q', q.trim()); else next.delete('q');
    next.delete('pagina');
    nav(`${base}?${next.toString()}`);
  };

  const legalLinks = legal.length ? legal.map((d) => [d.key, d.title] as [string, string]) : LEGAL_LINKS;

  return (
    <>
      <a href="#conteudo" className="skip">Pular para o conteúdo</a>
      <header className="site-header">
        <div className="container header-row">
          <Logo />
          <form className="search" role="search" onSubmit={search}>
            <label htmlFor="busca" className="sr-only">Buscar anúncios</label>
            <input id="busca" type="search" placeholder="Buscar produtos, imóveis, carros…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
            <button className="btn btn-primary" type="submit" aria-label="Buscar">🔍<span className="hide-sm"> Buscar</span></button>
          </form>
          <div className="header-actions">
            {user && (
              <Link to="/pedidos" className="icon-link icon-link-text" aria-label="Meus pedidos">
                <span aria-hidden="true">📦</span><span className="hide-sm">Pedidos</span>
              </Link>
            )}
            {user && (
              <Link to="/mensagens" className="icon-link" aria-label={unread ? `Mensagens, ${unread} não lidas` : 'Mensagens'}>
                <span aria-hidden="true">💬</span>
                {unread > 0 && <span className="count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
              </Link>
            )}
            {ready && !user && (<>
              <Link to="/entrar" className="btn btn-ghost">Entrar</Link>
              <Link to="/cadastrar" className="btn btn-primary">Cadastrar</Link>
            </>)}
            <AccountMenu />
          </div>
        </div>
        <nav className="container tabs" aria-label="Seções principais">
          <NavLink to="/compra" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Compra</NavLink>
          <NavLink to="/venda" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Venda</NavLink>
          <NavLink to="/locacao" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>Locação</NavLink>
          <NavLink to="/taxas" className={({ isActive }) => `tab tab-minor${isActive ? ' active' : ''}`}>Taxas</NavLink>
          <NavLink to="/seguranca" className={({ isActive }) => `tab tab-minor${isActive ? ' active' : ''}`}>Segurança</NavLink>
        </nav>
        {feesDueCount > 0 && !loc.pathname.startsWith('/venda') && (
          <div className="banner-warn">
            <div className="container">Você tem {formatBRL(feesDueCents)} em taxa de retirada para pagar. <Link to="/venda#taxas">Ver minhas taxas</Link></div>
          </div>
        )}
      </header>

      <main id="conteudo" className="container main" tabIndex={-1}><Outlet /></main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Logo />
            <p className="muted small">Anunciar não custa nada. A comissão só existe quando a venda se concluir.</p>
          </div>
          <div>
            <h2 className="footer-title">Documentos</h2>
            <ul className="plain">
              {legalLinks.map(([k, t]) => <li key={k}><Link to={`/legal/${k}`}>{t}</Link></li>)}
              <li><Link to="/legal">Todos os documentos</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="footer-title">Ajuda</h2>
            <ul className="plain">
              <li><Link to="/pedidos">Meus pedidos</Link></li>
              <li><Link to="/taxas">Quanto custa vender?</Link></li>
              <li><Link to="/seguranca">Segurança e anti-golpe</Link></li>
              <li>Suporte: <a href="mailto:suporte@vendeu.app">suporte@vendeu.app</a></li>
              <li>Encarregado (LGPD): <a href="mailto:privacidade@vendeu.app">privacidade@vendeu.app</a></li>
            </ul>
          </div>
        </div>
        <div className="container small muted footer-note">
          O Vendeu é uma plataforma de anúncios. O pagamento é processado e retido pelo Mercado Pago (o dinheiro não passa por conta do Vendeu) e a moderação decide disputas com base nas informações dos pedidos. © {new Date().getFullYear()} Vendeu.
        </div>
      </footer>

      {!cookiesOk && (
        <div className="cookie-bar" role="region" aria-label="Aviso de cookies">
          <p>Usamos apenas o cookie essencial de sessão para você continuar logado. Não usamos cookies de publicidade nem de análise. <Link to="/legal/politica-de-cookies">Política de cookies</Link></p>
          <button className="btn btn-primary" onClick={() => { try { localStorage.setItem('vendeu.cookies', '1'); } catch { /* ok */ } setCookiesOk(true); }}>Entendi</button>
        </div>
      )}
    </>
  );
}
