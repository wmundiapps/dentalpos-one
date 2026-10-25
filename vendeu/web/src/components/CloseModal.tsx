import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync } from '../lib/hooks';
import { calcFeeCents, formatBRL } from '@shared/fees';
import { centsToMasked, moneyToCents } from '../lib/format';
import { Alert, ErrorAlert, Modal } from './ui';
import { MoneyField, SelectField, TextAreaField } from './fields';

export interface CloseTarget { id: string; title: string; priceCents: number; operation: 'venda' | 'locacao' }

interface Conv { id: string; listingId: string; role: 'buyer' | 'seller'; buyerId: string; otherName: string }

/** "Vendi / Aluguei — retirar anúncio": pergunta, calcula a taxa na hora e leva ao checkout. */
export function CloseModal({ target, onClose, onDone }: { target: CloseTarget | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title="Retirar anúncio">
      {target && <CloseBody key={target.id} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function CloseBody({ target, onClose, onDone }: { target: CloseTarget; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const { config, refresh } = useApp();
  const rent = target.operation === 'locacao';
  const verb = rent ? 'alugou' : 'vendeu';
  const [step, setStep] = useState<'ask' | 'sold' | 'notsold'>('ask');
  const [price, setPrice] = useState(centsToMasked(target.priceCents));
  const [buyerId, setBuyerId] = useState('');
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState<'desisti' | 'erro_no_anuncio' | 'outro'>('desisti');
  const [serverMax, setServerMax] = useState<number | null>(null);
  const act = useAction();
  const convs = useAsync(() => api.get<{ items: Conv[] }>('/messages'), [target.id], { enabled: step === 'sold' });

  const cents = moneyToCents(price);
  const fee = useMemo(() => { try { return cents >= 100 ? calcFeeCents(cents, config?.feeCapCents ?? 0) : 0; } catch { return 0; } }, [cents, config]);
  const listed = serverMax ?? target.priceCents;
  const under = cents > 0 && cents < listed * 0.7;
  const buyers = (convs.data?.items ?? []).filter((c) => c.listingId === target.id && c.role === 'seller');
  const noteOk = !under || note.trim().length >= 10;
  const canSubmit = cents >= 100 && ack && noteOk && !act.busy;

  const submitSold = () => act.run(async () => {
    try {
      const r = await api.post<{ saleId: string }>(`/listings/${target.id}/close`, {
        sold: true, declaredPriceCents: cents, ...(buyerId ? { buyerId } : {}), ...(note.trim() ? { note: note.trim() } : {}),
      });
      await refresh();
      onDone();
      nav(`/venda/taxa/${r.saleId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'under_declared_needs_note') setServerMax((e.detail as { listedMaxCents?: number })?.listedMaxCents ?? null);
      throw e;
    }
  });
  const submitNot = () => act.run(async () => { await api.post(`/listings/${target.id}/close`, { sold: false, reason }); onDone(); onClose(); });

  if (step === 'ask') {
    return (
      <div className="stack">
        <p><strong>{target.title}</strong></p>
        <p>Você {verb} este {rent ? 'item' : 'produto'}?</p>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setStep('sold')}>Sim, {rent ? 'aluguei' : 'vendi'}</button>
          <button className="btn btn-outline" onClick={() => setStep('notsold')}>Não {rent ? 'aluguei' : 'vendi'}</button>
        </div>
        <p className="small muted">Se {rent ? 'alugou' : 'vendeu'}, o anúncio sai do ar e você paga a taxa de sucesso. Se não, retire grátis.</p>
      </div>
    );
  }

  if (step === 'notsold') {
    return (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submitNot(); }}>
        <Alert tone="ok">Retirar sem {rent ? 'alugar' : 'vender'} é <strong>grátis</strong>. Nenhuma taxa será cobrada.</Alert>
        <SelectField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          <option value="desisti">Desisti de {rent ? 'alugar' : 'vender'}</option>
          <option value="erro_no_anuncio">Errei algo no anúncio</option>
          <option value="outro">Outro motivo</option>
        </SelectField>
        <ErrorAlert error={act.error} />
        <div className="row wrap">
          <button className="btn btn-primary" disabled={act.busy}>{act.busy ? 'Retirando…' : 'Retirar anúncio grátis'}</button>
          <button type="button" className="btn btn-outline" onClick={() => setStep('ask')}>Voltar</button>
        </div>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submitSold(); }}>
      <MoneyField label={`Valor fechado (por quanto você ${rent ? 'alugou' : 'vendeu'})`} value={price} onChange={setPrice}
        hint={`Anunciado por ${formatBRL(target.priceCents)}. Informe o valor real do negócio.`} required />
      <SelectField label="Quem comprou? (opcional)" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}
        hint="Escolha entre as pessoas que conversaram com você neste anúncio.">
        <option value="">Não estava no Vendeu / prefiro não informar</option>
        {buyers.map((b) => <option key={b.id} value={b.buyerId}>{b.otherName}</option>)}
      </SelectField>

      <div className="fee-live" aria-live="polite">
        <div>Taxa de sucesso: <strong>{fee ? formatBRL(fee) : '—'}</strong></div>
        <div>{fee ? <>Você fica com <strong>{formatBRL(cents - fee)}</strong></> : 'Digite o valor para ver a taxa.'}</div>
      </div>

      {under && (
        <Alert tone="warn" title="Valor bem abaixo do anunciado">
          O valor fechado está mais de 30% abaixo do preço anunciado ({formatBRL(listed)}). Explique o motivo; este caso vai para análise da equipe.
          <TextAreaField label="Justificativa (mínimo 10 caracteres)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={3} />
        </Alert>
      )}
      {!under && (
        <TextAreaField label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={2} />
      )}

      <label className="check">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>Entendi: <strong>o anúncio sai do ar agora</strong> e eu pago a taxa de {fee ? formatBRL(fee) : 'sucesso'} em até {config?.feeDueDays ?? 7} dias. Declaro que o valor informado é verdadeiro.</span>
      </label>
      <ErrorAlert error={act.error} />
      <div className="row wrap">
        <button className="btn btn-primary" disabled={!canSubmit}>{act.busy ? 'Encerrando…' : 'Confirmar e ir para o pagamento'}</button>
        <button type="button" className="btn btn-outline" onClick={() => setStep('ask')}>Voltar</button>
      </div>
    </form>
  );
}
