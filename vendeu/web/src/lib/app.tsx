import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface Address { cep: string; street: string; number: string; complement?: string | null; district: string; city: string; state: string }
export interface Me {
  id: string; role: 'user' | 'admin'; accountType: 'comprador' | 'anunciante'; fullName: string; email: string; phone: string;
  emailVerified: boolean; phoneVerified: boolean; docType: 'cpf' | 'cnpj' | null; docMasked: string | null; companyName: string | null;
  address: Address | null; kycStatus: 'none' | 'pending' | 'verified' | 'rejected'; kycRejectReason: string | null; feeBlocked: boolean;
  marketingOptIn: boolean; createdAt: string;
}
export interface AppConfig {
  brand: { name: string; supportEmail: string; privacyEmail: string };
  feeDueDays: number; feeCapCents: number; publishRequiresKyc: boolean; removalFeeCents: number; returnDays: number;
}
export interface PayInfo {
  method: { kind: string; connected: boolean; since: string } | null; provider: 'mock' | 'mercadopago';
  authorization: { version: string; text: string }; removalFeeCents: number;
}

interface Ctx {
  user: Me | null; ready: boolean; feesDueCents: number; feesDueCount: number; unread: number; config: AppConfig | null; pay: PayInfo | null; refreshPay: () => Promise<void>;
  refresh: () => Promise<Me | null>; refreshUnread: () => void; logout: () => Promise<void>;
}
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [due, setDue] = useState({ cents: 0, n: 0 });
  const [unread, setUnread] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [pay, setPay] = useState<PayInfo | null>(null);
  const userId = useRef<string | null>(null);
  const refreshPay = useCallback(async () => {
    try { setPay(await api.get<PayInfo>('/payment-method')); } catch { setPay(null); }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me; feesDueCents: number | string; feesDueCount: number }>('/me');
      setUser(r.user); userId.current = r.user.id;
      void refreshPay();
      setDue({ cents: Number(r.feesDueCents), n: r.feesDueCount });
      return r.user;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 401 || e.status === 403) { setUser(null); userId.current = null; setDue({ cents: 0, n: 0 }); setUnread(0); setPay(null); }
      return null;
    } finally { setReady(true); }
  }, [refreshPay]);

  const refreshUnread = useCallback(() => {
    if (!userId.current) return;
    api.get<{ items: { unread: number }[] }>('/messages')
      .then((r) => setUnread(r.items.reduce((a, c) => a + c.unread, 0)))
      .catch(() => undefined);
  }, []);

  useEffect(() => { void refresh(); api.get<AppConfig>('/config').then(setConfig).catch(() => undefined); }, [refresh]);
  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const t = setInterval(refreshUnread, 30000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* sai mesmo assim */ }
    setUser(null); userId.current = null; setUnread(0); setDue({ cents: 0, n: 0 });
  }, []);

  const value = useMemo(() => ({ user, ready, feesDueCents: due.cents, feesDueCount: due.n, unread, config, pay, refreshPay, refresh, refreshUnread, logout }), [user, ready, due, unread, config, pay, refreshPay, refresh, refreshUnread, logout]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
