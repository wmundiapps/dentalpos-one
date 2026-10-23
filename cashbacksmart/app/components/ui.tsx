'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions';

const Pending = createContext<boolean | null>(null);

export function Submit({ children, className = 'btn', pendingText = 'Aguarde…' }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const ctx = useContext(Pending);
  const { pending: formPending } = useFormStatus();
  const pending = ctx ?? formPending;
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

type Act = (prev: ActionState, f: FormData) => Promise<ActionState>;

/** Envia sem limpar os campos em caso de erro (o React limpa por padrão em form actions) */
export function useKeepForm(action: Act) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return { state, pending, ref, onSubmit };
}

/** Formulário com mensagem de erro/sucesso vinda da ação no servidor */
export function ActionForm({ action, children, className, resetOnOk, render, hideOnDone, onOk }: { action: Act; children: React.ReactNode; className?: string; resetOnOk?: boolean; render?: (s: ActionState) => React.ReactNode; hideOnDone?: boolean; onOk?: () => void }) {
  const { state, pending, ref, onSubmit } = useKeepForm(action);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
    if (state?.ok && onOk) onOk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, resetOnOk, ref]);
  const done = render && state?.ok ? render(state) : null;
  return (
    <Pending.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={className} noValidate>
        {state?.error && (
          <p className="alert error" role="alert" style={{ marginBottom: 14 }}>
            {state.error}
          </p>
        )}
        {state?.ok && !render && (
          <p className="alert ok" role="status" style={{ marginBottom: 14 }}>
            {state.ok}
          </p>
        )}
        {done}
        {!(done && hideOnDone) && children}
      </form>
    </Pending.Provider>
  );
}

export function PendingProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <Pending.Provider value={value}>{children}</Pending.Provider>;
}
