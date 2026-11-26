import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ErrorAction } from '../api';
import { useI18n, type DictKey } from '../i18n';

/** Botão "ir resolver" que acompanha a mensagem de erro (o servidor diz para onde ir). */
export function ActionButton({ action }: { action?: ErrorAction }) {
  const { t } = useI18n();
  if (!action) return null;
  return <Link className="btn btn-outline small action-btn" to={action.to}>{t(`action.${action.label}` as DictKey)} →</Link>;
}

/** Ao abrir uma rota com #âncora, rola até a seção (espera a tela carregar). */
export function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 20) {
        clearInterval(timer);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname, hash]);
  return null;
}
