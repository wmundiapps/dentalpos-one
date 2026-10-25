import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, blockReasonLabel, errorMessage } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, useDebounced, usePageTitle } from '../lib/hooks';
import { CATEGORIES, CONDITION_LABEL, CONDITIONS, MAX_PHOTOS, MIN_PHOTOS, OPERATION_LABEL, OPERATIONS, ORIGIN_KINDS, REGISTERED_ASSET, type CategorySlug, type Condition, type Operation } from '@shared/catalog';
import { calcFeeCents, formatBRL } from '@shared/fees';
import { ATTR_DEFS } from '../lib/attrs';
import { centsToMasked, moneyToCents, STATES } from '../lib/format';
import { Alert, ErrorAlert, ErrorState, Loading, PageHead, SafetyBox } from '../components/ui';
import { MoneyField, SelectField, TextAreaField, TextField } from '../components/fields';
import { PaymentAccount } from '../components/PaymentAccount';

interface Detail {
  id: string; title: string; description: string; priceCents: number; rentPeriod: 'dia' | 'semana' | 'mes' | null; operation: Operation; condition: Condition;
  category: CategorySlug; city: string; state: string; district: string | null; attributes: Record<string, string | number>; status: string;
  photos: { id: string; url: string }[]; isOwner: boolean; addressPrivate?: string | null; reviewNote?: string | null; removedReason?: string | null;
}
interface Form {
  operation: Operation; category: CategorySlug | ''; condition: Condition | ''; title: string; description: string; price: string; rentPeriod: '' | 'dia' | 'semana' | 'mes';
  city: string; state: string; district: string; addressPrivate: string; attrs: Record<string, string>;
}
const emptyForm = (): Form => ({ operation: 'venda', category: '', condition: '', title: '', description: '', price: '', rentPeriod: '', city: '', state: '', district: '', addressPrivate: '', attrs: {} });
const DRAFT_KEY = 'vendeu.draft.novo';
const LOCKED = ['active', 'paused', 'pending_review'];

function formErrors(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.category) e.category = 'Escolha a categoria.';
  if (!f.condition) e.condition = 'Informe se é novo ou usado.';
  if (f.title.trim().length < 8) e.title = 'Título muito curto (mínimo 8 caracteres).';
  if (f.description.trim().length < 30) e.description = 'Descreva melhor o produto (mínimo 30 caracteres).';
  if (moneyToCents(f.price) < 100) e.price = 'Informe o preço (mínimo R$ 1,00).';
  if (f.operation === 'locacao' && !f.rentPeriod) e.rentPeriod = 'Informe o período do aluguel.';
  if (f.city.trim().length < 2) e.city = 'Informe a cidade.';
  if (!f.state) e.state = 'Escolha o estado.';
  return e;
}

function toPayload(f: Form, locked: boolean) {
  const attributes: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f.attrs)) {
    const t = v.trim();
    if (!t) continue;
    const def = Object.values(ATTR_DEFS).flat().find((d) => d.key === k);
    attributes[k] = def?.type === 'number' && /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : t;
  }
  return {
    ...(locked ? {} : { operation: f.operation, category: f.category, condition: f.condition }),
    title: f.title.trim(), description: f.description.trim(), priceCents: moneyToCents(f.price),
    ...(f.operation === 'locacao' ? { rentPeriod: f.rentPeriod } : {}),
    city: f.city.trim(), state: f.state, ...(f.district.trim() ? { district: f.district.trim() } : {}),
    ...(f.addressPrivate.trim() ? { addressPrivate: f.addressPrivate.trim() } : {}), attributes,
  };
}

const STEPS = ['Dados', 'Fotos', 'Declaração'];

