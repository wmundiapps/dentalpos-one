import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

// Janela "próximo passo" da jornada: diz em poucas palavras o que aconteceu e o que fazer agora.
export interface NextStepAction { label: string; to?: string; onClick?: () => void; primary?: boolean }

export function NextStep({ icon = '✅', title, children, steps, actions, onClose }: {
  icon?: string; title: string; children?: ReactNode; steps?: string[]; actions: NextStepAction[]; onClose?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal next-step" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {onClose && <button className="icon-btn next-step-close" onClick={onClose} aria-label={t('common.close')}>✕</button>}
        <div className="next-step-icon" aria-hidden>{icon}</div>
        <h2>{title}</h2>
        {children && <div className="next-step-body">{children}</div>}
        {steps && steps.length > 0 && (
          <ol className="next-step-list">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        )}
        <div className="next-step-actions">
          {actions.map((a, i) => a.to
            ? <Link key={i} to={a.to} className={`btn btn-big ${a.primary !== false && i === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={a.onClick}>{a.label}</Link>
            : <button key={i} type="button" className={`btn btn-big ${a.primary !== false && i === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={a.onClick}>{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}
