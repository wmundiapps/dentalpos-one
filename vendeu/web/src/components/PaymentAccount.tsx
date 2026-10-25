import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { Alert, ErrorAlert, Modal } from './ui';

/**
 * Conta Mercado Pago do vendedor (é por ela que ele recebe). Sem cartão: o login é do próprio Mercado Pago,
 * o Vendeu não vê senha nem dados bancários. Modo simulado só em desenvolvimento.
 */
export function PaymentAccount({ onChanged }: { onChanged?: () => void }) {
  const { pay, refreshPay, refresh, user } = useApp();
  const [ok, setOk] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const act = useAction();
  const off = useAction();

  if (!pay) return <p className="small muted">Carregando a situação da conta Mercado Pago…</p>;
  const connected = !!pay.method?.connected;

  const connect = async () => {
    await act.run(async () => {
      if (pay.provider === 'mock') {
        await api.post('/payment-method', { token: 'mock_ok', authorize: true });
        await refreshPay(); await refresh(); onChanged?.();
      } else {
        const r = await api.post<{ url: string }>('/payment-method/mp/start', { authorize: true });
        window.location.href = r.url;
      }
    });
  };
  const disconnect = async () => {
    if (await off.run(() => api.del('/payment-method'))) { setConfirmOff(false); await refreshPay(); await refresh(); onChanged?.(); }
  };

  if (connected) {
    return (
      <div className="stack">
        <Alert tone="ok" title="Conta Mercado Pago conectada">
          Você recebe suas vendas por ela{pay.method?.since ? ` (conectada em ${fmtDate(pay.method.since)})` : ''}. O Vendeu não vê sua senha nem seus dados bancários.
        </Alert>
        <div><button type="button" className="btn btn-outline btn-sm" onClick={() => { off.clear(); setConfirmOff(true); }}>Desconectar conta</button></div>
        <Modal open={confirmOff} onClose={() => setConfirmOff(false)} title="Desconectar a conta Mercado Pago?">
          <div className="stack">
            <p>Sem a conta conectada você não consegue publicar anúncios nem receber pedidos. Só é possível desconectar se não houver anúncio no ar, pedido em andamento ou taxa a pagar.</p>
            <ErrorAlert error={off.error} />
            <div className="row wrap"><button className="btn btn-danger" disabled={off.busy} onClick={disconnect}>{off.busy ? 'Desconectando…' : 'Desconectar'}</button><button className="btn btn-outline" onClick={() => setConfirmOff(false)}>Voltar</button></div>
          </div>
        </Modal>
      </div>
    );
  }

  return <ConnectForm pay={pay} busy={act.busy} error={act.error} onConnect={connect} isSeller={user?.accountType === 'anunciante'} ok={ok} setOk={setOk} />;
}

function ConnectForm({ pay, busy, error, onConnect, isSeller, ok, setOk }: { pay: NonNullable<ReturnType<typeof useApp>['pay']>; busy: boolean; error: unknown; onConnect: () => void; isSeller: boolean; ok: boolean; setOk: (v: boolean) => void }) {
  return (
    <div className="stack">
      <p className="small muted">É por esta conta que você recebe. Você entra com o login do próprio Mercado Pago; o Vendeu não vê senha, número de cartão nem dados bancários.</p>
      <div className="auth-text" tabIndex={0} role="region" aria-label="Texto de autorização">
        {pay.authorization.text.split('\n').map((l, i) => <p key={i}>{l}</p>)}
      </div>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Li e autorizo.</span></label>
      {pay.provider === 'mock' && <p className="small muted">Ambiente de teste: a conexão é simulada, sem login real do Mercado Pago.</p>}
      {!isSeller && <Alert tone="warn">Só contas de anunciante conectam o Mercado Pago. Complete o cadastro de anunciante primeiro.</Alert>}
      <ErrorAlert error={error} />
      <div><button type="button" className="btn btn-primary" disabled={!ok || busy || !isSeller} onClick={onConnect}>{busy ? 'Conectando…' : 'Conectar conta Mercado Pago'}</button></div>
    </div>
  );
}
