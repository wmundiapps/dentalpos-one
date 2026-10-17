import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, setToken } from '../api';
import { Card, Chip, Field, Loading, NumberInput, Page, Select, Tabs, Text, Toggle, useAction, useLoad, useToast } from '../ui';
import { useMe } from '../App';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function Settings() {
  const { me, logout } = useMe();
  const st = useLoad<any>('/settings'); const [s, setS] = useState<any>(null); const [run, busy] = useAction(); const toast = useToast();
  const [tab, setTab] = useState<'funcionamento' | 'pagamentos' | 'equipe' | 'conta'>('funcionamento');
  useEffect(() => { if (st.data && !s) setS(st.data.settings); }, [st.data]); // eslint-disable-line
  if (!s) return <Loading error={st.error} />;
  const owner = me.user.role === 'owner';
  const save = () => run(() => api('/settings', { method: 'PUT', body: s }), 'Salvo.');
  const link = `${location.origin}/l/${st.data.slug}`;
  return (
    <Page title="Configurações" sub={me.tenant?.name}>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'funcionamento', label: 'Funcionamento' }, { key: 'pagamentos', label: 'Pagamentos e nota' }, { key: 'equipe', label: 'Equipe' }, { key: 'conta', label: 'Conta e dados' }]} />
      {tab === 'funcionamento' && (<>
        <Card title="Dias e horários de funcionamento">
          {s.hours.map((h: any, i: number) => (<div key={i} className="row check-row"><div style={{ width: 90 }}><b>{DAYS[i]}</b></div><Chip on={!h.closed} tone="ok" onClick={() => setS({ ...s, hours: s.hours.map((x: any, k: number) => (k === i ? { ...x, closed: !x.closed } : x)) })}>{h.closed ? 'Fechado' : 'Aberto'}</Chip>
            {!h.closed && <><select style={{ width: 100 }} value={h.open} onChange={(e) => setS({ ...s, hours: s.hours.map((x: any, k: number) => (k === i ? { ...x, open: e.target.value } : x)) })}>{HOURS.map((x) => <option key={x}>{x}</option>)}</select>às<select style={{ width: 100 }} value={h.close} onChange={(e) => setS({ ...s, hours: s.hours.map((x: any, k: number) => (k === i ? { ...x, close: e.target.value } : x)) })}>{HOURS.map((x) => <option key={x}>{x}</option>)}</select></>}</div>))}
          <div className="grid g2" style={{ marginTop: 10 }}><NumberInput label="Boxes de lavagem (carros ao mesmo tempo)" value={s.bays} onChange={(v) => setS({ ...s, bays: v })} min={1} max={40} /><Select label="Intervalo da agenda" value={String(s.slotMinutes)} onChange={(v) => setS({ ...s, slotMinutes: Number(v) })} options={['15', '20', '30', '45', '60'].map((v) => ({ value: v, label: `${v} minutos` }))} /></div>
        </Card>
        <Card title="Agendamento online"><Toggle label="Clientes podem agendar pelo link" checked={s.publicBooking.enabled} onChange={(v) => setS({ ...s, publicBooking: { ...s.publicBooking, enabled: v } })} />
          <p className="small">Seu link: <b>{link}</b> <button className="sm" onClick={() => navigator.clipboard?.writeText(link)}>Copiar</button></p>
          <Text label="Mensagem na página" value={s.publicBooking.message} onChange={(v) => setS({ ...s, publicBooking: { ...s.publicBooking, message: v } })} />
          <div className="grid g2"><NumberInput label="Antecedência mínima (horas)" value={s.publicBooking.minNoticeHours} onChange={(v) => setS({ ...s, publicBooking: { ...s.publicBooking, minNoticeHours: v } })} min={0} /><NumberInput label="Agenda aberta por quantos dias" value={s.publicBooking.maxDaysAhead} onChange={(v) => setS({ ...s, publicBooking: { ...s.publicBooking, maxDaysAhead: v } })} min={1} max={120} /></div></Card>
        {owner && <button className="primary" disabled={busy} onClick={save}>Salvar</button>}
      </>)}

      {tab === 'pagamentos' && <Pay s={s} setS={setS} connected={st.data.asaasConnected} save={save} reload={st.reload} busy={busy} owner={owner} />}

      {tab === 'equipe' && owner && <Team />}

      {tab === 'conta' && (<>
        <PasswordCard />
        <TwoFactor />
        <Card title="Seus dados (LGPD)"><p className="muted">Baixe uma cópia de todos os dados do lava-rápido, ou peça o encerramento da conta. Os dados ficam 30 dias para você exportar e depois são anonimizados.</p>
          <div className="row"><button onClick={async () => { const j = await run(() => api('/settings/export')); if (j) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' })); a.download = 'lavapos-dados.json'; a.click(); } }}>⬇ Exportar meus dados</button>
            {owner && <button className="danger" onClick={async () => { if (prompt('Para encerrar a conta, digite ENCERRAR:') === 'ENCERRAR') { await run(() => api('/settings/close-account', { body: { confirm: 'ENCERRAR' } })); toast('Conta encerrada.'); logout(); } }}>Encerrar minha conta</button>}</div></Card>
        <Card title="Documentos"><p><a href="/legal/contrato" target="_blank" rel="noreferrer">Contrato de uso</a> · <a href="/legal/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a> · <a href="/legal/lgpd" target="_blank" rel="noreferrer">Adendo LGPD</a> · <a href="/legal/clube" target="_blank" rel="noreferrer">Termo do clube (cliente final)</a> · <a href="/legal/checkin" target="_blank" rel="noreferrer">Termo de check-in</a></p><p className="muted small">Versão aceita: {st.data.termsVersion}</p></Card>
      </>)}
    </Page>
  );
}

