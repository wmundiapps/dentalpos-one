import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onlyDigits } from '@shared/documents';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction } from '../lib/hooks';
import { formatBRL, moneyToCents, PROMISE } from '../lib/format';
import { Alert, ErrorAlert } from './ui';
import { MoneyField } from './fields';
import { AddressFields, emptyIdentity, validateIdentity, type Identity } from './IdentityForm';

interface Props { listingId: string; priceCents: number; operation: 'venda' | 'locacao'; rentPeriod: string | null }

/** Comprar / Alugar / Fazer proposta. Tudo acontece pelo Vendeu: o pagamento fica retido até o recebimento. */
export function BuyPanel({ listingId, priceCents, operation }: Props) {
  const { user, ready } = useApp();
  const nav = useNavigate();
  const rent = operation === 'locacao';
  const verb = rent ? 'Alugar' : 'Comprar';
  const [mode, setMode] = useState<'envio' | 'retirada'>('envio');
  const a = user?.address;
  const [addr, setAddr] = useState<Identity>({ ...emptyIdentity(), cep: a?.cep ? a.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '', street: a?.street ?? '', number: a?.number ?? '', complement: a?.complement ?? '', district: a?.district ?? '', city: a?.city ?? '', state: a?.state ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [offering, setOffering] = useState(false);
  const [offer, setOffer] = useState('');
  const act = useAction();
  const min = Math.ceil(priceCents * 0.5);

  if (!ready) return null;
  if (!user) {
    return (
      <div className="panel stack" id="comprar">
        <h2>{verb} pelo Vendeu</h2>
        <p className="promise-line">🔒 {PROMISE}</p>
        <p>Entre na sua conta ou crie uma para {rent ? 'alugar' : 'comprar'} ou fazer uma proposta.</p>
        <div className="row wrap gap-s">
          <Link className="btn btn-primary" to={`/entrar?volta=${encodeURIComponent(`/anuncio/${listingId}`)}`}>Entrar</Link>
          <Link className="btn btn-outline" to="/cadastrar">Cadastrar</Link>
        </div>
      </div>
    );
  }
  if (!user.emailVerified || !user.phoneVerified) {
    return (
      <div className="panel stack" id="comprar">
        <h2>{verb} pelo Vendeu</h2>
        <Alert tone="warn">Confirme seu e-mail e seu telefone antes de {rent ? 'alugar' : 'comprar'} ou fazer proposta. É rápido: enviamos um código de 6 dígitos para cada um.</Alert>
        <Link className="btn btn-primary" to="/conta/confirmar">Confirmar contatos</Link>
      </div>
    );
  }

  const submit = async (offerCents?: number) => {
    if (mode === 'envio') {
      const er = validateIdentity({ ...addr, docType: 'cpf', docNumber: '52998224725', birthDate: '1980-01-01' });
      delete er.docNumber; delete er.birthDate; delete er.companyName;
      setErrors(er);
      if (Object.keys(er).length) return;
    }
    const body = {
      listingId, deliveryMode: mode, ...(offerCents ? { offerCents } : {}),
      ...(mode === 'envio' ? { shipTo: { cep: onlyDigits(addr.cep), street: addr.street.trim(), number: addr.number.trim(), complement: addr.complement.trim(), district: addr.district.trim(), city: addr.city.trim(), state: addr.state } } : {}),
    };
    const r = await act.run(() => api.post<{ id: string }>('/orders', body));
    if (r) nav(`/pedidos/${r.id}`);
  };
  const offerCents = moneyToCents(offer);
  const offerOk = offerCents >= min && offerCents <= priceCents;

  return (
    <form className="panel stack buy" id="comprar" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <h2>{verb} pelo Vendeu</h2>
      <p className="promise-line"><span aria-hidden="true">🔒</span> {PROMISE}</p>

      <fieldset className="plain-fieldset">
        <legend>{rent ? 'Como você recebe o item?' : 'Como você recebe o produto?'}</legend>
        <div className="seg-radio stack-radio" role="radiogroup" aria-label="Entrega">
          <label className={mode === 'envio' ? 'on' : ''}><input type="radio" name="entrega" checked={mode === 'envio'} onChange={() => setMode('envio')} />Receber em casa (envio)</label>
          <label className={mode === 'retirada' ? 'on' : ''}><input type="radio" name="entrega" checked={mode === 'retirada'} onChange={() => setMode('retirada')} />Retirar em mãos</label>
        </div>
      </fieldset>
      {mode === 'envio' ? (
        <AddressFields v={addr} set={(p) => setAddr((x) => ({ ...x, ...p }))} errors={errors} />
      ) : (
        <p className="small muted">Você combina a retirada pelo chat do Vendeu. Depois de pagar, aparece um <strong>código de 6 dígitos</strong> no seu pedido: só o passe ao vendedor quando estiver com o produto em mãos.</p>
      )}

      <ErrorAlert error={act.error} />

      {!offering ? (
        <div className="stack">
          <button className="btn btn-primary btn-lg" disabled={act.busy}>{act.busy ? 'Criando pedido…' : `${verb} por ${formatBRL(priceCents)}`}</button>
          <button type="button" className="btn btn-outline" onClick={() => setOffering(true)}>Fazer proposta</button>
        </div>
      ) : (
        <div className="stack offer-box">
          <MoneyField label="Sua proposta" value={offer} onChange={setOffer} hint={`De ${formatBRL(min)} (50% do preço) até ${formatBRL(priceCents)}. O vendedor tem 48 h para aceitar ou recusar.`} />
          <div className="row wrap">
            <button type="button" className="btn btn-primary" disabled={act.busy || !offerOk} onClick={() => void submit(offerCents)}>{act.busy ? 'Enviando…' : `Enviar proposta${offerCents ? ` de ${formatBRL(offerCents)}` : ''}`}</button>
            <button type="button" className="btn btn-outline" onClick={() => setOffering(false)}>Voltar</button>
          </div>
        </div>
      )}
      <p className="small muted">Você paga por Pix pelo próprio pedido. Se devolver em 7 dias, o dinheiro volta integral. Sem taxa extra para o comprador.</p>
    </form>
  );
}
