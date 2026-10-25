import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { normalizePhoneBR } from '@shared/documents';
import { maskPhoneInput, passwordStrength } from '../lib/format';
import { Alert, ErrorAlert, Loading, PageHead } from '../components/ui';
import { TextField } from '../components/fields';
import { emptyIdentity, IdentityFields, identityPayload, validateIdentity, type Identity } from '../components/IdentityForm';

const safeBack = (v: string | null, fallback: string) => (v && v.startsWith('/') && !v.startsWith('//') ? v : fallback);

function PasswordField({ value, onChange, label = 'Senha', error, autoComplete = 'new-password', meter }: { value: string; onChange: (v: string) => void; label?: string; error?: string; autoComplete?: string; meter?: boolean }) {
  const [show, setShow] = useState(false);
  const st = passwordStrength(value);
  return (
    <div>
      <TextField label={label} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} error={error} maxLength={100} required
        hint={meter ? 'Mínimo de 8 caracteres, com letras e números.' : undefined} />
      <label className="check small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha</label>
      {meter && value && (
        <div className="meter" aria-live="polite">
          <div className="meter-bar" aria-hidden="true"><span className={`lvl-${st.score}`} style={{ width: `${Math.max(1, st.score) * 25}%` }} /></div>
          <span className="small">Força da senha: {st.label}</span>
        </div>
      )}
    </div>
  );
}

export function Login() {
  usePageTitle('Entrar');
  const { user, refresh } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const back = safeBack(sp.get('volta'), '/');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const act = useAction();
  if (user) return <Navigate to={back === '/' ? '/venda' : back} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await act.run(() => api.post('/auth/login', { email: email.trim(), password }));
    if (r) { await refresh(); nav(back === '/' ? '/venda' : back, { replace: true }); }
  };
  return (
    <form className="auth-card stack" onSubmit={submit}>
      <h1>Entrar</h1>
      <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
      <ErrorAlert error={act.error} />
      <button className="btn btn-primary btn-lg" disabled={act.busy}>{act.busy ? 'Entrando…' : 'Entrar'}</button>
      <p className="small"><Link to="/recuperar">Esqueci a senha</Link> · Não tem conta? <Link to="/cadastrar">Cadastrar</Link></p>
    </form>
  );
}

export function Recover() {
  usePageTitle('Recuperar senha');
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const act = useAction();
  const send = async (e: FormEvent) => { e.preventDefault(); if (await act.run(() => api.post('/auth/forgot', { email: email.trim() }))) setStep(2); };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (await act.run(() => api.post('/auth/reset', { email: email.trim(), code, password }))) setStep(3);
  };
  if (step === 3) {
    return (
      <div className="auth-card stack">
        <h1>Senha alterada</h1>
        <Alert tone="ok">Pronto! Agora entre com a nova senha.</Alert>
        <button className="btn btn-primary btn-lg" onClick={() => nav('/entrar')}>Ir para o login</button>
      </div>
    );
  }
  return step === 1 ? (
    <form className="auth-card stack" onSubmit={send}>
      <h1>Esqueci a senha</h1>
      <p className="muted">Informe seu e-mail. Se ele tiver cadastro, enviaremos um código de 6 dígitos.</p>
      <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <ErrorAlert error={act.error} />
      <button className="btn btn-primary btn-lg" disabled={act.busy}>{act.busy ? 'Enviando…' : 'Enviar código'}</button>
      <p className="small"><Link to="/entrar">Voltar ao login</Link></p>
    </form>
  ) : (
    <form className="auth-card stack" onSubmit={reset}>
      <h1>Nova senha</h1>
      <Alert tone="info">Se o e-mail <strong>{email}</strong> tiver cadastro, o código chegou na caixa de entrada (confira o spam). Vale por 10 minutos.</Alert>
      <TextField label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required />
      <PasswordField label="Nova senha" value={password} onChange={setPassword} meter />
      <ErrorAlert error={act.error} />
      <button className="btn btn-primary btn-lg" disabled={act.busy || code.length !== 6}>{act.busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Pedir outro código</button>
    </form>
  );
}

interface LegalIdx { documents: { key: string; title: string; version: string }[] }

