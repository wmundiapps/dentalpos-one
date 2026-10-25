import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction } from '../lib/hooks';
import { formatBRL } from '../lib/format';
import { Alert, ErrorAlert, Modal } from './ui';
import { SelectField } from './fields';

export interface WithdrawTarget { id: string; title: string; status: string; publishedAt: string | null }

/** Já foi ao ar (publicado e ainda ativo/pausado/em análise) = a retirada custa a taxa fixa. */
export const wasLive = (t: { status: string; publishedAt: string | null }) => !!t.publishedAt && ['active', 'paused', 'pending_review'].includes(t.status);

/** "Retirar anúncio": rascunho/recusado sai sem custo; anúncio já publicado paga a taxa fixa. */
export function WithdrawModal({ target, onClose, onDone, onPause }: { target: WithdrawTarget | null; onClose: () => void; onDone: () => void; onPause?: (id: string) => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title="Retirar anúncio">
      {target && <Body key={target.id} target={target} onClose={onClose} onDone={onDone} onPause={onPause} />}
    </Modal>
  );
}

function Body({ target, onClose, onDone, onPause }: { target: WithdrawTarget; onClose: () => void; onDone: () => void; onPause?: (id: string) => void }) {
  const nav = useNavigate();
  const { config, refresh } = useApp();
  const fee = config?.removalFeeCents ?? 1000;
  const live = wasLive(target);
  const [reason, setReason] = useState<'desisti' | 'erro_no_anuncio' | 'outro'>('desisti');
  const [ack, setAck] = useState(false);
  const act = useAction();
  const submit = async () => {
    const r = await act.run(() => api.post<{ saleId: string | null; feeCents: number }>(`/listings/${target.id}/close`, { sold: false, reason }));
    if (!r) return;
    await refresh();
    onDone();
    if (r.saleId) nav(`/venda/taxa/${r.saleId}`); else onClose();
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p><strong>{target.title}</strong></p>
      {live ? (
        <Alert tone="warn" title={`Retirar custa ${formatBRL(fee)}`}>
          Este anúncio já foi publicado, então retirá-lo sem vender tem uma taxa fixa de <strong>{formatBRL(fee)}</strong>, paga por Pix ou cartão em até {config?.feeDueDays ?? 7} dias. Não é comissão: a comissão só existe quando uma venda se conclui.
        </Alert>
      ) : (
        <Alert tone="ok">Este anúncio nunca foi ao ar (ou foi recusado): retirar é <strong>sem custo</strong>.</Alert>
      )}
      {live && onPause && target.status === 'active' && (
        <p className="small muted">Só quer dar um tempo? <button type="button" className="linklike" onClick={() => { onPause(target.id); onClose(); }}>Pause o anúncio</button>: pausar e retomar não custa nada.</p>
      )}
      <SelectField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
        <option value="desisti">Desisti de vender ou alugar</option>
        <option value="erro_no_anuncio">Errei algo no anúncio</option>
        <option value="outro">Outro motivo</option>
      </SelectField>
      {live && <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Entendi que retirar custa {formatBRL(fee)} e que o anúncio sai do ar agora.</span></label>}
      <ErrorAlert error={act.error} />
      <div className="row wrap">
        <button className="btn btn-primary" disabled={act.busy || (live && !ack)}>{act.busy ? 'Retirando…' : live ? `Retirar e pagar ${formatBRL(fee)}` : 'Retirar sem custo'}</button>
        <button type="button" className="btn btn-outline" onClick={onClose}>Voltar</button>
      </div>
    </form>
  );
}
