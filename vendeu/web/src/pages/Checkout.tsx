import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { daysLeft, fmtDate, fmtDateTime, formatBRL, SALE_STATUS } from '../lib/format';
import { Alert, Badge, copyText, ErrorAlert, ErrorState, Loading, PageHead } from '../components/ui';

interface SaleView {
  id: string; kind: string; listingId: string; listingTitle: string; feeCents: number; status: string;
  dueAt: string; paidAt: string | null; receiptNumber: string | null; pix: { copyPaste: string; qrBase64: string | null } | null; checkoutUrl: string | null; createdAt: string;
}

export function Checkout() {
  const { saleId } = useParams();
  const { refresh, pay: payInfo } = useApp();
  usePageTitle('Pagar taxa de retirada');
  const [polling, setPolling] = useState(true);
  const s = useAsync(() => api.get<SaleView>(`/sales/${saleId}`).then((r) => { if (r.status !== 'awaiting_payment') setPolling(false); return r; }), [saleId], { silentMs: polling ? 5000 : undefined });
  const act = useAction();
  const [copied, setCopied] = useState(false);
  const sim = useAction();

  const sale = s.data;
  if (s.loading && !sale) return <Loading />;
  if (s.error && !sale) return <ErrorState error={s.error} onRetry={s.reload} />;
  const v = sale!;
  const awaiting = v.status === 'awaiting_payment';
  const dl = daysLeft(v.dueAt);
  const st = SALE_STATUS[v.status] ?? { label: v.status, tone: 'muted' as const };
  const mock = payInfo?.provider === 'mock';
  const mockCard = !!v.checkoutUrl && v.checkoutUrl.includes('/pagamento-simulado');
  const realCard = !!v.checkoutUrl && !mockCard && /^https:\/\//.test(v.checkoutUrl);

  const pay = async (method: 'pix' | 'cartao') => {
    const r = await act.run(() => api.post<SaleView>(`/sales/${v.id}/pay`, { method }));
    if (r) { s.setData(r); setPolling(true); }
  };
  const doCopy = async () => { if (v.pix && await copyText(v.pix.copyPaste)) { setCopied(true); setTimeout(() => setCopied(false), 2500); } };
  const simulate = async () => {
    const r = await sim.run(() => api.post<SaleView>(`/sales/${v.id}/simulate-payment`));
    if (r) { s.setData(r); setPolling(false); void refresh(); }
  };

  if (v.status === 'paid') {
    return (
      <div className="narrow stack-l">
        <PageHead title="Pagamento confirmado" sub="Obrigado! A taxa de retirada foi paga." />
        <section className="panel receipt" aria-label="Recibo">
          <h2>Recibo nº {v.receiptNumber}</h2>
          <dl className="attrs">
            <div><dt>Anúncio</dt><dd>{v.listingTitle}</dd></div>
            <div><dt>Taxa de retirada paga</dt><dd>{formatBRL(v.feeCents)}</dd></div>
            <div><dt>Pago em</dt><dd>{fmtDateTime(v.paidAt)}</dd></div>
          </dl>
          <p className="small muted">O anúncio foi retirado. Guarde este recibo.</p>
        </section>
        <div className="row wrap"><button className="btn btn-outline" onClick={() => window.print()}>Imprimir recibo</button><Link className="btn btn-primary" to="/venda">Voltar ao painel</Link></div>
      </div>
    );
  }

  return (
    <div className="narrow stack-l">
      <PageHead title="Pagar a taxa de retirada" sub="O anúncio já saiu do ar. A taxa de retirada é fixa e não é comissão: comissão só existe quando uma venda se conclui."} />
      <section className="panel stack" aria-label="Resumo">
        <div className="row between wrap"><strong>{v.listingTitle}</strong><Badge tone={st.tone}>{st.label}</Badge></div>
        <dl className="attrs">
          <div><dt>Taxa de retirada a pagar</dt><dd className="price">{formatBRL(v.feeCents)}</dd></div>
          <div><dt>Prazo</dt><dd>{fmtDate(v.dueAt)}{awaiting ? (dl >= 0 ? ` (${dl} dia${dl === 1 ? '' : 's'})` : ' (vencida)') : ''}</dd></div>
        </dl>
        {awaiting && dl < 0 && <Alert tone="bad">A taxa venceu. Pague agora para não ficar sem poder anunciar.</Alert>}
      </section>

      {!awaiting && <Alert tone="info">{v.status === 'waived' ? 'Esta taxa foi isentada pela equipe.' : 'Esta cobrança não está mais disponível.'} <Link to="/venda">Voltar ao painel</Link></Alert>}

      {awaiting && (
        <section className="stack" aria-label="Forma de pagamento">
          <h2>Como você quer pagar?</h2>
          <div className="pay-options">
            <button className={`pay-opt${v.pix ? ' on' : ''}`} disabled={act.busy} onClick={() => pay('pix')}><span aria-hidden="true">⚡</span><strong>Pix</strong><span className="small muted">Aprovação na hora</span></button>
            <button className={`pay-opt${v.checkoutUrl ? ' on' : ''}`} disabled={act.busy} onClick={() => pay('cartao')}><span aria-hidden="true">💳</span><strong>Cartão</strong><span className="small muted">Abre o pagamento seguro</span></button>
          </div>
          {act.busy && <p role="status" className="small">Gerando cobrança…</p>}
          <ErrorAlert error={act.error} />

          {v.pix && (
            <div className="panel stack" aria-live="polite">
              <h3>Pague com Pix</h3>
              {v.pix.qrBase64 && <img className="qr" alt="QR Code do Pix" src={`data:image/png;base64,${v.pix.qrBase64}`} width={200} height={200} />}
              <label htmlFor="pix-code" className="small">Pix copia e cola</label>
              <textarea id="pix-code" readOnly rows={3} value={v.pix.copyPaste} onFocus={(e) => e.currentTarget.select()} />
              <div className="row wrap"><button className="btn btn-primary" onClick={doCopy}>{copied ? '✔ Código copiado' : 'Copiar código'}</button></div>
              <p className="small muted">Abra o app do seu banco, escolha Pix &gt; Copia e Cola e cole o código. Esta tela atualiza sozinha quando o pagamento for confirmado.</p>
            </div>
          )}
          {v.checkoutUrl && (
            <div className="panel stack">
              <h3>Pague com cartão</h3>
              {realCard && <a className="btn btn-primary btn-lg" href={v.checkoutUrl!} target="_blank" rel="noopener noreferrer">Abrir pagamento com cartão</a>}
              <p className="small muted">Você será levado ao ambiente seguro do Mercado Pago. Depois de pagar, volte aqui: esta tela atualiza sozinha.</p>
            </div>
          )}

          {mock && (
            <Alert tone="warn" title="Modo de teste">
              O pagamento está simulado (nenhum dinheiro de verdade).
              <div style={{ marginTop: 8 }}><button className="btn btn-accent" disabled={sim.busy} onClick={simulate}>{sim.busy ? 'Simulando…' : 'Simular pagamento (apenas teste)'}</button></div>
              <ErrorAlert error={sim.error} />
            </Alert>
          )}
          {polling && (v.pix || v.checkoutUrl) && <p className="small muted" role="status">⏳ Aguardando confirmação do pagamento…</p>}

        </section>
      )}

    </div>
  );
}