export function Register() {
  usePageTitle('Cadastrar');
  const { user, refresh } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const track = sp.get('tipo') === 'anunciante' ? 'anunciante' : sp.get('tipo') === 'comprador' ? 'comprador' : null;
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [idt, setIdt] = useState<Identity>(emptyIdentity());
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);
  const legal = useAsync(() => api.get<LegalIdx>('/legal'), []);
  const act = useAction();

  if (user && !created) return <Navigate to="/venda" replace />;
  if (!track) {
    return (
      <div className="auth-wide stack-l">
        <PageHead title="Criar conta" sub="Escolha o que você quer fazer. Você pode mudar depois." />
        <div className="track-cards">
          <button className="track" onClick={() => setSp({ tipo: 'comprador' })}>
            <span aria-hidden="true">🛒</span><strong>Quero comprar</strong><span className="muted">Cadastro rápido: nome, e-mail, telefone e senha.</span>
          </button>
          <button className="track" onClick={() => setSp({ tipo: 'anunciante' })}>
            <span aria-hidden="true">🏷️</span><strong>Quero anunciar</strong><span className="muted">Anunciar não custa nada. Pede CPF/CNPJ e endereço para proteger todo mundo.</span>
          </button>
        </div>
        <p className="small">Já tem conta? <Link to="/entrar">Entrar</Link></p>
      </div>
    );
  }
  const seller = track === 'anunciante';
  const version = (k: string) => legal.data?.documents.find((d) => d.key === k)?.version;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.fullName.trim().split(/\s+/).length < 2 || f.fullName.trim().length < 5) er.fullName = 'Informe nome e sobrenome.';
    if (!normalizePhoneBR(f.phone)) er.phone = 'Telefone inválido. Use DDD + número.';
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) er.password = 'A senha precisa ter 8+ caracteres, com letras e números.';
    if (seller) Object.assign(er, validateIdentity(idt));
    setErrors(er);
    if (Object.keys(er).length) { document.getElementById('form-top')?.scrollIntoView(); return; }
    const vt = version('termos-de-uso'), vp = version('politica-de-privacidade');
    if (!vt || !vp) return;
    const r = await act.run(() => api.post('/auth/register', {
      fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone, password: f.password, accountType: track,
      ...(seller ? { identity: identityPayload(idt) } : {}),
      accepted: { 'termos-de-uso': vt, 'politica-de-privacidade': vp }, marketingOptIn: marketing,
    }));
    if (r) { setCreated(true); await refresh(); nav(`/conta/confirmar?novo=1${seller ? '&kyc=1' : ''}`, { replace: true }); }
  };

  return (
    <form className="auth-wide stack-l" onSubmit={submit} noValidate id="form-top">
      <PageHead title={seller ? 'Cadastro de anunciante' : 'Cadastro de comprador'} sub={<>Anunciar não custa nada. A comissão só existe quando a venda se concluir. <button type="button" className="linklike" onClick={() => setSp({ tipo: seller ? 'comprador' : 'anunciante' })}>{seller ? 'Só quero comprar' : 'Quero anunciar também'}</button></>} />
      <fieldset className="fieldset">
        <legend>Seus dados</legend>
        <div className="form-grid">
          <TextField label="Nome completo" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="name" error={errors.fullName} maxLength={120} required
            hint={seller ? 'Igual ao do documento. Você vai assinar a declaração de origem com este nome.' : undefined} />
          <TextField label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required />
          <TextField label="Telefone (WhatsApp ou celular)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhoneInput(e.target.value) })} autoComplete="tel-national" placeholder="(11) 91234-5678" error={errors.phone} required />
          <PasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} error={errors.password} meter />
        </div>
      </fieldset>
      {seller && <IdentityFields v={idt} set={(p) => setIdt({ ...idt, ...p })} errors={errors} />}
      <fieldset className="fieldset">
        <legend>Termos</legend>
        {legal.loading ? <Loading label="Carregando termos…" /> : legal.error ? <Alert tone="bad">Não foi possível carregar a versão atual dos termos. Recarregue a página.</Alert> : (
          <label className="check">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
            <span>Li e aceito os <Link to="/legal/termos-de-uso" target="_blank">Termos de Uso</Link> (versão {version('termos-de-uso')}) e a <Link to="/legal/politica-de-privacidade" target="_blank">Política de Privacidade</Link> (versão {version('politica-de-privacidade')}).</span>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Quero receber e-mails promocionais do Vendeu (opcional). Posso cancelar quando quiser.</span>
        </label>
      </fieldset>
      <ErrorAlert error={act.error} />
      <div className="row wrap">
        <button className="btn btn-primary btn-lg" disabled={act.busy || !terms || !legal.data}>{act.busy ? 'Criando conta…' : 'Criar minha conta'}</button>
        <Link to="/entrar" className="btn btn-ghost">Já tenho conta</Link>
      </div>
    </form>
  );
}

