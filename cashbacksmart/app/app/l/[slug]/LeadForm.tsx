'use client';

import Link from 'next/link';
import { submitLeadAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

export function LeadForm({ slug, question, storeName }: { slug: string; question: string | null; storeName: string | null }) {
  return (
    <ActionForm
      action={submitLeadAction}
      hideOnDone
      render={(st) =>
        st?.data?.done ? (
          <div className="stack">
            <p className="alert ok">{st.ok}</p>
            <p>Enquanto isso, crie sua conta grátis e ganhe cashback nas lojas da sua cidade.</p>
            <Link href="/cadastro" className="btn block">
              Criar conta grátis
            </Link>
          </div>
        ) : null
      }
    >
      <input type="hidden" name="slug" value={slug} />
      <div className="field" style={{ position: 'absolute', left: -9999 }} aria-hidden="true">
        <label htmlFor="l-website">Site</label>
        <input id="l-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="l-name">Seu nome</label>
        <input id="l-name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="l-phone">WhatsApp com DDD</label>
        <input id="l-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(44) 99999-0000" required />
      </div>
      <div className="field">
        <label htmlFor="l-email">E-mail (opcional)</label>
        <input id="l-email" name="email" type="email" autoComplete="email" />
      </div>
      {question && (
        <div className="field">
          <label htmlFor="l-answer">{question}</label>
          <input id="l-answer" name="answer" maxLength={300} />
        </div>
      )}
      <div className="field">
        <label className="check">
          <input type="checkbox" name="consent" required />
          <span>
            Autorizo {storeName ? `a ${storeName}` : 'as lojas participantes'} e o Cashbacksmart a falarem comigo por WhatsApp, telefone e e-mail sobre esta oferta. Posso cancelar quando quiser. <Link href="/termos">Privacidade</Link>
          </span>
        </label>
      </div>
      <Submit className="btn block" pendingText="Enviando…">
        Quero a oferta
      </Submit>
    </ActionForm>
  );
}