function Pay({ s, setS, connected, save, reload, busy, owner }: any) {
  const [key, setKey] = useState(''); const [run, b2] = useAction();
  return (<>
    <Card title="Cobrança online com Asaas (Pix, cartão, boleto)">
      <p className="muted">Conecte a sua conta Asaas para gerar Pix, cartão e boleto direto na entrega e cobrar o clube. A comissão de 10% da plataforma é dividida automaticamente no pagamento — o restante cai direto na sua conta.</p>
      {connected ? <div className="alert ok">✓ Conta Asaas conectada.</div> : <div className="alert warn">Ainda não conectada.</div>}
      {owner && (<><Toggle label="Usar ambiente de testes (sandbox)" checked={s.asaas.sandbox} onChange={(v) => setS({ ...s, asaas: { ...s.asaas, sandbox: v } })} />
        <Field label="Chave de API do Asaas" hint="Cole aqui — ela é guardada criptografada e nunca volta para a tela. Nunca envie por WhatsApp ou e-mail."><input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="$aact_..." /></Field>
        <button className="primary" disabled={key.length < 20 || b2} onClick={async () => { const r = await run(() => api('/settings/asaas', { method: 'PUT', body: { apiKey: key, sandbox: s.asaas.sandbox } }), 'Asaas conectado!'); if (r) { setKey(''); await reload(); } }}>Conectar</button></>)}
    </Card>
    <Card title="Nota fiscal e impostos"><Toggle label="Preparar a nota fiscal automaticamente a cada entrega" checked={s.invoice.autoIssue} onChange={(v) => setS({ ...s, invoice: { ...s.invoice, autoIssue: v } })} />
      <div className="grid g2"><Text label="Código do serviço (NFS-e)" value={s.invoice.serviceCode} onChange={(v) => setS({ ...s, invoice: { ...s.invoice, serviceCode: v } })} /><Text label="Inscrição municipal" value={s.invoice.municipalRegistration} onChange={(v) => setS({ ...s, invoice: { ...s.invoice, municipalRegistration: v } })} />
        <NumberInput label="Impostos sobre o faturamento (%)" value={s.pricing.taxPct} onChange={(v) => setS({ ...s, pricing: { ...s.pricing, taxPct: v } })} min={0} max={40} step={0.5} /><NumberInput label="Taxa média de cartão (%)" value={s.pricing.cardFeePct} onChange={(v) => setS({ ...s, pricing: { ...s.pricing, cardFeePct: v } })} min={0} max={10} step={0.1} /></div>
      <MoneyTarget s={s} setS={setS} />{owner && <button className="primary" disabled={busy} onClick={save}>Salvar</button>}</Card></>);
}

