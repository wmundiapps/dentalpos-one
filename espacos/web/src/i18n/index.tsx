import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ptBR, { type Dict, type DictKey } from './locales/pt-BR';
import { RTL_LOCALES, SUPPORTED_LOCALES } from '../../../shared/countries';
import type { LocaleCode } from '../../../shared/types';

// Carrega os dicionários sob demanda; faltando uma chave, usa inglês e depois português.
const loaders = import.meta.glob<{ default: Partial<Dict> }>('./locales/*.ts');
const cache: Partial<Record<LocaleCode, Partial<Dict>>> = { 'pt-BR': ptBR };

async function loadDict(locale: LocaleCode): Promise<Partial<Dict>> {
  if (cache[locale]) return cache[locale]!;
  const loader = loaders[`./locales/${locale}.ts`];
  cache[locale] = loader ? (await loader()).default : {};
  return cache[locale]!;
}

function detectLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem('sh_locale') as LocaleCode | null;
    if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch { /* ignore */ }
  for (const lang of navigator.languages ?? [navigator.language]) {
    if (lang.toLowerCase().startsWith('pt')) return 'pt-BR';
    const base = lang.split('-')[0] as LocaleCode;
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return 'en';
}

type TFn = (key: DictKey, params?: Record<string, string | number>) => string;
interface I18nCtx { locale: LocaleCode; setLocale: (l: LocaleCode) => void; t: TFn; has: (key: string) => boolean; dir: 'rtl' | 'ltr' }
const Ctx = createContext<I18nCtx>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(detectLocale);
  const [dicts, setDicts] = useState<{ main: Partial<Dict>; en: Partial<Dict> }>({ main: cache[locale] ?? ptBR, en: {} });

  useEffect(() => {
    let alive = true;
    Promise.all([loadDict(locale), loadDict('en')]).then(([main, en]) => alive && setDicts({ main, en }));
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
    return () => { alive = false; };
  }, [locale]);

  const setLocale = useCallback((l: LocaleCode) => {
    try { localStorage.setItem('sh_locale', l); } catch { /* ignore */ }
    setLocaleState(l);
  }, []);

  const t = useCallback<TFn>((key, params) => {
    let s = dicts.main[key] ?? dicts.en[key] ?? ptBR[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [dicts]);
  const has = useCallback((key: string) => key in ptBR, []);

  const value = useMemo(() => ({ locale, setLocale, t, has, dir: RTL_LOCALES.includes(locale) ? 'rtl' as const : 'ltr' as const }), [locale, setLocale, t, has]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export type { DictKey };
