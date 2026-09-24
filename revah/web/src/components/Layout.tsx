import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bot,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Phone,
  Plug,
  Search,
  Send,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { PLAN_LABEL } from '../lib/format'
import { useAuthed } from '../lib/session'
import { Badge } from './ui'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

export function Brand({ name, small }: { name: string; small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-sm' : ''}`}>
      <span className="brand-mark">{name === 'REVAH' ? 'R' : 'M'}</span>
      <span className="brand-name">
        {name}
        {name === 'REVAH' && <sup>®</sup>}
      </span>
    </div>
  )
}

export function Layout() {
  const { session, embedded, productName, logout } = useAuthed()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { tenant } = session

  useEffect(() => setMenuOpen(false), [location.pathname])

  const items: NavItem[] = [
    { to: '/', label: 'Painel', icon: <LayoutDashboard size={18} />, end: true },
    { to: '/inbox', label: 'Inbox', icon: <MessageSquare size={18} /> },
    { to: '/contatos', label: 'Contatos', icon: <Users size={18} /> },
    { to: '/campanhas', label: 'Campanhas', icon: <Send size={18} /> },
    { to: '/automacoes', label: 'Automações', icon: <Bot size={18} /> },
    { to: '/canais', label: 'Canais', icon: <Plug size={18} /> },
    { to: '/voz', label: embedded ? 'Ligações' : 'REVAH Voice', icon: <Phone size={18} /> },
  ]
  // Leads é add-on: no modo embutido só aparece se já estiver contratado.
  if (!embedded || tenant.leadsAddonActive) items.push({ to: '/leads', label: embedded ? 'Leads' : 'REVAH Leads', icon: <Search size={18} /> })
  if (!embedded) items.push({ to: '/assinatura', label: 'Assinatura', icon: <CreditCard size={18} /> })
  items.push({ to: '/configuracoes', label: 'Configurações', icon: <Settings size={18} /> })
  if (session.superadmin) items.push({ to: '/admin', label: 'Admin WMundi', icon: <Shield size={18} /> })

  const bottom = items.slice(0, 4)
  const trial = tenant.trial

  const nav = (
    <nav className="nav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {i.icon}
          <span>{i.label}</span>
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className={`shell ${embedded ? 'shell-embedded' : ''}`}>
      <aside className="sidebar">
        <Brand name={productName} />
        {nav}
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-name">{session.user.name}</div>
            <div className="user-mail">{session.user.email}</div>
          </div>
          {!embedded && (
            <button
              className="nav-item"
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div className="topbar-company">
            <span className="company-name">{tenant.name}</span>
            {!embedded && <Badge tone={tenant.plan === 'TRIAL' ? 'amber' : 'indigo'}>{PLAN_LABEL[tenant.plan] || tenant.plan}</Badge>}
            {tenant.status === 'PAST_DUE' && <Badge tone="red">Pagamento pendente</Badge>}
          </div>
          {trial.isTrial && (
            <NavLink to={embedded ? '/campanhas' : '/assinatura'} className={`trial-chip ${trial.exhausted ? 'exhausted' : ''}`}>
              {trial.exhausted ? (
                'Teste grátis encerrado'
              ) : (
                <>
                  <span className="hide-sm">Teste grátis: {trial.campaignsRemaining}/{trial.maxCampaigns} campanhas restantes</span>
                  <span className="show-sm-inline">Grátis: {trial.campaignsRemaining}/{trial.maxCampaigns}</span>
                </>
              )}
            </NavLink>
          )}
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        {bottom.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `bottom-item ${isActive ? 'active' : ''}`}>
            {i.icon}
            <span>{i.label}</span>
          </NavLink>
        ))}
        <button className="bottom-item" onClick={() => setMenuOpen(true)}>
          <Menu size={18} />
          <span>Mais</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="overlay overlay-menu" onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
          <div className="mobile-menu">
            <div className="mobile-menu-head">
              <Brand name={productName} small />
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <X size={20} />
              </button>
            </div>
            {nav}
            <div className="sidebar-foot">
              <div className="user-chip">
                <div className="user-name">{session.user.name}</div>
                <div className="user-mail">{session.user.email}</div>
              </div>
              {!embedded && (
                <button
                  className="nav-item"
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                >
                  <LogOut size={18} />
                  <span>Sair</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