function MoneyTarget({ s, setS }: any) { return <NumberInput label="Meta de lucro mensal (R$)" value={s.pricing.targetProfitCents / 100} onChange={(v) => setS({ ...s, pricing: { ...s.pricing, targetProfitCents: Math.round(v * 100) } })} min={0} step={100} />; }

function Team() {
  const t = useLoad<any[]>('/settings/team'); const [f, setF] = useState({ name: '', email: '', password: '' }); const [run, busy] = useAction();
  return (<Card title="Funcionários com acesso"><p className="muted">Funcionário opera o dia a dia (check-in, pátio, agenda). Só o dono altera configurações, preços e dados financeiros sensíveis.</p>
    {t.data?.map((u) => <div key={u.id} className="row between check-row"><span>{u.name} · {u.email}</span><span className="badge">{u.role === 'owner' ? 'dono' : 'funcionário'}</span></div>)}
    <h3 style={{ marginTop: 12 }}>Adicionar funcionário</h3>
    <div className="grid g3"><Text label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><Text label="E-mail" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} /><Field label="Senha inicial"><input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field></div>
    <button className="primary" disabled={busy || !f.name || !f.email || f.password.length < 10} onClick={async () => { const r = await run(() => api('/settings/team', { body: f }), 'Funcionário criado.'); if (r) { setF({ name: '', email: '', password: '' }); await t.reload(); } }}>Criar acesso</button></Card>);
}

function PasswordCard() {
  const [f, setF] = useState({ current: '', next: '' }); const [run, busy] = useAction();
  return (<Card title="Trocar senha"><div className="grid g2"><Field label="Senha atual"><input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field><Field label="Nova senha (10+ caracteres, letras e números)"><input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field></div>
    <button disabled={busy || !f.current || f.next.length < 10} onClick={async () => { const r = await run(() => api<{ token: string }>('/auth/change-password', { body: f }), 'Senha trocada. Outros aparelhos foram desconectados.'); if (r) { setToken(r.token); setF({ current: '', next: '' }); } }}>Trocar senha</button></Card>);
}

function TwoFactor() {
  const st = useLoad<{ enabled: boolean }>('/auth/2fa'); const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState(''); const [pw, setPw] = useState(''); const [run, busy] = useAction();
  if (!st.data) return null;
  return (<Card title="Verificação em 2 etapas">
    <p className="muted">Mesmo que alguém descubra sua senha, não entra sem o código do aplicativo autenticador (Google Authenticator, Authy, 1Password…). Recomendamos ligar, principalmente para o dono.</p>
    {st.data.enabled ? (<>
      <div className="alert ok">✓ Ligada.</div>
      <div className="grid g2"><Field label="Sua senha"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field><Text label="Código atual do aplicativo" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" /></div>
      <button className="danger" disabled={busy || !pw || code.length !== 6} onClick={async () => { const r = await run(() => api('/auth/2fa/disable', { body: { password: pw, code } }), 'Desligada.'); if (r) { setPw(''); setCode(''); await st.reload(); } }}>Desligar</button></>
    ) : setup ? (<>
      <p>1) No aplicativo autenticador, escaneie o QR (ou digite a chave). 2) Digite o código de 6 dígitos que ele mostrar.</p>
      <img src={setup.qr} alt="QR code para o aplicativo autenticador" width={200} height={200} />
      <p className="small">Chave manual: <b style={{ letterSpacing: 2 }}>{setup.secret}</b></p>
      <Text label="Código de 6 dígitos" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
      <button className="primary" disabled={busy || code.length !== 6} onClick={async () => { const r = await run(() => api('/auth/2fa/enable', { body: { code } }), 'Verificação em 2 etapas ligada!'); if (r) { setSetup(null); setCode(''); await st.reload(); } }}>Ligar</button></>
    ) : <button className="primary" disabled={busy} onClick={async () => { const r = await run(() => api<{ secret: string; otpauth: string }>('/auth/2fa/setup', { body: {} })); if (r) setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauth, { margin: 1, width: 400 }) }); }}>Ligar verificação em 2 etapas</button>}
  </Card>);
}
