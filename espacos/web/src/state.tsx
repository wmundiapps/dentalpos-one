import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, hasToken, setToken } from './api';
import type { User } from '../../shared/types';
import { LAUNCH_COUNTRY_CODES } from '../../shared/countries';

export type Me = Omit<User, 'passwordHash'> & { activeStrikes: number };

interface AppCtx {
  me: Me | null;
  loadingMe: boolean;
  country: string;          // '' = todos os países
  region: string;           // UF no Brasil ('' = todos os estados)
  city: string;             // '' = todas as cidades
  setPlace: (country: string, city: string, region?: string) => void;
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
  // país guardado que não esteja aberto (ex.: antes do lançamento restrito) volta ao padrão
  const [country, setCountry] = useState(() => { const c = read('sh_country', ''); return LAUNCH_COUNTRY_CODES.includes(c) ? c : LAUNCH_COUNTRY_CODES.length === 1 ? LAUNCH_COUNTRY_CODES[0] : ''; });
  const [city, setCity] = useState(() => (LAUNCH_COUNTRY_CODES.includes(read('sh_country', '')) ? read('sh_city', '') : ''));
  const [region, setRegion] = useState(() => (LAUNCH_COUNTRY_CODES.includes(read('sh_country', '')) ? read('sh_region', '') : ''));

  const refreshMe = useCallback(async () => {
    if (!hasToken()) { setMe(null); setLoadingMe(false); return; }
    try { setMe(await api<Me>('/me')); } catch { setToken(null); setMe(null); } finally { setLoadingMe(false); }
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const setPlace = useCallback((c: string, ci: string, r = '') => {
    setCountry(c); setCity(ci); setRegion(r);
    try { localStorage.setItem('sh_country', c); localStorage.setItem('sh_city', ci); localStorage.setItem('sh_region', r); } catch { /* ignore */ }
  }, []);

  const login = useCallback((token: string, user: Me) => { setToken(token); setMe(user); }, []);
  const logout = useCallback(() => { setToken(null); setMe(null); }, []);

  return <Ctx.Provider value={{ me, loadingMe, country, region, city, setPlace, login, logout, refreshMe }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