export function Wizard() {
  const params = useParams();
  const [sp] = useSearchParams();
  const { user } = useApp();
  const [listingId, setListingId] = useState<string | null>(params.id ?? null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(emptyForm());
  const [status, setStatus] = useState<string>('draft');
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [loaded, setLoaded] = useState(!params.id);
  const save = useAction();
  const editing = !!params.id;
  const locked = LOCKED.includes(status);
  usePageTitle(editing ? 'Editar anúncio' : 'Anunciar');

  const loadRemote = useAsync(() => api.get<Detail>(`/listings/${params.id}`), [params.id], { enabled: editing });

  // carrega o anúncio existente ou restaura o rascunho local (anúncio novo ainda não criado)
  useEffect(() => {
    if (editing) {
      const d = loadRemote.data;
      if (!d || loaded) return;
      setForm({
        operation: d.operation, category: d.category, condition: d.condition, title: d.title, description: d.description, price: centsToMasked(d.priceCents),
        rentPeriod: d.rentPeriod ?? '', city: d.city, state: d.state, district: d.district ?? '', addressPrivate: d.addressPrivate ?? '',
        attrs: Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, v]) => [k, String(v)])),
      });
      setStatus(d.status); setPhotos(d.photos); setLoaded(true);
      return;
    }
    let restored: Partial<Form> | null = null;
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) restored = JSON.parse(raw); } catch { /* sem rascunho */ }
    const op = sp.get('op') === 'locacao' ? 'locacao' : 'venda';
    const a = user?.address;
    setForm({ ...emptyForm(), operation: op, city: a?.city ?? '', state: a?.state ?? '', district: a?.district ?? '', ...(restored ?? {}) });
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, loadRemote.data]);

  const set = (p: Partial<Form>) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };

  // rascunho local enquanto o anúncio ainda não existe no servidor
  useEffect(() => {
    if (editing || listingId || !loaded || !dirty) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); setSavedAt(new Date()); } catch { /* ok */ } }, 800);
    return () => clearTimeout(t);
  }, [form, editing, listingId, loaded, dirty]);

  const persist = useCallback(async (f: Form): Promise<string | null> => {
    const body = toPayload(f, locked);
    if (listingId) {
      const r = await api.put<{ status: string }>(`/listings/${listingId}`, body);
      setStatus(r.status); setDirty(false); setSavedAt(new Date());
      return listingId;
    }
    const r = await api.post<{ id: string }>('/listings', body);
    setListingId(r.id); setDirty(false); setSavedAt(new Date());
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
    // troca o endereço sem remontar a tela (continua na mesma etapa)
    window.history.replaceState(window.history.state, '', `/venda/anuncio/${r.id}/editar`);
    return r.id;
  }, [listingId, locked]);

  // autosave no servidor depois que o anúncio existe e o formulário está válido
  const formRef = useRef(form); formRef.current = form;
  useEffect(() => {
    if (!listingId || !dirty || !loaded) return;
    if (Object.keys(formErrors(form)).length) return;
    const t = setTimeout(() => { persist(formRef.current).catch(() => undefined); }, 2500);
    return () => clearTimeout(t);
  }, [form, listingId, dirty, loaded, persist]);

  const reloadPhotos = useCallback(async (id: string) => {
    const d = await api.get<Detail>(`/listings/${id}`);
    setPhotos(d.photos);
  }, []);

  const goPhotos = async () => {
    const er = formErrors(form);
    setErrors(er);
    if (Object.keys(er).length) { document.getElementById('wizard-top')?.scrollIntoView(); return; }
    const id = await save.run(() => persist(form));
    if (id) {
      await reloadPhotos(id).catch(() => undefined);
      setStep(1); window.scrollTo(0, 0);
    }
  };

  if (!user) return <Loading />;
  if (editing && loadRemote.loading && !loaded) return <Loading />;
  if (editing && loadRemote.error) return <ErrorState error={loadRemote.error} onRetry={loadRemote.reload} />;
  if (editing && loadRemote.data && !loadRemote.data.isOwner) return <Alert tone="bad">Este anúncio não é seu.</Alert>;
  if (editing && ['sold', 'pending_checkout', 'removed'].includes(status)) return <Alert tone="warn" title="Anúncio encerrado">Este anúncio já foi encerrado e não pode mais ser editado. <Link to="/venda">Voltar ao painel</Link></Alert>;

  if (user.accountType !== 'anunciante') {
    return (
      <div className="narrow stack">
        <PageHead title="Anunciar" />
        <Alert tone="warn" title="Complete seu cadastro de anunciante">Para anunciar, informe seu CPF ou CNPJ e seu endereço. É rápido e anunciar não custa nada.</Alert>
        <Link to="/conta/anunciante" className="btn btn-primary btn-lg">Virar anunciante</Link>
      </div>
    );
  }
  if (user.feeBlocked) {
    return (
      <div className="narrow stack">
        <PageHead title="Anunciar" />
        <Alert tone="bad" title="Novos anúncios bloqueados">Você tem taxa de retirada em atraso. Pague a taxa pendente para voltar a anunciar.</Alert>
        <Link to="/venda" className="btn btn-primary btn-lg">Ver minhas taxas</Link>
      </div>
    );
  }

  if (result) return <Done status={result.status} id={listingId!} />;

  return (
    <div className="narrow stack-l" id="wizard-top">
      <PageHead title={editing ? 'Editar anúncio' : 'Novo anúncio'} sub="Anunciar não custa nada. A comissão só existe quando a venda se concluir." />
      <ol className="stepper" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="stepper-n">{i < step ? '✔' : i + 1}</span><span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="small muted" role="status">{savedAt ? `Rascunho salvo automaticamente às ${savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : 'O rascunho é salvo automaticamente.'}</p>

      {step === 0 && <StepData f={form} set={set} errors={errors} locked={locked} onNext={goPhotos} busy={save.busy} error={save.error} />}
      {step === 1 && listingId && (
        <StepPhotos listingId={listingId} photos={photos} reload={() => reloadPhotos(listingId)} onBack={() => setStep(0)}
          onNext={() => { if (locked) { setResult({ status }); } else { setStep(2); window.scrollTo(0, 0); } }} locked={locked} />
      )}
      {step === 2 && listingId && <StepSign listingId={listingId} form={form} onBack={() => setStep(1)} onDone={(s) => { setResult({ status: s }); window.scrollTo(0, 0); }} />}
    </div>
  );
}

function Done({ status, id }: { status: string; id: string }) {
  const review = status === 'pending_review';
  const edited = !['active', 'pending_review'].includes(status) ? true : false;
  void edited;
  return (
    <div className="narrow stack">
      <PageHead title={review ? 'Anúncio em análise' : 'Pronto!'} />
      {review ? (
        <Alert tone="warn" title="Recebemos seu anúncio e ele está em análise">
          Alguns anúncios passam por uma revisão manual antes de ir ao ar, para proteger compradores. Isso costuma levar pouco tempo e você será avisado por e-mail. Enquanto isso, ele aparece em "Meus anúncios" como "Em análise".
        </Alert>
      ) : status === 'paused' ? (
        <Alert tone="ok">Alterações salvas. O anúncio continua pausado.</Alert>
      ) : (
        <Alert tone="ok" title="Seu anúncio está salvo e no ar!">Compartilhe o link e responda rápido às dúvidas no chat. Quando alguém comprar, alugar ou fizer uma proposta, você é avisado por e-mail e o pedido aparece em Venda &gt; Pedidos recebidos.</Alert>
      )}
      <div className="row wrap">
        <Link className="btn btn-primary" to={`/anuncio/${id}`}>Ver anúncio</Link>
        <Link className="btn btn-outline" to="/venda">Ir ao painel</Link>
        <Link className="btn btn-outline" to="/venda/anunciar" onClick={() => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ok */ } }}>Anunciar outro</Link>
      </div>
    </div>
  );
}

function StepData({ f, set, errors, locked, onNext, busy, error }: { f: Form; set: (p: Partial<Form>) => void; errors: Record<string, string>; locked: boolean; onNext: () => void; busy: boolean; error: unknown }) {
  const { config } = useApp();
  const cents = moneyToCents(f.price);
  let fee = 0;
  try { if (cents >= 100) fee = calcFeeCents(cents, config?.feeCapCents ?? 0); } catch { fee = 0; }
  const defs = f.category ? ATTR_DEFS[f.category] ?? [] : [];
  const rent = f.operation === 'locacao';
  return (
    <form className="stack-l" onSubmit={(e) => { e.preventDefault(); onNext(); }} noValidate>
      {locked && <Alert tone="info">Este anúncio já foi publicado: operação, categoria e novo/usado não podem mais mudar (a declaração assinada cobre esses dados).</Alert>}
      <fieldset className="fieldset">
        <legend>O que você vai anunciar</legend>
        <div className="seg-radio" role="radiogroup" aria-label="Operação">
          {OPERATIONS.map((o) => (
            <label key={o} className={f.operation === o ? 'on' : ''}>
              <input type="radio" name="op" disabled={locked} checked={f.operation === o} onChange={() => set({ operation: o })} />{OPERATION_LABEL[o]}
            </label>
          ))}
        </div>
        <SelectField label="Categoria" value={f.category} disabled={locked} onChange={(e) => set({ category: e.target.value as CategorySlug, attrs: {} })} error={errors.category} required>
          <option value="">Escolha…</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}
        </SelectField>
        <div role="radiogroup" aria-label="Condição">
          <div className="seg-radio">
            {CONDITIONS.map((c) => (
              <label key={c} className={f.condition === c ? 'on' : ''}>
                <input type="radio" name="cond" disabled={locked} checked={f.condition === c} onChange={() => set({ condition: c })} />{c === 'novo' ? 'Novo' : 'Usado'}
              </label>
            ))}
          </div>
          {errors.condition && <small className="field-error" role="alert">{errors.condition}</small>}
          <small className="hint">Novos e usados aparecem em abas separadas na vitrine. Escolha com honestidade.</small>
        </div>
        <TextField label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={90} error={errors.title} required hint="Seja claro: o que é, marca/modelo e estado." />
        <TextAreaField label="Descrição" value={f.description} onChange={(e) => set({ description: e.target.value })} rows={6} maxLength={4000} error={errors.description} required
          hint="Estado, tempo de uso, defeitos, o que acompanha. Não coloque telefone, e-mail nem links: a negociação é toda pelo Vendeu." />
      </fieldset>

      <fieldset className="fieldset">
        <legend>Preço</legend>
        <div className="form-grid">
          <MoneyField label={rent ? 'Valor do aluguel' : 'Preço'} value={f.price} onChange={(v) => set({ price: v })} error={errors.price} required />
          {rent && (
            <SelectField label="Período" value={f.rentPeriod} onChange={(e) => set({ rentPeriod: e.target.value as Form['rentPeriod'] })} error={errors.rentPeriod} required>
              <option value="">Escolha…</option><option value="dia">por dia</option><option value="semana">por semana</option><option value="mes">por mês</option>
            </SelectField>
          )}
        </div>
        <div className="fee-live" aria-live="polite">
          <div>{fee ? <>Comissão se {rent ? 'o aluguel' : 'a venda'} se concluir: <strong>{formatBRL(fee)}</strong> — você recebe <strong>{formatBRL(cents - fee)}</strong>. Anunciar não custa nada.</> : 'Digite o preço para ver a comissão e quanto você recebe. Anunciar não custa nada.'}</div>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Onde está</legend>
        <div className="form-grid">
          <TextField label="Cidade" value={f.city} onChange={(e) => set({ city: e.target.value })} maxLength={80} error={errors.city} required />
          <SelectField label="Estado" value={f.state} onChange={(e) => set({ state: e.target.value })} error={errors.state} required>
            <option value="">Escolha…</option>{STATES.map((s) => <option key={s}>{s}</option>)}
          </SelectField>
          <TextField label="Bairro" value={f.district} onChange={(e) => set({ district: e.target.value })} maxLength={80} />
        </div>
        <TextField label="Endereço exato (opcional, NÃO fica público)" value={f.addressPrivate} onChange={(e) => set({ addressPrivate: e.target.value })} maxLength={200}
          hint="Só você e a moderação veem. Nunca é mostrado a compradores." />
      </fieldset>

      {defs.length > 0 && (
        <fieldset className="fieldset">
          <legend>Detalhes (opcionais)</legend>
          <div className="form-grid">
            {defs.map((d) => (
              <TextField key={d.key} label={`${d.label}${d.suffix ? ` (${d.suffix})` : ''}`} value={f.attrs[d.key] ?? ''} placeholder={d.placeholder}
                inputMode={d.type === 'number' ? 'numeric' : undefined} maxLength={100}
                onChange={(e) => set({ attrs: { ...f.attrs, [d.key]: d.type === 'number' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value } })} />
            ))}
          </div>
        </fieldset>
      )}
      <ErrorAlert error={error} />
      {Object.keys(errors).length > 0 && <Alert tone="bad">Corrija os campos destacados para continuar.</Alert>}
      <div className="row wrap"><button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Salvando…' : 'Continuar: fotos'}</button><Link to="/venda" className="btn btn-ghost">Sair (rascunho fica salvo)</Link></div>
    </form>
  );
}

function StepPhotos({ listingId, photos, reload, onBack, onNext, locked }: { listingId: string; photos: { id: string; url: string }[]; reload: () => Promise<void>; onBack: () => void; onNext: () => void; locked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const act = useAction();

  const upload = async (files: File[]) => {
    const errs: string[] = [];
    let count = photos.length;
    setBusy(true);
    for (const file of files) {
      if (count >= MAX_PHOTOS) { errs.push(`Limite de ${MAX_PHOTOS} fotos atingido.`); break; }
      if (!/^image\//.test(file.type)) { errs.push(`${file.name}: não é uma imagem.`); continue; }
      if (file.size > 10 * 1024 * 1024) { errs.push(`${file.name}: maior que 10 MB.`); continue; }
      const fd = new FormData(); fd.append('file', file, file.name);
      try { await api.upload(`/listings/${listingId}/photos`, fd); count++; } catch (e) { errs.push(`${file.name}: ${errorMessage(e)}`); }
    }
    setMsgs(errs); setBusy(false);
    await reload().catch(() => undefined);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) void upload(fs); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const fs = Array.from(e.dataTransfer.files); if (fs.length) void upload(fs); };

  const remove = async (id: string) => { await act.run(() => api.del(`/listings/${listingId}/photos/${id}`)); await reload().catch(() => undefined); };
  const move = async (i: number, dir: -1 | 1) => {
    const order = photos.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await act.run(() => api.put(`/listings/${listingId}/photos-order`, { order }));
    await reload().catch(() => undefined);
  };

  return (
    <div className="stack-l">
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <p><strong>Arraste as fotos aqui</strong> ou escolha abaixo</p>
        <p className="small muted">Até {MAX_PHOTOS} fotos (mínimo {MIN_PHOTOS}). JPG, PNG ou WebP, até 10 MB cada.</p>
        <div className="row wrap center">
          <button type="button" className="btn btn-primary" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>🖼️ Escolher fotos</button>
          <button type="button" className="btn btn-outline" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => camRef.current?.click()}>📷 Tirar foto</button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPick} aria-label="Escolher fotos do aparelho" />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} aria-label="Tirar foto com a câmera" />
        {busy && <p role="status" className="small">Enviando fotos…</p>}
      </div>
      {msgs.length > 0 && <Alert tone="bad"><ul>{msgs.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
      <ErrorAlert error={act.error} />

      {photos.length > 0 ? (
        <ul className="photo-grid" aria-label="Fotos do anúncio">
          {photos.map((p, i) => (
            <li key={p.id}>
              <img src={p.url} alt={`Foto ${i + 1}${i === 0 ? ' (capa)' : ''}`} />
              {i === 0 && <span className="cover-tag">Capa</span>}
              <div className="photo-actions">
                <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0 || act.busy} aria-label={`Mover foto ${i + 1} para a esquerda`}>◀</button>
                <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || act.busy} aria-label={`Mover foto ${i + 1} para a direita`}>▶</button>
                <button type="button" className="icon-btn danger" onClick={() => remove(p.id)} disabled={act.busy || (locked && photos.length <= MIN_PHOTOS)} aria-label={`Remover foto ${i + 1}`}>🗑</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <Alert tone="warn">Envie pelo menos {MIN_PHOTOS} foto para continuar.</Alert>}

      <div className="tips panel">
        <h2>Dicas para fotos que vendem</h2>
        <ul>
          <li>Use boa luz, de preferência natural, e fundo limpo.</li>
          <li>Tire várias fotos de ângulos diferentes: frente, lados, detalhes e defeitos, se houver.</li>
          <li><strong>Use fotos do seu produto real. Não use foto da internet.</strong> Fotos repetidas de outros anunciantes são sinalizadas e o anúncio vai para análise.</li>
          <li>Em carros e imóveis, mostre o painel, a placa/fachada e os ambientes.</li>
        </ul>
      </div>
      <div className="row wrap">
        <button className="btn btn-primary btn-lg" disabled={photos.length < MIN_PHOTOS || busy} onClick={onNext}>{locked ? 'Concluir edição' : 'Continuar: declaração'}</button>
        <button className="btn btn-outline" onClick={onBack}>Voltar</button>
      </div>
    </div>
  );
}

function StepSign({ listingId, form, onBack, onDone }: { listingId: string; form: Form; onBack: () => void; onDone: (status: string) => void }) {
  const { user, config, pay, refreshPay } = useApp();
  const legal = useAsync(() => api.get<{ documents: { key: string; version: string }[] }>('/legal'), []);
  const [origin, setOrigin] = useState('');
  const [assetRef, setAssetRef] = useState('');
  const [read, setRead] = useState(false);
  const [terms, setTerms] = useState(false);
  const [signer, setSigner] = useState('');
  const act = useAction();
  const asset = form.category ? REGISTERED_ASSET[form.category] : undefined;
  const assetDeb = useDebounced(assetRef.trim(), 400);
  const preview = useAsync(() => api.get<{ text: string; version: string }>(`/listings/${listingId}/declaration-preview`, { originKind: origin, assetRef: assetDeb || undefined }), [listingId, origin, assetDeb], { enabled: !!origin });
  const text = preview.data?.text ?? '';
  const version = (k: string) => legal.data?.documents.find((d) => d.key === k)?.version;
  const sellerDocs: [string, string][] = [['regras-de-anuncio', 'Regras de Anúncio'], ['termo-de-responsabilidade-origem', 'Termo de Responsabilidade de Origem'], ['politica-de-taxas', 'Política de Taxas']];
  const needKyc = !!config?.publishRequiresKyc && user!.kycStatus !== 'verified';
  const needContacts = !user!.emailVerified || !user!.phoneVerified;
  const needPay = !pay?.method?.connected;
  const [blocked, setBlocked] = useState<string[] | null>(null);

  const nameOk = signer.trim().length >= 5;
  const canPublish = !!origin && (!asset || assetRef.trim().length >= 3) && read && terms && nameOk && !!legal.data && !needKyc && !needContacts && !needPay && !!text && !preview.loading && !act.busy;

  const publish = async () => {
    setBlocked(null);
    const accepted = Object.fromEntries(sellerDocs.map(([k]) => [k, version(k)!]));
    const r = await act.run(async () => {
      try {
        return await api.post<{ status: string }>(`/listings/${listingId}/publish`, { originKind: origin, ...(asset ? { assetRef: assetRef.trim() } : {}), signerName: signer.trim(), confirm: true, accepted });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'listing_blocked') setBlocked(((e.detail as { reasons?: string[] })?.reasons) ?? []);
        throw e;
      }
    });
    if (r) onDone(r.status);
  };
  const err = act.error as ApiError | null;

  return (
    <form className="stack-l" onSubmit={(e) => { e.preventDefault(); if (canPublish) void publish(); }}>
      {needContacts && <Alert tone="warn" title="Confirme e-mail e telefone">Antes de publicar, confirme os dois códigos de 6 dígitos. <Link to="/conta/confirmar">Confirmar agora</Link></Alert>}
      {needKyc && (
        <Alert tone="warn" title="Falta verificar sua identidade">
          Para publicar, precisamos verificar sua identidade{user!.kycStatus === 'pending' ? ' (seus documentos estão em análise; avisaremos por e-mail)' : ''}. Seu anúncio fica salvo como rascunho. <Link to="/conta/verificacao">Ir para a verificação</Link>
        </Alert>
      )}
      {needPay && (
        <fieldset className="fieldset">
          <legend>Conta Mercado Pago</legend>
          <p className="small muted">Para publicar é preciso ter uma conta Mercado Pago conectada: é por ela que você recebe quando a venda se concluir. Depois de conectar pelo Mercado Pago você volta ao painel; seu anúncio fica salvo como rascunho.</p>
          <PaymentAccount onChanged={() => void refreshPay()} />
        </fieldset>
      )}
      <fieldset className="fieldset">
        <legend>Origem do bem</legend>
        <SelectField label="Como este bem chegou até você?" value={origin} onChange={(e) => setOrigin(e.target.value)} required>
          <option value="">Escolha…</option>{ORIGIN_KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
        {asset && <TextField label={asset.label} value={assetRef} onChange={(e) => setAssetRef(e.target.value.toUpperCase())} maxLength={40} required
          hint={asset.field === 'placa' ? 'Ex.: ABC1D23. Fica no registro da declaração, não aparece no anúncio.' : 'Número da matrícula no cartório. Não aparece no anúncio.'} />}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Declaração e assinatura</legend>
        <p className="small muted">Leia com atenção. Este texto será assinado digitalmente, com registro do seu IP, aparelho e data.</p>
        <div className="declaration" tabIndex={0} role="region" aria-label="Texto da declaração de origem">
          {!origin ? <p className="muted">Escolha acima como o bem chegou até você para ver o texto que será assinado.</p>
            : preview.loading && !preview.data ? <p className="muted">Carregando o texto…</p>
            : preview.error ? <p className="text-bad">Não foi possível carregar o texto da declaração. Tente de novo.</p>
            : text.split('\n').map((l, i) => <p key={i}>{l}</p>)}
        </div>
        {preview.data && <p className="small muted">Texto gerado pelo servidor (versão {preview.data.version}): é exatamente este que fica registrado com a sua assinatura.</p>}
        <label className="check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /><span><strong>Li e declaro</strong> que tudo o que está escrito acima é verdadeiro.</span></label>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>Li e aceito: {sellerDocs.map(([k, t], i) => (<span key={k}>{i > 0 ? (i === sellerDocs.length - 1 ? ' e ' : ', ') : ''}<Link to={`/legal/${k}`} target="_blank">{t}</Link>{version(k) ? ` (v. ${version(k)})` : ''}</span>))}.</span>
        </label>
        <TextField label="Digite seu nome completo para assinar" value={signer} onChange={(e) => setSigner(e.target.value)} autoComplete="off" maxLength={120} required
          hint={`Precisa ser igual ao do cadastro: ${user!.fullName}`} />
      </fieldset>

      {blocked && (
        <Alert tone="bad" title="Não conseguimos publicar este anúncio">
          <p>Pelas regras do Vendeu, este anúncio não pode ir ao ar porque:</p>
          <ul>{blocked.length ? blocked.map((r) => <li key={r}>{blockReasonLabel(r)}</li>) : <li>o conteúdo infringe as regras de anúncio</li>}</ul>
          <p>Se você acha que foi um engano, revise o título e a descrição e tente de novo, ou fale com <a href="mailto:suporte@vendeu.app">suporte@vendeu.app</a>. Veja as <Link to="/legal/regras-de-anuncio">Regras de Anúncio</Link>.</p>
        </Alert>
      )}
      {err && err.code === 'kyc_required' && <Alert tone="warn" title="Verificação de identidade necessária">Envie seus documentos para publicar. <Link to="/conta/verificacao">Verificar agora</Link></Alert>}
      {err && err.code === 'payment_method_required' && <Alert tone="warn">Conecte sua conta Mercado Pago (acima) para publicar.</Alert>}
      {err && err.code === 'contact_not_verified' && <Alert tone="warn">Confirme e-mail e telefone antes de publicar. <Link to="/conta/confirmar">Confirmar</Link></Alert>}
      {err && !['listing_blocked', 'kyc_required', 'contact_not_verified', 'payment_method_required'].includes(err.code) && <ErrorAlert error={err} />}

      <SafetyBox compact />
      <div className="row wrap">
        <button className="btn btn-primary btn-lg" disabled={!canPublish}>{act.busy ? 'Publicando…' : 'Assinar e publicar'}</button>
        <button type="button" className="btn btn-outline" onClick={onBack}>Voltar</button>
      </div>
    </form>
  );
}
