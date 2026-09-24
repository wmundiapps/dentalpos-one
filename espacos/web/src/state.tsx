import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, hasToken, setToken } from './api';
import type { User } from '../../shared/types';

export type Me = Omit<User, 'passwordHash'> & { activeStrikes: number };

interface AppCtx {
  me: Me | null;
  loadingMe: boolean;
  country: string;          // '' = todos os países
  city: string;             // '' = todas as cidades
  setPlace: (country: string, city: string) => void;
  login: (token: string, me: Me) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<AppCtx>(null!);

function read(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(hasToken());
  const [country, setCountry] = useState(() => read('sh_country', ''));
  const [city, setCity] = useState(() => read('sh_city', ''));

  const refreshMe = useCallback(async () => {
    if (!hasToken()) { setMe(null); setLoadingMe(false); return; }
    try { setMe(await api<Me>('/me')); } catch { setToken(null); setMe(null); } finally { setLoadingMe(false); }
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const setPlace = useCallback((c: string, ci: string) => {
    setCountry(c); setCity(ci);
    try { localStorage.setItem('sh_country', c); localStorage.setItem('sh_city', ci); } catch { /* ignore */ }
  }, []);

  const login = useCallback((token: string, user: Me) => { setToken(token); setMe(user); }, []);
  const logout = useCallback(() => { setToken(null); setMe(null); }, []);

  return <Ctx.Provider value={{ me, loadingMe, country, city, setPlace, login, logout, refreshMe }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
