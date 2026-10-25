import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, downloadJson } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { normalizePhoneBR } from '@shared/documents';
import { fmtDate, fmtDateTime, fmtPhone, maskPhoneInput } from '../lib/format';
import { Alert, Badge, Empty, ErrorAlert, ErrorState, Loading, PageHead } from '../components/ui';
import { AddressFields, validateIdentity, type Identity, emptyIdentity } from '../components/IdentityForm';
import { PaymentAccount } from '../components/PaymentAccount';
import { SelectField, TextAreaField, TextField } from '../components/fields';

const DOC_LABEL: Record<string, string> = {
  'termos-de-uso': 'Termos de Uso', 'politica-de-privacidade': 'Política de Privacidade', 'regras-de-anuncio': 'Regras de Anúncio',
  'termo-de-responsabilidade-origem': 'Termo de Responsabilidade de Origem', 'politica-de-taxas': 'Política de Taxas',
};
const REQ_KIND: Record<string, string> = { correct: 'Correção de dados', info: 'Informação sobre meus dados', revoke: 'Revogação de consentimento', delete: 'Eliminação da conta' };
const REQ_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = { open: { label: 'Em andamento', tone: 'warn' }, done: { label: 'Atendido', tone: 'ok' }, denied: { label: 'Não atendido', tone: 'bad' } };
const KYC_LABEL = { none: 'Não enviada', pending: 'Em análise', verified: 'Verificada', rejected: 'Recusada' } as const;

export function Account() {
  usePageTitle('Minha conta');
  const { user } = useApp();
  if (!user) return <Loading />;
  return (
    <div className="narrow stack-l">
      <PageHead title="Minha conta" />
      <DataSection />
      <AddressSection />
      {user.accountType === 'anunciante' && <PaymentSection />}
      <PhoneSection />
      <PrefsSection />
      <PrivacySection />
      {user.role === 'admin' && <p><Link to="/admin">Ir para a administração</Link></p>}
    </div>
  );
}

function DataSection() {
  const { user } = useApp();
  const u = user!;
  return (
    <section className="panel stack" aria-labelledby="dados">
      <h2 id="dados">Meus dados</h2>
      <dl className="attrs">
        <div><dt>Nome</dt><dd>{u.fullName}</dd></div>
        <div><dt>E-mail</dt><dd>{u.email} {u.emailVerified ? <Badge tone="ok">confirmado</Badge> : <Link to="/conta/confirmar">confirmar</Link>}</dd></div>
        <div><dt>Tipo de conta</dt><dd>{u.accountType === 'anunciante' ? 'Anunciante' : 'Comprador'}</dd></div>
        {u.docMasked && <div><dt>{u.docType === 'cnpj' ? 'CNPJ' : 'CPF'}</dt><dd>{u.docMasked}</dd></div>}
        {u.companyName && <div><dt>Razão social</dt><dd>{u.companyName}</dd></div>}
        {u.accountType === 'anunciante' && <div><dt>Verificação de identidade</dt><dd>{KYC_LABEL[u.kycStatus]} · <Link to="/conta/verificacao">{u.kycStatus === 'verified' ? 'ver' : 'abrir'}</Link></dd></div>}
      </dl>
      {u.accountType !== 'anunciante' && <p><Link to="/conta/anunciante" className="btn btn-outline">Quero anunciar (virar anunciante)</Link></p>}
    </section>
  );
}

function PaymentSection() {
  return (
    <section className="panel stack" aria-labelledby="mp">
      <h2 id="mp">Conta Mercado Pago</h2>
      <PaymentAccount />
    </section>
  );
}

