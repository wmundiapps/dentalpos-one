import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useSession } from './lib/session'
import { ForgotPassword, Login, Register, ResetPassword, Sso } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import Inbox from './pages/Inbox'
import Campaigns from './pages/Campaigns'
import Automations from './pages/Automations'
import Channels from './pages/Channels'
import Voice from './pages/Voice'
import Leads from './pages/Leads'
import Billing from './pages/Billing'
import SettingsPage from './pages/Settings'
import Admin from './pages/Admin'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session } = useSession()
  return session ? <Navigate to="/" replace /> : <>{children}</>
}

function NotEmbedded({ children }: { children: ReactNode }) {
  const { embedded } = useSession()
  return embedded ? <Navigate to="/" replace /> : <>{children}</>
}

function SuperadminOnly({ children }: { children: ReactNode }) {
  const { session } = useSession()
  return session?.superadmin ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/cadastro" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="/sso" element={<Sso />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/contatos" element={<Contacts />} />
        <Route path="/campanhas" element={<Campaigns />} />
        <Route path="/campanhas/:id" element={<Campaigns />} />
        <Route path="/automacoes" element={<Automations />} />
        <Route path="/canais" element={<Channels />} />
        <Route path="/voz" element={<Voice />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/assinatura" element={<NotEmbedded><Billing /></NotEmbedded>} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/admin" element={<SuperadminOnly><Admin /></SuperadminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
