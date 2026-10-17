import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Field, Loading, NumberInput, Page, Tabs, Text, Toggle, useAction, useLoad } from '../ui';
import { dmy, hm, waLink } from '../format';

const CH = [['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'E-mail']] as const;

export default function Marketing() {
  const [tab, setTab] = useState<'fidelidade' | 'avisos' | 'google' | 'fila'>('fidelidade');
  const st = useLoad<any>('/settings'); const [s, setS] = useState<any>(null); const [run, busy] = useAction();
  useEffect(() => { if (st.data && !s) setS(st.data.settings); }, [st.data]); // eslint-disable-line
  if (!s) return <Loading error={st.error} />;
  const save = () => run(() => api('/settings', { method: 'PUT', body: s }), 'Configurações salvas.');
  const channels = (key: string) => (<div className="row">{CH.map(([k, l]) => <Toggle key={k} label={l} checked={s.reminders[key][k]} onChange={(v) => setS({ ...s, reminders: { ...s.reminders, [key]: { ...s.reminders[key], [k]: v } } })} />)}</div>);
  return (
    <Page title="Fidelidade e avisos" sub="Cashback, lembretes para o cliente voltar e avisos de veículo pronto">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'fidelidade', label: 'Cashback' }, { key: 'avisos', label: 'Avisos e lembretes' }, { key: 'google', label: 'Google' }, { key: 'fila', label: 'Mensagens enviadas' }]} />
      {tab === 'fidelidade' && (<Card title="Programa de fidelidade">
        <Toggle label="Cashback ligado" checked={s.loyalty.enabled} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, enabled: v } })} />
        <div className="grid g2"><NumberInput label="% de cashback sobre o valor pago" value={s.loyalty.cashbackPercent} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, cashbackPercent: v } })} min={0} max={30} step={0.5} />
          <NumberInput label="Resgate mínimo (centavos)" value={s.loyalty.minRedeemCents} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, minRedeemCents: v } })} min={0} /></div>
        <h3 style={{ marginTop: 10 }}>Cashbacksmart</h3>
        <Toggle label="Adesão ao cashback da Cashbacksmart" hint="Quando ligado, cada cashback gerado fica marcado como 'a sincronizar' para a Cashbacksmart. A conexão com a conta do lava-rápido na Cashbacksmart depende das credenciais dela." checked={s.loyalty.cashbacksmart.enabled} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, cashbacksmart: { ...s.loyalty.cashbacksmart, enabled: v } } })} />
        {s.loyalty.cashbacksmart.enabled && <Text label="Código do estabelecimento na Cashbacksmart" value={s.loyalty.cashbacksmart.merchantId} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, cashbacksmart: { ...s.loyalty.cashbacksmart, merchantId: v } } })} />}
        <button className="primary" disabled={busy} onClick={save}>Salvar</button></Card>)}
      {tab === 'avisos' && (<>
        <Card title="Veículo pronto">{channels('readyNotice')}</Card>
        <Card title="Horário marcado"><NumberInput label="Avisar quantas horas antes" value={s.reminders.appointmentReminderHours} onChange={(v) => setS({ ...s, reminders: { ...s.reminders, appointmentReminderHours: v } })} min={1} max={72} />{channels('appointmentReminder')}</Card>
        <Card title="Confirmação de agendamento">{channels('bookingConfirmation')}</Card>
        <Card title="Lembrar de lavar o carro"><p className="muted small">Só vai para quem autorizou receber ofertas. WhatsApp e SMS saem entre 8h e 21h. Todo aviso tem link para parar de receber.</p>
          <NumberInput label="Lembrar após quantos dias sem lavar" value={s.reminders.washReminderDays} onChange={(v) => setS({ ...s, reminders: { ...s.reminders, washReminderDays: v } })} min={7} max={120} />{channels('washReminder')}</Card>
        <Card title="Textos das mensagens"><p className="muted small">Use: {'{nome} {veiculo} {placa} {lavacar} {data} {hora} {dias} {link}'}. Links digitados à mão são removidos por segurança.</p>
          {([['pronto', 'Veículo pronto'], ['agenda', 'Lembrete de horário'], ['confirmacao', 'Confirmação'], ['lembrete', 'Lembrete de lavagem'], ['avaliacao', 'Pedido de avaliação']] as const).map(([k, l]) => <Field key={k} label={l}><textarea value={s.templates[k]} maxLength={500} onChange={(e) => setS({ ...s, templates: { ...s.templates, [k]: e.target.value } })} /></Field>)}
          <button className="primary" disabled={busy} onClick={save}>Salvar</button></Card>
      </>)}
      {tab === 'google' && (<Card title="Avaliações no Google">
        <p className="muted">Depois de cada entrega, o cliente recebe o pedido de avaliação. Enviamos para todos — o Google proíbe escolher só os clientes satisfeitos.</p>
        <Text label="Place ID do seu lava-rápido no Google" value={s.google.placeId} onChange={(v) => setS({ ...s, google: { ...s.google, placeId: v } })} hint="Encontre em: Google Place ID Finder (developers.google.com/maps/documentation/places/web-service/place-id)." />
        <NumberInput label="Enviar o pedido quantas horas após a entrega" value={s.google.reviewDelayHours} onChange={(v) => setS({ ...s, google: { ...s.google, reviewDelayHours: v } })} min={0} max={72} />{channels('reviewRequest')}
        <button className="primary" disabled={busy} onClick={save}>Salvar</button></Card>)}
      {tab === 'fila' && <Outbox />}
    </Page>
  );
}

function Outbox() {
  const o = useLoad<any[]>('/dashboard/outbox');
  if (!o.data) return <Loading error={o.error} />;
  const tone = (s: string) => (s === 'enviada' ? 'ok' : s === 'falhou' ? 'bad' : s === 'manual' ? 'warn' : undefined);
  return (<Card title="Últimas mensagens"><p className="muted small">"Manual" = ainda sem provedor de WhatsApp/SMS/e-mail conectado: envie pelo botão do seu WhatsApp.</p>
    {o.data.length === 0 ? <p className="muted">Nada enviado ainda.</p> : o.data.map((m) => (<div key={m.id} className="check-row"><div className="row between"><span><Badge>{m.channel}</Badge> {m.topic} → {m.to}</span><Badge tone={tone(m.status) as any}>{m.status}</Badge></div><div className="muted small">{dmy(m.scheduledAt)} {hm(m.scheduledAt.replace('Z', ''))} · {m.body.slice(0, 140)}</div>
      {m.status === 'manual' && m.channel !== 'email' && <a className="btn sm" href={waLink(m.to, m.body)} target="_blank" rel="noreferrer">Enviar no meu WhatsApp</a>}</div>))}</Card>);
}
