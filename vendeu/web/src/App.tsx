import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading, RequireAuth } from './components/ui';
import { Browse } from './pages/Browse';
import { ListingDetail } from './pages/ListingDetail';
import { Sell } from './pages/Sell';
import { Wizard } from './pages/Wizard';
import { Checkout } from './pages/Checkout';
import { Messages } from './pages/Messages';
import { BecomeSeller, Login, Recover, Register, VerifyContacts } from './pages/Auth';
import { Kyc } from './pages/Kyc';
import { Account } from './pages/Account';
import { Fees } from './pages/Fees';
import { Safety } from './pages/Safety';
import { LegalIndex, LegalReader } from './pages/Legal';
import { NotFound } from './pages/NotFound';

const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/compra" replace />} />
        <Route path="compra" element={<Browse operation="venda" />} />
        <Route path="locacao" element={<Browse operation="locacao" />} />
        <Route path="anuncio/:id" element={<ListingDetail />} />
        <Route path="venda" element={<Sell />} />
        <Route path="venda/anunciar" element={<RequireAuth><Wizard /></RequireAuth>} />
        <Route path="venda/anuncio/:id/editar" element={<RequireAuth><Wizard /></RequireAuth>} />
        <Route path="venda/taxa/:saleId" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="mensagens" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="mensagens/:id" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="cadastrar" element={<Register />} />
        <Route path="entrar" element={<Login />} />
        <Route path="recuperar" element={<Recover />} />
        <Route path="conta/confirmar" element={<RequireAuth><VerifyContacts /></RequireAuth>} />
        <Route path="conta/anunciante" element={<RequireAuth><BecomeSeller /></RequireAuth>} />
        <Route path="conta/verificacao" element={<RequireAuth><Kyc /></RequireAuth>} />
        <Route path="conta" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="taxas" element={<Fees />} />
        <Route path="seguranca" element={<Safety />} />
        <Route path="legal" element={<LegalIndex />} />
        <Route path="legal/:key" element={<LegalReader />} />
        <Route path="admin" element={<RequireAuth admin><Suspense fallback={<Loading />}><Admin /></Suspense></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