function AddressSection() {
  const { user, refresh } = useApp();
  const a = user!.address;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<Identity>({ ...emptyIdentity(), cep: a?.cep ?? '', street: a?.street ?? '', number: a?.number ?? '', complement: a?.complement ?? '', district: a?.district ?? '', city: a?.city ?? '', state: a?.state ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const act = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er = validateIdentity({ ...v, docType: 'cpf', docNumber: '52998224725', birthDate: '1980-01-01' });
    delete er.docNumber; delete er.birthDate; delete er.companyName;
    setErrors(er);
    if (Object.keys(er).length) return;
    if (await act.run(() => api.patch('/me', { address: { cep: v.cep.replace(/\D/g, ''), street: v.street.trim(), number: v.number.trim(), complement: v.complement.trim(), district: v.district.trim(), city: v.city.trim(), state: v.state } }))) {
      await refresh(); setEdit(false); setOk(true);
    }
  };
  return (
    <section className="panel stack" aria-labelledby="end">
      <h2 id="end">Endereço</h2>
      {ok && <Alert tone="ok">Endereço atualizado.</Alert>}
      {!edit ? (
        <>
          {a ? <p>{a.street}, {a.number}{a.complement ? ` — ${a.complement}` : ''}<br />{a.district} · {a.city}/{a.state} · CEP {a.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}</p> : <p className="muted">Nenhum endereço informado. Ele é pedido ao virar anunciante.</p>}
          {a && <button className="btn btn-outline" onClick={() => { setEdit(true); setOk(false); }}>Alterar endereço</button>}
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Alert tone="warn">Se você já está verificado, mudar o endereço exige uma nova verificação de identidade (comprovante de endereço).</Alert>
          <AddressFields v={v} set={(p) => setV({ ...v, ...p })} errors={errors} />
          <ErrorAlert error={act.error} />
          <div className="row wrap"><button className="btn btn-primary" disabled={act.busy}>{act.busy ? 'Salvando…' : 'Salvar endereço'}</button><button type="button" className="btn btn-outline" onClick={() => setEdit(false)}>Cancelar</button></div>
        </form>
      )}
    </section>
  );
}

function PhoneSection() {
  const { user, refresh } = useApp();
  const [phone, setPhone] = useState('');
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  const [changed, setChanged] = useState(false);
  const act = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalizePhoneBR(phone)) { setErr('Telefone inválido. Use DDD + número.'); return; }
    setErr('');
    if (await act.run(() => api.patch('/me', { phone }))) { await refresh(); setEdit(false); setChanged(true); }
  };
  return (
    <section className="panel stack" aria-labelledby="tel">
      <h2 id="tel">Telefone</h2>
      <p>{fmtPhone(user!.phone)} {user!.phoneVerified ? <Badge tone="ok">confirmado</Badge> : <Badge tone="warn">não confirmado</Badge>}</p>
      {changed && <Alert tone="info">Enviamos um código para o novo número. <Link to="/conta/confirmar">Confirmar agora</Link></Alert>}
      {!user!.phoneVerified && !changed && <Link to="/conta/confirmar">Confirmar telefone</Link>}
      {edit ? (
        <form className="stack" onSubmit={submit}>
          <TextField label="Novo telefone" type="tel" value={phone} onChange={(e) => setPhone(maskPhoneInput(e.target.value))} error={err} placeholder="(11) 91234-5678" required />
          <ErrorAlert error={act.error} />
          <div className="row wrap"><button className="btn btn-primary" disabled={act.busy}>Salvar</button><button type="button" className="btn btn-outline" onClick={() => setEdit(false)}>Cancelar</button></div>
        </form>
      ) : <button className="btn btn-outline" onClick={() => { setEdit(true); setChanged(false); }}>Trocar telefone</button>}
    </section>
  );
}

function PrefsSection() {
  const { user, refresh } = useApp();
  const act = useAction();
  const toggle = async (v: boolean) => { if (await act.run(() => api.patch('/me', { marketingOptIn: v }))) await refresh(); };
  return (
    <section className="panel stack" aria-labelledby="pref">
      <h2 id="pref">Preferências</h2>
      <label className="check">
        <input type="checkbox" checked={user!.marketingOptIn} disabled={act.busy} onChange={(e) => toggle(e.target.checked)} />
        <span>Quero receber e-mails promocionais do Vendeu. Avisos da sua conta e de segurança são sempre enviados.</span>
      </label>
      <ErrorAlert error={act.error} />
    </section>
  );
}

