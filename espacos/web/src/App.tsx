import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { useApp } from './state';
import Home from './pages/Home';

const ListingPage = lazy(() => import('./pages/ListingPage'));
const Checkout = lazy(() => import('./pages/Checkout'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const Trips = lazy(() => import('./pages/Trips'));
const HostDashboard = lazy(() => import('./pages/HostDashboard'));
const ListingEditor = lazy(() => import('./pages/ListingEditor'));
const Profile = lazy(() => import('./pages/Profile'));
const Favorites = lazy(() => import('./pages/Favorites'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })));
const GuarantorPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.GuarantorPage })));
const ClientReviewPage = lazy(() => import('./pages/PublicPages').then((m) => ({ default: m.ClientReviewPage })));
const Notifications = lazy(() => import('./pages/Misc').then((m) => ({ default: m.Notifications })));
const IncidentPage = lazy(() => import('./pages/Misc').then((m) => ({ default: m.IncidentPage })));
const Admin = lazy(() => import('./pages/Misc').then((m) => ({ default: m.Admin })));

function Private({ children }: { children: ReactNode }) {
  const { me, loadingMe } = useApp();
  const loc = useLocation();
  if (loadingMe) return null;
  if (!me) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main">
        <Suspense fallback={<div className="container"><div className="skeleton hero-skeleton" /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/espacos/:id" element={<ListingPage />} />
            <Route path="/reservar/:id" element={<Private><Checkout /></Private>} />
            <Route path="/reservas" element={<Private><Trips /></Private>} />
            <Route path="/reservas/:id" element={<Private><BookingPage /></Private>} />
            <Route path="/anfitriao" element={<Private><HostDashboard /></Private>} />
            <Route path="/anfitriao/novo" element={<ListingEditor />} />
            <Route path="/anfitriao/espacos/:id" element={<Private><ListingEditor /></Private>} />
            <Route path="/anfitriao/reservas/:id" element={<Private><BookingPage /></Private>} />
            <Route path="/favoritos" element={<Private><Favorites /></Private>} />
            <Route path="/perfil" element={<Private><Profile /></Private>} />
            <Route path="/notificacoes" element={<Private><Notifications /></Private>} />
            <Route path="/ocorrencias/:id" element={<Private><IncidentPage /></Private>} />
            <Route path="/admin" element={<Private><Admin /></Private>} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<Register />} />
            <Route path="/avalista/:token" element={<GuarantorPage />} />
            <Route path="/avaliar/:token" element={<ClientReviewPage />} />
            <Route path="/regras" element={<LegalPage />} />
            <Route path="/regras/:doc" element={<LegalPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
