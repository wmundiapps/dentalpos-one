import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, shrinkImage, uploadPhoto } from '../api';
import { Card, Chip, Field, Loading, Money, NumberInput, Page, Select, Text, Toggle, useAction, useLoad, useToast } from '../ui';
import Checklist, { type CheckItem } from '../components/Checklist';
import PhotoSlots from '../components/PhotoSlots';
import { CAT_LABEL, CATS, maskCpf, maskPhone, maskPlate, onlyDigits, brl, FREQ_LABEL } from '../format';

const COLORS = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Marrom', 'Bege', 'Laranja', 'Outra'];
const FUEL = ['vazio', '1/4', '1/2', '3/4', 'cheio'];
const BELONGINGS = ['Documentos', 'Estepe', 'Macaco e triângulo', 'Som / multimídia', 'Cadeirinha', 'Óculos', 'Carregador', 'Guarda-chuva', 'Objetos de valor'];
const STEPS = ['Cliente e veículo', 'Serviços', 'Estado do veículo', 'Fotos', 'Conferir'];

export default function Checkin() {
  const nav = useNavigate();
  const toast = useToast();
  const [q] = useSearchParams();
  const [step, setStep] = useState(0);
  const [run, busy] = useAction();
  const vcat = useLoad<{ brands: Record<string, [string, string][]> }>('/public/vehicles');
  const services = useLoad<any[]>('/r/service');
  const checklist = useLoad<CheckItem[]>('/r/checklistItem');
  const plans = useLoad<any[]>('/r/plan');

  const [plate, setPlate] = useState(maskPlate(q.get('plate') ?? ''));
  const [existing, setExisting] = useState<{ customer: any; vehicle: any } | null>(null);
  const [c, setC] = useState({ name: '', whatsapp: '', email: '', cpf: '', consentMarketing: false, cashbackOptIn: true });
  const [v, setV] = useState({ brand: '', model: '', year: '', color: '', categoryKey: '' });
  const [svcIds, setSvcIds] = useState<string[]>([]);
  const [useClub, setUseClub] = useState(false);
  const [sub, setSub] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, string[]>>({});
  const [fuel, setFuel] = useState('1/2');
  const [km, setKm] = useState(0);
  const [belongings, setBelongings] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [agree, setAgree] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [apptId] = useState(q.get('appointmentId') ?? undefined);

  // Busca pela placa: se o veículo já existe, preenche tudo
  useEffect(() => {
    if (plate.length < 7) { setExisting(null); return; }
    let on = true;
    (async () => {
      const vs = await api<any[]>(`/r/vehicle?plate=${plate}`).catch(() => []);
      if (!on || !vs[0]) { setExisting(null); return; }
      const cu = await api<any>(`/r/customer/${vs[0].data.customerId}`).catch(() => null);
      if (!on || !cu) return;
      setExisting({ customer: cu, vehicle: vs[0] });
      const subs = await api<any[]>('/club/subscriptions').catch(() => []);
      setSub(subs.find((s) => s.vehicleId === vs[0].id && s.status === 'ativa') ?? null);
    })();
    return () => { on = false; };
  }, [plate]);

  const models = useMemo(() => (v.brand && vcat.data ? vcat.data.brands[v.brand] ?? [] : []), [v.brand, vcat.data]);
  const category = existing?.vehicle.data.categoryKey ?? v.categoryKey;
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  const chosen = (services.data ?? []).filter((s) => svcIds.includes(s.id));
  const subPlan = sub ? (plans.data ?? []).find((p) => p.id === sub.planId) : null;
  const price = (s: any) => (useClub && subPlan?.data.serviceIds.includes(s.id) ? 0 : s.data.prices[category] ?? 0);
  const total = chosen.reduce((a, s) => a + price(s), 0);

  if (!vcat.data || !services.data || !checklist.data || !plans.data) return <Loading />;

  const infoOk = existing || (c.name.trim().length > 1 && onlyDigits(c.whatsapp).length >= 10 && v.brand && v.model && v.year && category && plate.length === 7);
  const canNext = [!!infoOk, svcIds.length > 0, true, true, agree][step]!;

  const pickModel = (m: string) => { const hit = models.find((x) => x[0] === m); setV({ ...v, model: m, categoryKey: hit?.[1] ?? v.categoryKey }); };

  const submit = async () => {
    const out = await run(async () => {
      let customerId = existing?.customer.id as string, vehicleId = existing?.vehicle.id as string;
      if (!existing) {
        const cu = await api<any>('/r/customer', { body: { name: c.name, whatsapp: onlyDigits(c.whatsapp), email: c.email, cpf: c.cpf, consentMarketing: c.consentMarketing, cashbackOptIn: c.cashbackOptIn } });
        customerId = cu.id;
        const ve = await api<any>('/r/vehicle', { body: { customerId, plate, brand: v.brand, model: v.model, year: Number(v.year), color: v.color, categoryKey: category } });
        vehicleId = ve.id;
      }
      const o = await api<any>('/orders', { body: { customerId, vehicleId, serviceIds: svcIds, appointmentId: apptId, subscriptionId: useClub && sub ? sub.id : undefined, checkin: { checklist: marks, fuel, km: km || undefined, belongings: belongings.join(', '), notes, customerAgrees: true, photoConsent } } });
      // Fotos depois da ordem criada; se alguma falhar, a ordem já existe e dá para reenviar na tela da ordem
      let failed = 0;
      for (const [angle, f] of Object.entries(files)) { if (!f) continue; try { await uploadPhoto(await shrinkImage(f), { orderId: o.id, phase: 'checkin', angle }); } catch { failed++; } }
      if (failed) toast(`Ordem criada, mas ${failed} foto(s) não subiram. Reenvie na ordem.`, true);
      return o;
    }, 'Check-in registrado!');
    if (out) nav(`/os/${out.id}`);
  };

  return (
    <Page title="Novo check-in" sub={STEPS[step]}>
      <div className="steps">{STEPS.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (<>
        <Card title="Placa do veículo">
          <Text label="Placa" value={plate} onChange={(x) => setPlate(maskPlate(x))} placeholder="ABC1D23" autoCapitalize="characters" autoFocus />
          {existing && <div className="alert ok">Cliente encontrado: <b>{existing.customer.data.name}</b> — {existing.vehicle.data.brand} {existing.vehicle.data.model} {existing.vehicle.data.year}{sub && <> · <b>assinante do clube</b></>}</div>}
        </Card>
        {!existing && plate.length === 7 && (<>
          <Card title="Veículo">
            <div className="grid g2">
              <Select label="Marca" value={v.brand} onChange={(b) => setV({ ...v, brand: b, model: '', categoryKey: '' })} options={Object.keys(vcat.data.brands)} />
              <Select label="Modelo" value={v.model} onChange={pickModel} options={models.map((m) => m[0])} placeholder={v.brand ? 'Selecione…' : 'Escolha a marca primeiro'} />
              <Select label="Ano" value={v.year} onChange={(y) => setV({ ...v, year: y })} options={years} />
              <Select label="Cor" value={v.color} onChange={(x) => setV({ ...v, color: x })} options={COLORS} />
            </div>
            <Field label="Categoria (preenchida pelo modelo — toque para mudar)"><div className="chips">{CATS.map((k) => <Chip key={k} on={category === k} onClick={() => setV({ ...v, categoryKey: k })}>{CAT_LABEL[k]}</Chip>)}</div></Field>
          </Card>
          <Card title="Proprietário">
            <div className="grid g2">
              <Text label="Nome completo" value={c.name} onChange={(x) => setC({ ...c, name: x })} autoComplete="off" />
              <Text label="WhatsApp" value={maskPhone(c.whatsapp)} onChange={(x) => setC({ ...c, whatsapp: x })} inputMode="tel" />
              <Text label="E-mail" type="email" value={c.email} onChange={(x) => setC({ ...c, email: x })} />
              <Text label="CPF (para a nota fiscal)" value={maskCpf(c.cpf)} onChange={(x) => setC({ ...c, cpf: x })} inputMode="numeric" />
            </div>
            <Toggle label="Quer receber lembretes e ofertas por WhatsApp, SMS e e-mail" hint="Autorização do cliente (LGPD). Ele pode cancelar quando quiser." checked={c.consentMarketing} onChange={(x) => setC({ ...c, consentMarketing: x })} />
            <Toggle label="Participar do programa de cashback" checked={c.cashbackOptIn} onChange={(x) => setC({ ...c, cashbackOptIn: x })} />
          </Card>
        </>)}
      </>)}

      {step === 1 && (<Card title={`Serviços — ${CAT_LABEL[category] ?? ''}`}>
        {sub && subPlan && <Toggle label={`Usar o clube: ${subPlan.data.name}`} hint={sub.nextWashDate > new Date().toISOString().slice(0, 10) ? `Próxima lavagem liberada em ${sub.nextWashDate.split('-').reverse().join('/')}` : FREQ_LABEL[subPlan.data.frequency]} checked={useClub} onChange={(x) => { setUseClub(x); if (x) setSvcIds((ids) => Array.from(new Set([...ids, ...subPlan.data.serviceIds]))); }} />}
        <div className="chips" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {services.data.filter((s) => s.data.active !== false).map((s) => (
            <Chip key={s.id} on={svcIds.includes(s.id)} onClick={() => setSvcIds(svcIds.includes(s.id) ? svcIds.filter((x) => x !== s.id) : [...svcIds, s.id])}>
              <span className="grow" style={{ textAlign: 'left' }}>{s.data.name}</span><b>{price(s) === 0 && useClub ? 'clube' : brl(price(s))}</b>
            </Chip>
          ))}
        </div>
        <h2 style={{ marginTop: 14 }}>Total: <Money cents={total} /></h2>
      </Card>)}

      {step === 2 && (<>
        <p className="muted">Toque nas opções para marcar com ✕. O cliente confere na tela.</p>
        <Checklist items={checklist.data} value={marks} onChange={setMarks} />
        <Card title="Combustível, quilometragem e pertences">
          <Field label="Combustível"><div className="chips">{FUEL.map((f) => <Chip key={f} on={fuel === f} onClick={() => setFuel(f)}>{f}</Chip>)}</div></Field>
          <NumberInput label="Quilometragem (km)" value={km} onChange={setKm} min={0} />
          <Field label="Pertences no veículo"><div className="chips">{BELONGINGS.map((b) => <Chip key={b} on={belongings.includes(b)} onClick={() => setBelongings(belongings.includes(b) ? belongings.filter((x) => x !== b) : [...belongings, b])}>{b}</Chip>)}</div></Field>
          <Field label="Observações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} /></Field>
        </Card>
      </>)}

      {step === 3 && (<Card title="Fotos de entrada"><p className="muted">Tire as fotos nos ângulos principais. Elas protegem você e o cliente. Pode pular e enviar depois.</p><PhotoSlots files={files} onChange={setFiles} /></Card>)}

      {step === 4 && (<>
        <Card title="Resumo">
          <p><b>{plate}</b> · {existing ? `${existing.vehicle.data.brand} ${existing.vehicle.data.model}` : `${v.brand} ${v.model} ${v.year}`} · {CAT_LABEL[category]}</p>
          <p>Cliente: <b>{existing?.customer.data.name ?? c.name}</b></p>
          <p>Serviços: {chosen.map((s) => s.data.name).join(', ')}</p>
          <p>Marcações de dano: {Object.entries(marks).filter(([, s]) => s.some((x) => x !== 'ok' && x !== 'sujo')).length} item(ns) · Fotos: {Object.values(files).filter(Boolean).length}</p>
          <h2>Total: <Money cents={total} /></h2>
        </Card>
        <Card>
          <Toggle label="O cliente conferiu e concorda com o estado do veículo registrado acima." checked={agree} onChange={setAgree} />
          <Toggle label="O cliente autoriza usar as fotos no antes e depois do lava-rápido (opcional)" hint="Só publicamos com a placa coberta." checked={photoConsent} onChange={setPhotoConsent} />
        </Card>
      </>)}

      <div className="sticky-actions">
        <button onClick={() => (step === 0 ? nav('/patio') : setStep(step - 1))}>{step === 0 ? 'Cancelar' : '← Voltar'}</button>
        {step < 4 ? <button className="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar →</button> : <button className="primary" disabled={!canNext || busy} onClick={submit}>{busy ? 'Salvando…' : '✓ Registrar check-in'}</button>}
      </div>
    </Page>
  );
}
