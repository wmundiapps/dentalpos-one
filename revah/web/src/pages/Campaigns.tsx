import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, Copy, Pause, Play, Plus, Rocket, Send, Trash2, Upload, X } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUS,
  CHANNEL_LABEL,
  RECIPIENT_STATUS,
  destinationHint,
  fmtDateTime,
  fmtPhone,
  renderPreview,
  toLocalInput,
  validateDestination,
} from '../lib/format'
import { csvToManualList } from '../lib/csv'
import { useAuthed } from '../lib/session'
import type { AudiencePreview, Campaign, CampaignRecipient, Channel, ChannelAccount, Contact, Tag } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Stat, Toggle, readFileText, useDebounced, useLoad, usePolling } from '../components/ui'
import { TrialBanner } from './Dashboard'

export default function Campaigns() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  if (id) return <CampaignDetail id={id} />
  if (params.get('nova') === '1')
    return (
      <CampaignWizard
        onClose={() => {
          params.delete('nova')
          setParams(params)
        }}
      />
    )
  return <CampaignList onNew={() => setParams({ nova: '1' })} />
}

function CampaignList({ onNew }: { onNew: () => void }) {
  const { session } = useAuthed()
  const list = useLoad(() => get<Campaign[]>('/campaigns'))
  const running = list.data?.some((c) => c.status === 'RUNNING' || c.status === 'SCHEDULED')
  usePolling(() => list.reload(true), 6000, Boolean(running))

  return (
    <div className="page">
      <PageHeader
        title="Campanhas"
        subtitle="Disparos para listas de contatos com controle de bloqueios e limites."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={onNew}>
            Nova campanha
          </Button>
        }
      />
      <TrialBanner trial={session.tenant.trial} compact />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <EmptyState
          icon={<Send size={28} />}
          title="Nenhuma campanha ainda"
          action={
            <Button variant="primary" onClick={onNew}>
              Criar primeira campanha
            </Button>
          }
        >
          Escolha o canal, o público e a mensagem. Você confere a prévia e faz um envio de teste antes de disparar.
        </EmptyState>
      ) : (
        <div className="cards-list">
          {list.data?.map((c) => {
            const done = c.sentCount + c.failedCount + c.skippedCount
            return (
              <Link key={c.id} to={`/campanhas/${c.id}`} className="card card-link">
                <div className="card-body">
                  <div className="row between gap-sm">
                    <div className="min0">
                      <div className="strong ellipsis">{c.name}</div>
                      <div className="small muted">
                        {CHANNEL_LABEL[c.channel]} · criada em {fmtDateTime(c.createdAt)}
                        {c.isTrial ? ' · teste grátis' : ''}
                      </div>
                    </div>
                    <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                  </div>
                  {c.totalRecipients > 0 && (
                    <>
                      <Progress value={done} max={c.totalRecipients} tone={c.failedCount > 0 ? 'amber' : 'indigo'} />
                      <div className="row gap-md small muted wrap">
                        <span>{c.sentCount} enviados</span>
                        <span>{c.failedCount} falhas</span>
                        <span>{c.skippedCount} ignorados</span>
                        <span>{c.totalRecipients} no total</span>
                      </div>
                    </>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CampaignDetail({ id }: { id: string }) {
  const fb = useFeedback()
  const navigate = useNavigate()
  const { refresh } = useAuthed()
  const camp = useLoad(() => get<Campaign & { recipients: CampaignRecipient[] }>(`/campaigns/${id}`), [id])
  const c = camp.data
  usePolling(() => camp.reload(true), 5000, c?.status === 'RUNNING' || c?.status === 'SCHEDULED')
  const [busy, setBusy] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [filter, setFilter] = useState('')

  async function action(a: 'pause' | 'resume' | 'cancel' | 'launch') {
    if (a === 'cancel' && !confirm('Cancelar a campanha? Envios pendentes não serão feitos.')) return
    if (a === 'launch' && !confirm('Disparar agora? Esta ação não pode ser desfeita.')) return
    setBusy(a)
    try {
      await post(`/campaigns/${id}/${a}`)
      fb.success(a === 'launch' ? 'Campanha disparada.' : a === 'pause' ? 'Campanha pausada.' : a === 'resume' ? 'Campanha retomada.' : 'Campanha cancelada.')
      camp.reload(true)
      if (a === 'launch') refresh().catch(() => null)
    } catch (e) {
      fb.fail(e)
    } finally {
      setBusy('')
    }
  }

  async function remove() {
    if (!confirm('Excluir este rascunho?')) return
    try {
      await del(`/campaigns/${id}`)
      navigate('/campanhas')
    } catch (e) {
      fb.fail(e)
    }
  }

  if (camp.loading && !c) return <Loading />
  if (camp.error && !c) return <ErrorBox error={camp.error} onRetry={camp.reload} />
  if (!c) return null
  if (editing) return <CampaignWizard initial={c} onClose={() => { setEditing(false); camp.reload(true) }} />

  const done = c.sentCount + c.failedCount + c.skippedCount
  const recipients = filter ? c.recipients.filter((r) => r.status === filter) : c.recipients

  return (
    <div className="page">
      <Link to="/campanhas" className="back-link">
        <ArrowLeft size={16} /> Campanhas
      </Link>
      <PageHeader
        title={c.name}
        subtitle={
          <>
            {CHANNEL_LABEL[c.channel]} · <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
            {c.scheduledAt && c.status === 'SCHEDULED' ? ` · agendada para ${fmtDateTime(c.scheduledAt)}` : ''}
          </>
        }
        actions={
          <>
            {c.status === 'DRAFT' && (
              <>
                <Button variant="ghost" icon={<Trash2 size={16} />} onClick={remove}>
                  Excluir
                </Button>
                <Button onClick={() => setEditing(true)}>Editar</Button>
                {c.channel !== 'VOICE' && (
                  <Button icon={<Send size={16} />} onClick={() => setTestOpen(true)}>
                    Envio de teste
                  </Button>
                )}
                <Button variant="primary" icon={<Rocket size={16} />} loading={busy === 'launch'} onClick={() => action('launch')}>
                  Disparar
                </Button>
              </>
            )}
            {(c.status === 'RUNNING' || c.status === 'SCHEDULED') && (
              <Button icon={<Pause size={16} />} loading={busy === 'pause'} onClick={() => action('pause')}>
                Pausar
              </Button>
            )}
            {c.status === 'PAUSED' && (
              <Button variant="primary" icon={<Play size={16} />} loading={busy === 'resume'} onClick={() => action('resume')}>
                Retomar
              </Button>
            )}
            {['RUNNING', 'SCHEDULED', 'PAUSED'].includes(c.status) && (
              <Button variant="danger" icon={<Ban size={16} />} loading={busy === 'cancel'} onClick={() => action('cancel')}>
                Cancelar
              </Button>
            )}
          </>
        }
      />

      {c.totalRecipients > 0 && (
        <>
          <div className="stats">
            <Stat label="Total" value={c.totalRecipients} />
            <Stat label="Enviados" value={c.sentCount} tone="green" />
            <Stat label="Falhas" value={c.failedCount} tone={c.failedCount ? 'red' : undefined} />
            <Stat label="Ignorados" value={c.skippedCount} sub="Inválidos ou bloqueados" />
          </div>
          <Progress value={done} max={c.totalRecipients} />
        </>
      )}

      <div className="grid-2">
        <Card title="Mensagem">
          {c.subject && (
            <p>
              <strong>Assunto:</strong> {c.subject}
            </p>
          )}
          <div className="message-preview">{c.channel === 'VOICE' ? c.voiceScript || c.template : c.template}</div>
          {c.waTemplate?.name && (
            <p className="small muted">
              Modelo WhatsApp: {c.waTemplate.name} ({c.waTemplate.language || 'pt_BR'}){c.waTemplate.params?.length ? ` · parâmetros: ${c.waTemplate.params.join(', ')}` : ''}
            </p>
          )}
          {c.appendOptOutHint && c.channel !== 'VOICE' && <p className="small muted">Inclui instrução de descadastro.</p>}
        </Card>
        <Card title="Datas">
          <dl className="details">
            <dt>Criada</dt>
            <dd>{fmtDateTime(c.createdAt)}</dd>
            <dt>Início</dt>
            <dd>{fmtDateTime(c.startedAt)}</dd>
            <dt>Conclusão</dt>
            <dd>{fmtDateTime(c.completedAt)}</dd>
            {c.isTrial && (
              <>
                <dt>Teste grátis</dt>
                <dd>Sim (consumiu 1 campanha grátis)</dd>
              </>
            )}
          </dl>
        </Card>
      </div>

      {c.status === 'DRAFT' ? (
        <Alert tone="blue">A lista de destinatários é montada no momento do disparo, já sem inválidos e bloqueados.</Alert>
      ) : (
        <Card
          title={`Destinatários (${c.recipients.length}${c.recipients.length >= 1000 ? '+' : ''})`}
          actions={
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(RECIPIENT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          }
          pad={false}
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Destino</th>
                  <th>Status</th>
                  <th className="hide-sm">Horário</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id}>
                    <td>{r.contactId ? <Link to={`/contatos?id=${r.contactId}`}>{r.name || 'Contato'}</Link> : r.name || '—'}</td>
                    <td className="nowrap">{c.channel === 'EMAIL' || r.destination.startsWith('inválido') ? r.destination : fmtPhone(r.destination) || r.destination}</td>
                    <td>
                      <Badge tone={RECIPIENT_STATUS[r.status]?.tone}>{RECIPIENT_STATUS[r.status]?.label || r.status}</Badge>
                      {r.error && <div className="small text-red">{r.error}</div>}
                    </td>
                    <td className="hide-sm small muted">{fmtDateTime(r.attemptedAt)}</td>
                  </tr>
                ))}
                {recipients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted center">
                      Nenhum destinatário neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {testOpen && <TestSendModal campaignId={c.id} channel={c.channel} onClose={() => setTestOpen(false)} />}
    </div>
  )
}

function TestSendModal({ campaignId, channel, onClose }: { campaignId: string; channel: Channel; onClose: () => void }) {
  const fb = useFeedback()
  const [destination, setDestination] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; status: string; error: string | null } | null>(null)
  async function send() {
    setLoading(true)
    setResult(null)
    try {
      setResult(await post(`/campaigns/${campaignId}/test`, { destination, name: name || undefined }))
    } catch (e) {
      fb.fail(e)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Envio de teste"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" onClick={send} loading={loading} disabled={!destination.trim()}>
            Enviar teste
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">O envio de teste não consome campanha do teste grátis, mas conta no volume mensal de mensagens.</p>
        <Field label={channel === 'EMAIL' ? 'E-mail' : channel === 'TELEGRAM' ? 'Chat ID do Telegram' : 'Telefone com DDD'}>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} />
        </Field>
        <Field label="Nome usado nas variáveis (opcional)">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {result && (
          <Alert tone={result.ok ? 'green' : 'red'}>{result.ok ? `Teste enviado (status: ${result.status}).` : `Falhou: ${result.error}`}</Alert>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Assistente de criação/edição
// ---------------------------------------------------------------------------

interface ManualLine {
  line: number
  name: string
  raw: string
  valid: string | null
}

function parseManual(text: string, channel: Channel): ManualLine[] {
  return text
    .split(/\r?\n/)
    .map((l, i) => ({ l: l.trim(), i }))
    .filter((x) => x.l)
    .map(({ l, i }) => {
      const parts = l.split(/[;\t]/).map((p) => p.trim())
      let name = ''
      let raw = parts[0]
      if (parts.length > 1) {
        // "Nome; destino" ou "destino; Nome"
        if (validateDestination(channel, parts[1])) {
          name = parts[0]
          raw = parts[1]
        } else {
          raw = parts[0]
          name = parts[1]
        }
      }
      return { line: i + 1, name, raw, valid: validateDestination(channel, raw) }
    })
}

const STEPS = ['Canal', 'Público', 'Mensagem', 'Revisão']

function CampaignWizard({ initial, onClose }: { initial?: Campaign; onClose: () => void }) {
  const fb = useFeedback()
  const navigate = useNavigate()
  const { session, refresh } = useAuthed()
  const [step, setStep] = useState(0)
  const [campaignId, setCampaignId] = useState<string | null>(initial?.id || null)
  const [name, setName] = useState(initial?.name || '')
  const [channel, setChannel] = useState<Channel>(initial?.channel || 'WHATSAPP')
  const [channelAccountId, setChannelAccountId] = useState(initial?.channelAccountId || '')
  const [tagIds, setTagIds] = useState<string[]>(initial?.audience?.tagIds || [])
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>((initial?.audience?.contactIds || []).map((id) => ({ id, name: 'Contato selecionado' })))
  const [manualText, setManualText] = useState((initial?.audience?.manual || []).map((m) => (m.name ? `${m.name}; ${m.destination}` : m.destination)).join('\n'))
  const [template, setTemplate] = useState(initial?.template || '')
  const [subject, setSubject] = useState(initial?.subject || '')
  const [voiceScript, setVoiceScript] = useState(initial?.voiceScript || '')
  const [useWaTpl, setUseWaTpl] = useState(Boolean(initial?.waTemplate?.name))
  const [waTpl, setWaTpl] = useState({ name: initial?.waTemplate?.name || '', language: initial?.waTemplate?.language || 'pt_BR', params: (initial?.waTemplate?.params || []).join('\n') })
  const [optOut, setOptOut] = useState(initial?.appendOptOutHint ?? true)
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? toLocalInput(new Date(initial.scheduledAt)) : '')
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [error, setError] = useState('')

  const tags = useLoad(() => get<Tag[]>('/tags'))
  const accounts = useLoad(() => get<ChannelAccount[]>('/channels'))
  const channelAccounts = (accounts.data || []).filter((a) => a.channel === channel && a.isActive)
  const manual = useMemo(() => parseManual(manualText, channel), [manualText, channel])
  const manualInvalid = manual.filter((m) => !m.valid)
  const trial = session.tenant.trial

  function payload() {
    const isVoice = channel === 'VOICE'
    return {
      name: name.trim(),
      channel,
      channelAccountId: channelAccountId || null,
      template: isVoice ? voiceScript.trim() || template.trim() : template.trim(),
      subject: channel === 'EMAIL' ? subject.trim() || null : null,
      voiceScript: isVoice ? voiceScript.trim() : null,
      waTemplate:
        channel === 'WHATSAPP' && useWaTpl && waTpl.name.trim()
          ? { name: waTpl.name.trim(), language: waTpl.language.trim() || 'pt_BR', params: waTpl.params.split('\n').map((p) => p.trim()).filter(Boolean) }
          : null,
      audience: {
        tagIds,
        contactIds: contacts.map((c) => c.id),
        manual: manual.map((m) => ({ ...(m.name ? { name: m.name } : {}), destination: m.raw })),
      },
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      appendOptOutHint: optOut,
    }
  }

  function validate(s: number): string {
    if (s === 0) {
      if (!name.trim()) return 'Dê um nome para a campanha.'
    }
    if (s === 1) {
      if (!tagIds.length && !contacts.length && !manual.length) return 'Escolha ao menos uma etiqueta, contato ou número.'
    }
    if (s === 2) {
      if (channel === 'VOICE' && !voiceScript.trim()) return 'Escreva o roteiro da ligação.'
      if (channel !== 'VOICE' && !template.trim()) return 'Escreva a mensagem.'
      if (channel === 'EMAIL' && !subject.trim()) return 'Informe o assunto do e-mail.'
      if (useWaTpl && channel === 'WHATSAPP' && !waTpl.name.trim()) return 'Informe o nome do modelo aprovado ou desmarque a opção.'
    }
    return ''
  }

  async function loadPreview() {
    setPreviewLoading(true)
    try {
      setPreview(await post<AudiencePreview>('/campaigns/preview-audience', { channel, audience: payload().audience }))
    } catch (e) {
      fb.fail(e)
    } finally {
      setPreviewLoading(false)
    }
  }

  function next() {
    const err = validate(step)
    setError(err)
    if (err) return
    const n = step + 1
    setStep(n)
    if (n === 3) loadPreview()
    window.scrollTo({ top: 0 })
  }

  async function save(): Promise<string | null> {
    for (let s = 0; s < 3; s++) {
      const err = validate(s)
      if (err) {
        setError(err)
        setStep(s)
        return null
      }
    }
    try {
      if (campaignId) {
        await patch(`/campaigns/${campaignId}`, payload())
        return campaignId
      }
      const c = await post<Campaign>('/campaigns', payload())
      setCampaignId(c.id)
      return c.id
    } catch (e) {
      fb.fail(e)
      return null
    }
  }

  async function saveDraft() {
    setSaving('draft')
    const id = await save()
    setSaving('')
    if (id) {
      fb.success('Rascunho salvo.')
      navigate(`/campanhas/${id}`)
    }
  }

  async function openTest() {
    setSaving('test')
    const id = await save()
    setSaving('')
    if (id) setTestOpen(true)
  }

  async function launch() {
    if (!confirm(scheduledAt ? 'Agendar esta campanha?' : 'Disparar agora? Esta ação não pode ser desfeita.')) return
    setSaving('launch')
    const id = await save()
    if (!id) return setSaving('')
    try {
      await post(`/campaigns/${id}/launch`)
      fb.success(scheduledAt ? 'Campanha agendada.' : 'Campanha disparada.')
      refresh().catch(() => null)
      navigate(`/campanhas/${id}`)
    } catch (e) {
      fb.fail(e)
      navigate(`/campanhas/${id}`)
    } finally {
      setSaving('')
    }
  }

  async function onCsv(file?: File) {
    if (!file) return
    const text = await readFileText(file)
    const kind = channel === 'EMAIL' ? 'email' : channel === 'TELEGRAM' ? 'telegram' : 'phone'
    const rows = csvToManualList(text, kind)
    if (!rows.length) return fb.toast('Não encontramos números/e-mails no arquivo.', 'error')
    const lines = rows.map((r) => (r.name ? `${r.name}; ${r.destination}` : r.destination))
    setManualText((t) => [t.trim(), ...lines].filter(Boolean).join('\n'))
    fb.success(`${rows.length} linha(s) adicionadas à lista.`)
  }

  const sample = renderPreview(channel === 'VOICE' ? voiceScript : template, { nome: 'Maria Souza', empresa: session.tenant.name })

  return (
    <div className="page">
      <button className="back-link link-btn" onClick={onClose}>
        <ArrowLeft size={16} /> {initial ? 'Voltar para a campanha' : 'Campanhas'}
      </button>
      <PageHeader title={initial ? 'Editar campanha' : 'Nova campanha'} />
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <button onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="step-n">{i + 1}</span>
              <span className="step-l">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      {error && <Alert tone="red">{error}</Alert>}

      {step === 0 && (
        <Card>
          <div className="stack">
            <Field label="Nome da campanha" hint="Uso interno. Em ligações, também é o objetivo informado ao agente.">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="ex.: Retorno de pacientes — setembro" />
            </Field>
            <div>
              <div className="field-label">Canal</div>
              <div className="choice-grid">
                {CAMPAIGN_CHANNELS.map((ch) => (
                  <button key={ch} className={`choice ${channel === ch ? 'active' : ''}`} onClick={() => { setChannel(ch); setChannelAccountId(''); setPreview(null) }}>
                    <span className="strong">{CHANNEL_LABEL[ch]}</span>
                    <span className="small muted">
                      {ch === 'WHATSAPP' ? 'Mensagem no WhatsApp' : ch === 'SMS' ? 'Torpedo SMS' : ch === 'TELEGRAM' ? 'Bot do Telegram' : ch === 'EMAIL' ? 'E-mail com assunto' : 'Ligação com agente de voz'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {channel === 'VOICE' && !session.tenant.limits.voice && <Alert tone="amber">Ligações automáticas estão disponíveis a partir do plano Pro.</Alert>}
            <Field label="Conta de envio" hint={channelAccounts.length ? undefined : 'Nenhuma conta ativa neste canal. Conecte uma em Canais antes de disparar.'}>
              <select value={channelAccountId} onChange={(e) => setChannelAccountId(e.target.value)}>
                <option value="">Padrão do canal</option>
                {channelAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} {a.simulated ? '(simulado)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className="stack">
          <Card title="Por etiqueta">
            {tags.data?.length ? (
              <div className="row wrap gap-sm">
                {tags.data.map((t) => (
                  <label key={t.id} className={`chip chip-check ${tagIds.includes(t.id) ? 'active' : ''}`}>
                    <input type="checkbox" checked={tagIds.includes(t.id)} onChange={(e) => setTagIds(e.target.checked ? [...tagIds, t.id] : tagIds.filter((x) => x !== t.id))} />
                    {t.name} <span className="muted">({t.contacts})</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted small">Nenhuma etiqueta. Crie etiquetas no CRM ou importe contatos com etiquetas.</p>
            )}
          </Card>
          <Card title="Contatos do CRM">
            <ContactPicker selected={contacts} onChange={setContacts} />
          </Card>
          <Card
            title="Lista manual"
            actions={
              <label className="btn btn-secondary btn-sm">
                <Upload size={14} /> CSV
                <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { onCsv(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            }
          >
            <Field hint={destinationHint(channel)}>
              <textarea rows={6} value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder={channel === 'EMAIL' ? 'maria@exemplo.com' : '(44) 99999-9999'} />
            </Field>
            {manual.length > 0 && (
              <div className="small">
                {manual.length - manualInvalid.length} válido(s)
                {manualInvalid.length > 0 && (
                  <span className="text-red">
                    {' '}
                    · {manualInvalid.length} inválido(s): {manualInvalid.slice(0, 5).map((m) => `linha ${m.line} (${m.raw})`).join(', ')}
                    {manualInvalid.length > 5 ? '…' : ''}
                  </span>
                )}
              </div>
            )}
            <p className="small muted">Números da lista manual entram no CRM ao disparar, para manter o histórico unificado.</p>
          </Card>
          {trial.isTrial && <Alert tone="amber">No teste grátis cada campanha pode ter até {trial.maxRecipientsPerCampaign} contatos válidos.</Alert>}
        </div>
      )}

      {step === 2 && (
        <div className="grid-2">
          <Card>
            <div className="stack">
              {channel === 'EMAIL' && (
                <Field label="Assunto">
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </Field>
              )}
              {channel === 'VOICE' ? (
                <Field label="Roteiro da ligação" hint="O agente de voz segue este roteiro e responde dúvidas simples. Seja direto e educado.">
                  <textarea rows={8} value={voiceScript} onChange={(e) => setVoiceScript(e.target.value)} maxLength={4000} />
                </Field>
              ) : (
                <Field label="Mensagem" hint={`${template.length}/4096 caracteres`}>
                  <textarea rows={8} value={template} onChange={(e) => setTemplate(e.target.value)} maxLength={4096} />
                </Field>
              )}
              <div className="row wrap gap-xs">
                <span className="small muted">Inserir:</span>
                {['{{nome}}', '{{primeiro_nome}}', '{{empresa}}'].map((v) => (
                  <button
                    key={v}
                    className="chip"
                    onClick={() => (channel === 'VOICE' ? setVoiceScript((t) => `${t}${v}`) : setTemplate((t) => `${t}${v}`))}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {channel === 'WHATSAPP' && (
                <div className="details-box">
                  <Toggle checked={useWaTpl} onChange={setUseWaTpl} label="Usar modelo aprovado do WhatsApp (API oficial)" />
                  <p className="small muted">Na API oficial da Meta, mensagens para quem não falou com você nas últimas 24h exigem um modelo aprovado. Parâmetros aceitam variáveis.</p>
                  {useWaTpl && (
                    <div className="stack">
                      <div className="grid-2 gap-sm">
                        <Field label="Nome do modelo">
                          <input value={waTpl.name} onChange={(e) => setWaTpl({ ...waTpl, name: e.target.value })} />
                        </Field>
                        <Field label="Idioma">
                          <input value={waTpl.language} onChange={(e) => setWaTpl({ ...waTpl, language: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Parâmetros (um por linha)" hint="Ex.: {{primeiro_nome}}">
                        <textarea rows={3} value={waTpl.params} onChange={(e) => setWaTpl({ ...waTpl, params: e.target.value })} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
              {channel !== 'VOICE' && (
                <Toggle checked={optOut} onChange={setOptOut} label='Incluir instrução de descadastro (ex.: "responda SAIR")' />
              )}
              <Field label="Agendar (opcional)" hint="Vazio = disparo imediato.">
                <input type="datetime-local" value={scheduledAt} min={toLocalInput(new Date())} onChange={(e) => setScheduledAt(e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card title="Prévia">
            {channel === 'EMAIL' && subject && <div className="strong">{renderPreview(subject, { nome: 'Maria Souza', empresa: session.tenant.name })}</div>}
            <div className="message-preview">{sample || <span className="muted">A mensagem aparece aqui.</span>}</div>
            <p className="small muted">Exemplo com o contato “Maria Souza”.</p>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <Card title="Público" actions={<Button size="sm" variant="ghost" onClick={loadPreview} loading={previewLoading}>Atualizar</Button>}>
            {previewLoading && !preview ? (
              <Loading label="Calculando público…" />
            ) : preview ? (
              <>
                <div className="stats">
                  <Stat label="Total" value={preview.total} />
                  <Stat label="Válidos" value={preview.valid} />
                  <Stat label="Inválidos" value={preview.invalid} tone={preview.invalid ? 'amber' : undefined} />
                  <Stat label="Bloqueados (opt-out)" value={preview.suppressed} tone={preview.suppressed ? 'amber' : undefined} />
                  <Stat label="Receberão" value={preview.eligible} tone="green" />
                </div>
                {preview.trial.isTrial && !preview.fitsTrial && (
                  <Alert tone="red" title="Não cabe no teste grátis">
                    {preview.trial.exhausted
                      ? 'Você já usou as campanhas do teste grátis.'
                      : `No teste grátis cada campanha pode ter até ${preview.trial.maxRecipientsPerCampaign} contatos válidos. Reduza o público ou escolha um plano.`}
                  </Alert>
                )}
                {preview.trial.isTrial && preview.fitsTrial && (
                  <Alert tone="blue">Ao disparar, esta campanha usa 1 das {preview.trial.maxCampaigns} campanhas grátis ({preview.trial.campaignsRemaining} restante(s)).</Alert>
                )}
                {preview.eligible === 0 && <Alert tone="amber">Nenhum contato receberá esta campanha. Revise o público.</Alert>}
              </>
            ) : null}
          </Card>
          <Card title="Resumo">
            <dl className="details">
              <dt>Nome</dt>
              <dd>{name}</dd>
              <dt>Canal</dt>
              <dd>{CHANNEL_LABEL[channel]}</dd>
              <dt>Envio</dt>
              <dd>{scheduledAt ? fmtDateTime(new Date(scheduledAt).toISOString()) : 'Imediato'}</dd>
            </dl>
            <div className="message-preview">{sample}</div>
          </Card>
          <Alert tone="gray">Envie apenas para quem autorizou receber suas mensagens. Pedidos de descadastro são respeitados automaticamente.</Alert>
        </div>
      )}

      <div className="wizard-foot">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
        )}
        <div className="grow" />
        <Button variant="ghost" onClick={saveDraft} loading={saving === 'draft'} disabled={!name.trim()}>
          Salvar rascunho
        </Button>
        {step < 3 ? (
          <Button variant="primary" onClick={next}>
            Continuar
          </Button>
        ) : (
          <>
            {channel !== 'VOICE' && (
              <Button icon={<Copy size={16} />} onClick={openTest} loading={saving === 'test'}>
                Envio de teste
              </Button>
            )}
            <Button variant="primary" icon={<Rocket size={16} />} onClick={launch} loading={saving === 'launch'} disabled={!preview || preview.eligible === 0}>
              {scheduledAt ? 'Agendar' : 'Disparar'}
            </Button>
          </>
        )}
      </div>
      {testOpen && campaignId && <TestSendModal campaignId={campaignId} channel={channel} onClose={() => setTestOpen(false)} />}
    </div>
  )
}

function ContactPicker({ selected, onChange }: { selected: { id: string; name: string }[]; onChange: (v: { id: string; name: string }[]) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const res = useLoad(() => (dq.trim() ? get<{ items: Contact[] }>('/contacts', { q: dq, pageSize: 10 }) : Promise.resolve({ items: [] as Contact[] })), [dq])
  const ids = new Set(selected.map((s) => s.id))
  return (
    <div className="stack">
      <input type="search" placeholder="Buscar contato por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
      {dq && res.data && (
        <ul className="list picker">
          {res.data.items.length === 0 && <li className="muted small">Nenhum resultado.</li>}
          {res.data.items.map((c) => (
            <li key={c.id} className="list-row">
              <span>
                {c.name} <span className="small muted">{fmtPhone(c.phone) || c.email}</span>
              </span>
              <Button size="sm" disabled={ids.has(c.id)} onClick={() => onChange([...selected, { id: c.id, name: c.name }])}>
                {ids.has(c.id) ? 'Adicionado' : 'Adicionar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 0 && (
        <div className="row wrap gap-xs">
          {selected.map((s) => (
            <span key={s.id} className="chip active">
              {s.name}
              <button className="chip-x" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} aria-label={`Remover ${s.name}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
