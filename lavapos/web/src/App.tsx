import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, setToken, getToken } from './api';
import { Loading } from './ui';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Checkin from './pages/Checkin';
import Orders, { OrderDetail } from './pages/Orders';
import Agenda from './pages/Agenda';
import Customers from './pages/Customers';
import Services from './pages/Services';
import Club from './pages/Club';
import Marketing from './pages/Marketing';
import Showcase from './pages/Showcase';
import Finance from './pages/Finance';
import Stock from './pages/Stock';
import Compliance from './pages/Compliance';
import Pricing from './pages/Pricing';
import Settings from './pages/Settings';
import Platform from './pages/Platform';
import PublicPage from './pages/PublicPage';
import Legal, { OptOut } from './pages/Legal';

export interface Me { user: { id: string; name: string; email: string; role: 'owner' | 'staff' | 'platform'; tenantId: string | null }; tenant: { id: string; slug: string; name: string; ownerName: string; trialEndsAt: string; billingStatus: string; monthlyFeeCents: number } | null }
const MeCtx = createContext<{ me: Me; reload: () => void; logout: () => void } | null>(null);
export const useMe = () => useContext(MeCtx)!;

const NAV: { to: string; label: string; icon: string; sec?: string; owner?: boolean }[] = [
  { to: '/', label: 'Hoje', icon: '🏠', sec: 'Dia a dia' }, { to: '/checkin', label: 'Novo check-in', icon: '📝' }, { to: '/patio', label: 'Pátio / Ordens', icon: '🚗' }, { to: '/agenda', label: 'Agenda', icon: '📅' }, { to: '/clientes', label: 'Clientes', icon: '👥' },
  { to: '/servicos', label: 'Serviços e preços', icon: '🧽', sec: 'Vender mais' }, { to: '/clube', label: 'Clube de assinatura', icon: '🔁' }, { to: '/marketing', label: 'Fidelidade e avisos', icon: '🎁' }, { to: '/vitrine', label: 'Antes e depois', icon: '✨' },
  { to: '/financeiro', label: 'Financeiro', icon: '💰', sec: 'Gestão' }, { to: '/estoque', label: 'Estoque e fornecedores', icon: '📦' }, { to: '/lembretes', label: 'Licenças e contratos', icon: '🔔' }, { to: '/precificacao', label: 'Precificação', icon: '📈', owner: true }, { to: '/configuracoes', label: 'Configurações', icon: '⚙️' },
];

export default function App() {
  const loc = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'out' | 'in'>(getToken() ? 'loading' : 'out');
  const [menu, setMenu] = useState(false);

  const load = () => api<Me>('/auth/me').then((m) => { setMe(m); setState('in'); }).catch(() => { setToken(null); setState('out'); });
  useEffect(() => { if (getToken()) void load(); }, []);
  useEffect(() => { const f = () => { setMe(null); setState('out'); }; window.addEventListener('lp:logout', f); return () => window.removeEventListener('lp:logout', f); }, []);
  useEffect(() => setMenu(false), [loc.pathname]);
  const logout = () => { setToken(null); setMe(null); setState('out'); };

  // Páginas públicas (sem login)
  const p = loc.pathname;
  if (p.startsWith('/l/')) return <Routes><Route path="/l/:slug" element={<PublicPage />} /></Routes>;
  if (p.startsWith('/legal/')) return <Routes><Route path="/legal/:doc" element={<Legal />} /></Routes>;
  if (p === '/sair') return <OptOut />;

  if (state === 'loading') return <div className="auth"><Loading /></div>;
  if (state === 'out' || !me) return <Auth onDone={load} />;

  if (me.user.role === 'platform') return <MeCtx.Provider value={{ me, reload: load, logout }}><div className="main"><Routes><Route path="*" element={<Platform />} /></Routes></div></MeCtx.Provider>;

  const items = NAV.filter((n) => !n.owner || me.user.role === 'owner');
  return (
    <MeCtx.Provider value={{ me, reload: load, logout }}>
      <div className="shell">
        <div className="topbar"><button aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button><b>{me.tenant?.name}</b></div>
        <nav className={`side ${menu ? 'open' : ''}`} aria-label="Menu principal">
          <div className="logo"><img src="/logo.svg" alt="" />LavaPos</div>
          {items.map((n) => (<div key={n.to}>{n.sec && <div className="sec">{n.sec}</div>}<NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden>{n.icon}</span>{n.label}</NavLink></div>))}
          <div className="sec">Conta</div>
          <a href="#sair" onClick={(e) => { e.preventDefault(); logout(); }}>🚪 Sair ({me.user.name.split(' ')[0]})</a>
          <p className="small" style={{ opacity: .6, padding: '10px 12px' }}>Nunca pedimos sua senha por WhatsApp, SMS ou e-mail.</p>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} /><Route path="/checkin" element={<Checkin />} /><Route path="/patio" element={<Orders />} /><Route path="/os/:id" element={<OrderDetail />} />
            <Route path="/agenda" element={<Agenda />} /><Route path="/clientes" element={<Customers />} /><Route path="/servicos" element={<Services />} /><Route path="/clube" element={<Club />} />
            <Route path="/marketing" element={<Marketing />} /><Route path="/vitrine" element={<Showcase />} /><Route path="/financeiro" element={<Finance />} /><Route path="/estoque" element={<Stock />} />
            <Route path="/lembretes" element={<Compliance />} /><Route path="/precificacao" element={<Pricing />} /><Route path="/configuracoes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <p className="notice-foot">LavaPos · <a href="/legal/contrato">Contrato</a> · <a href="/legal/privacidade">Privacidade</a> · Suporte: suporte@lavapos.com.br</p>
        </main>
      </div>
    </MeCtx.Provider>
  );
}
