import { ApiError } from './api';
import type { DictKey } from './i18n';

type T = (key: DictKey, params?: Record<string, string | number>) => string;

// Converte erros da API (códigos) em mensagens no idioma atual.
export function errorText(e: unknown, t: T): string {
  if (e instanceof ApiError) {
    if (e.code === 'invalid_occurrences' && Array.isArray(e.params)) {
      return (e.params as Array<{ code: string; params?: Record<string, string | number> }>).map((x) => t(`val.${x.code}` as DictKey, x.params)).join(' · ');
    }
    if (e.code === 'validation' && Array.isArray(e.params)) {
      return `${t('err.validation')}: ${(e.params as Array<{ path: string }>).map((p) => p.path).join(', ')}`;
    }
    const key = `err.${e.code}` as DictKey;
    const msg = t(key, (e.params ?? {}) as Record<string, string | number>);
    return msg === key ? t('err.internal') : msg;
  }
  return t('err.network');
}