function PrivacySection() {
  const nav = useNavigate();
  const { logout, refresh } = useApp();
  const reqs = useAsync(() => api.get<{ id: string; kind: string; status: string; created_at: string; resolved_at: string | null }[]>('/me/lgpd/requests'), []);
  const terms = useAsync(() => api.get<{ doc_key: string; version: string; created_at: string; ip: string }[]>('/me/terms'), []);
  const [kind, setKind] = useState<'correct' | 'info' | 'revoke'>('info');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState('');
  const exp = useAction();
  const create = useAction();
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  const [conf, setConf] = useState('');
  const delAct = useAction();

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const r = await create.run(() => api.post<{ message: string }>('/me/lgpd/requests', { kind, ...(details.trim() ? { details: details.trim() } : {}) }));
    if (r) { setSent(r.message); setDetails(''); reqs.reload(); if (kind === 'revoke') void refresh(); }
  };
  const removeAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (await delAct.run(() => api.post('/me/lgpd/delete-account', { password: pw, confirm: 'ELIMINAR' }))) { setPw(''); await logout(); nav('/', { replace: true }); }
  };
  const delErr = delAct.error instanceof ApiError && delAct.error.code === 'pending_fees' ? 'Você tem taxa de retirada pendente. Pague antes de eliminar a conta.' : delAct.error instanceof ApiError && delAct.error.code === 'orders_in_progress' ? 'Você tem pedido em andamento (compra ou venda). Conclua, cancele ou devolva os pedidos antes de eliminar a conta.' : null;

  return (
    <section className="panel stack-l" aria-labelledby="lgpd">
      <div>
        <h2 id="lgpd">Privacidade (LGPD)</h2>
        <p className="muted">Você controla seus dados. Veja a <Link to="/legal/politica-de-privacidade">Política de Privacidade</Link>. Dúvidas: <a href="mailto:privacidade@vendeu.app">privacidade@vendeu.app</a>.</p>
      </div>

      <div className="stack">
        <h3>Baixar meus dados</h3>
        <p className="small muted">Um arquivo com os dados que temos sobre você (conta, anúncios, mensagens, aceites, pedidos). Limite de 5 downloads por hora.</p>
        <ErrorAlert error={exp.error} />
        <div><button className="btn btn-outline" disabled={exp.busy} onClick={() => exp.run(() => downloadJson('/me/lgpd/export', 'meus-dados-vendeu.json'))}>{exp.busy ? 'Gerando…' : 'Baixar meus dados (JSON)'}</button></div>
      </div>

      <form className="stack" onSubmit={send}>
        <h3>Fazer um pedido</h3>
        <SelectField label="Tipo de pedido" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="info">Quero saber quais dados vocês têm sobre mim</option>
          <option value="correct">Quero corrigir um dado</option>
          <option value="revoke">Quero revogar meu consentimento (e-mails promocionais)</option>
        </SelectField>
        <TextAreaField label="Detalhes (opcional)" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1500} />
        {sent && <Alert tone="ok">{sent}</Alert>}
        <ErrorAlert error={create.error} />
        <div><button className="btn btn-primary" disabled={create.busy}>{create.busy ? 'Enviando…' : 'Enviar pedido'}</button></div>
      </form>

      <div className="stack">
        <h3>Histórico dos meus pedidos</h3>
        {reqs.loading ? <Loading /> : reqs.error ? <ErrorState error={reqs.error} onRetry={reqs.reload} /> : !reqs.data?.length ? <p className="muted small">Nenhum pedido ainda.</p> : (
          <ul className="rows">{reqs.data.map((r) => { const s = REQ_STATUS[r.status] ?? { label: r.status, tone: 'muted' as const }; return (
            <li key={r.id} className="row-card"><div className="row-main"><strong>{REQ_KIND[r.kind] ?? r.kind}</strong><span className="small muted">Pedido em {fmtDateTime(r.created_at)}{r.resolved_at ? ` · resolvido em ${fmtDate(r.resolved_at)}` : ''}</span></div><Badge tone={s.tone}>{s.label}</Badge></li>
          ); })}</ul>
        )}
      </div>

      <div className="stack">
        <h3>Termos que eu aceitei</h3>
        {terms.loading ? <Loading /> : terms.error ? <ErrorState error={terms.error} onRetry={terms.reload} /> : !terms.data?.length ? <Empty icon="📄" title="Nenhum aceite registrado" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Documento</th><th scope="col">Versão</th><th scope="col">Aceito em</th></tr></thead>
            <tbody>{terms.data.map((t, i) => <tr key={i}><td><Link to={`/legal/${t.doc_key}`}>{DOC_LABEL[t.doc_key] ?? t.doc_key}</Link></td><td>{t.version}</td><td>{fmtDateTime(t.created_at)}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>

      <div className="stack danger-zone">
        <h3>Eliminar minha conta</h3>
        <div className="small">
          <p><strong>O que é apagado:</strong> seus dados pessoais (nome, e-mail, telefone, CPF/CNPJ, endereço), os documentos e a selfie da verificação, suas fotos de anúncios, e suas mensagens são substituídas. Seus anúncios ativos saem do ar.</p>
          <p><strong>O que a lei nos obriga a manter:</strong> registros de acesso e de origem (Marco Civil da Internet e prevenção a fraude), os aceites de termos e as declarações de origem assinadas (prova e defesa em processos) e os registros de pedidos, vendas e pagamentos (obrigação fiscal), com acesso restrito e pelo prazo legal.</p>
          <p>Se houver taxa de retirada pendente ou pedido em andamento, resolva antes. Esta ação não pode ser desfeita.</p>
        </div>
        {!del ? <div><button className="btn btn-danger-outline" onClick={() => setDel(true)}>Quero eliminar minha conta</button></div> : (
          <form className="stack" onSubmit={removeAccount}>
            <TextField label="Sua senha" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
            <TextField label='Digite ELIMINAR para confirmar' value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="off" required />
            {delErr ? <Alert tone="bad">{delErr}</Alert> : <ErrorAlert error={delAct.error} />}
            <div className="row wrap"><button className="btn btn-danger" disabled={delAct.busy || conf !== 'ELIMINAR' || !pw}>{delAct.busy ? 'Eliminando…' : 'Eliminar minha conta para sempre'}</button><button type="button" className="btn btn-outline" onClick={() => { setDel(false); setPw(''); setConf(''); }}>Cancelar</button></div>
          </form>
        )}
      </div>
    </section>
  );
}
