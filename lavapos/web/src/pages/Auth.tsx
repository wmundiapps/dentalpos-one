import { useState } from 'react';
import { api, ApiError, setToken } from '../api';
import { Field, Text, useAction } from '../ui';
import { maskPhone } from '../format';

export default function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(new URLSearchParams(location.search).has('cadastro') ? 'register' : 'login');
  const [f, setF] = useState({ lavacarName: '', ownerName: '', email: '', phone: '', password: '', cnpj: '' });
  const [accept, setAccept] = useState(false);
  const [website, setWebsite] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [code, setCode] = useState('');
  const [run, busy] = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(async () => {
      try { return mode === 'login' ? await api<{ token: string }>('/auth/login', { body: { email: f.email, password: f.password, code: need2fa ? code : undefined } }) : await api<{ token: string }>('/auth/register', { body: { ...f, acceptTerms: accept, website } }); }
      catch (err) { if (err instanceof ApiError && err.code === 'precisa_2fa') { setNeed2fa(true); return undefined; } throw err; }
    });
    if (r) { setToken(r.token); onDone(); }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <div className="row"><img src="/logo.svg" width={44} height={44} alt="" /><div><h1>LavaPos</h1><div className="muted">Gestão completa para lava-rápidos</div></div></div>
        <h2 style={{ marginTop: 16 }}>{mode === 'login' ? 'Entrar' : 'Teste grátis por 30 dias'}</h2>
        {mode === 'register' && (<>
          <p className="muted">Sem cartão de crédito. Depois dos 30 dias: R$ 119,00 por mês.</p>
          <Text label="Nome do lava-rápido" value={f.lavacarName} onChange={set('lavacarName')} required autoComplete="organization" />
          <Text label="Seu nome" value={f.ownerName} onChange={set('ownerName')} required autoComplete="name" />
          <Text label="WhatsApp" value={maskPhone(f.phone)} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
          <Text label="CNPJ (opcional agora)" value={f.cnpj} onChange={set('cnpj')} inputMode="numeric" />
          <div aria-hidden style={{ position: 'absolute', left: -9999 }}><input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
        </>)}
        <Text label="E-mail" type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        <Field label="Senha" hint={mode === 'register' ? 'Mínimo 10 caracteres, com letras e números.' : undefined}>
          <input type="password" value={f.password} onChange={(e) => set('password')(e.target.value)} required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        {need2fa && <Text label="Código do aplicativo autenticador (6 dígitos)" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus />}
        {mode === 'register' && (
          <label className="row" style={{ alignItems: 'flex-start', margin: '6px 0 12px' }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
            <span className="small">Li e aceito o <a href="/legal/contrato" target="_blank" rel="noreferrer">Contrato de Uso</a>, a <a href="/legal/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a> e o <a href="/legal/lgpd" target="_blank" rel="noreferrer">Adendo de Proteção de Dados</a>.</span>
          </label>
        )}
        <button className="primary" style={{ width: '100%' }} disabled={busy || (mode === 'register' && !accept)}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}</button>
        <p className="small" style={{ textAlign: 'center', marginTop: 14 }}>
          {mode === 'login' ? <>Ainda não tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); }}>Teste grátis por 30 dias</a></> : <>Já tem conta? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>Entrar</a></>}
        </p>
      </form>
    </div>
  );
}