function CodeCard({ channel, done, target }: { channel: 'email' | 'phone'; done: boolean; target: string }) {
  const { refresh } = useApp();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const act = useAction();
  const resend = useAction();
  const label = channel === 'email' ? 'E-mail' : 'Telefone';
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (await act.run(() => api.post(`/auth/verify-${channel}`, { code }))) { setCode(''); await refresh(); }
  };
  return (
    <section className={`panel stack${done ? ' panel-ok' : ''}`} aria-labelledby={`v-${channel}`}>
      <h2 id={`v-${channel}`}>{done ? '✔' : '○'} {label} {done ? 'confirmado' : 'pendente'}</h2>
      <p className="muted small">{target}</p>
      {!done && (
        <form className="stack" onSubmit={verify}>
          <TextField label={`Código de 6 dígitos enviado por ${channel === 'email' ? 'e-mail' : 'SMS'}`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" placeholder="000000" />
          <ErrorAlert error={act.error} />
          {sent && <Alert tone="ok">Novo código enviado.</Alert>}
          <ErrorAlert error={resend.error} />
          <div className="row wrap">
            <button className="btn btn-primary" disabled={act.busy || code.length !== 6}>{act.busy ? 'Confirmando…' : 'Confirmar'}</button>
            <button type="button" className="btn btn-outline" disabled={resend.busy} onClick={async () => { if (await resend.run(() => api.post('/auth/resend', { channel }))) setSent(true); }}>Reenviar código</button>
          </div>
          <p className="small muted">Nunca compartilhe este código com ninguém. O Vendeu não pede códigos por mensagem.</p>
        </form>
      )}
    </section>
  );
}

export function VerifyContacts() {
  usePageTitle('Confirmar e-mail e telefone');
  const { user } = useApp();
  const [sp] = useSearchParams();
  if (!user) return <Loading />;
  const all = user.emailVerified && user.phoneVerified;
  const seller = user.accountType === 'anunciante';
  return (
    <div className="narrow stack-l">
      <PageHead title={sp.get('novo') ? 'Conta criada! Confirme seus contatos' : 'Confirmar e-mail e telefone'} sub="Enviamos um código de 6 dígitos para cada um. Isso garante que você é você e protege sua conta." />
      <CodeCard channel="email" done={user.emailVerified} target={user.email} />
      <CodeCard channel="phone" done={user.phoneVerified} target={`+55 ${maskPhoneInput(user.phone.replace(/^55/, ''))}`} />
      {all && (
        <Alert tone="ok" title="Tudo confirmado!">
          {seller ? (user.kycStatus === 'verified' ? 'Sua identidade já foi verificada.' : 'Próximo passo: verificar sua identidade para poder publicar anúncios.') : 'Agora você já pode conversar com vendedores.'}
        </Alert>
      )}
      <div className="row wrap">
        {all && seller && user.kycStatus !== 'verified' && <Link to="/conta/verificacao" className="btn btn-primary btn-lg">Verificar minha identidade</Link>}
        {all && !seller && <Link to="/compra" className="btn btn-primary btn-lg">Ver anúncios</Link>}
        {all && !seller && <Link to="/conta/anunciante" className="btn btn-outline btn-lg">Quero anunciar</Link>}
        {!all && <Link to="/compra" className="btn btn-ghost">Fazer isso depois</Link>}
      </div>
    </div>
  );
}

export function BecomeSeller() {
  usePageTitle('Virar anunciante');
  const { user, refresh } = useApp();
  const nav = useNavigate();
  const [idt, setIdt] = useState<Identity>(emptyIdentity());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const act = useAction();
  if (!user) return <Loading />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er = validateIdentity(idt);
    setErrors(er);
    if (Object.keys(er).length) return;
    if (await act.run(() => api.post('/me/become-seller', identityPayload(idt)))) { await refresh(); nav('/conta/verificacao', { replace: true }); }
  };
  return (
    <form className="auth-wide stack-l" onSubmit={submit} noValidate>
      <PageHead title="Virar anunciante" sub="Informe seu CPF ou CNPJ e seu endereço. Anunciar não custa nada. A comissão só existe quando a venda se concluir." />
      {user.accountType === 'anunciante' && <Alert tone="info">Você já é anunciante. Se salvar de novo, os dados serão atualizados e a verificação de identidade pode ser pedida de novo.</Alert>}
      <IdentityFields v={idt} set={(p) => setIdt({ ...idt, ...p })} errors={errors} />
      <ErrorAlert error={act.error} />
      <div className="row wrap"><button className="btn btn-primary btn-lg" disabled={act.busy}>{act.busy ? 'Salvando…' : 'Salvar e continuar'}</button><Link to="/venda" className="btn btn-ghost">Cancelar</Link></div>
    </form>
  );
}
