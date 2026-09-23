import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Plus, Scale, Trash2 } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { CALL_OUTCOME, CALL_STATUS, WEEKDAYS, fmtDateTime, fmtDuration, fmtPhone } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Call, CallWindow, VoiceSettings } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Tabs, Toggle, useLoad, usePolling } from '../components/ui'
import { CallTranscript } from './ContactDrawer'

export default function Voice() {
  const { embedded } = useAuthed()
  const [tab, setTab] = useState<'calls' | 'settings'>('calls')
  return (
    <div className="page">
      <PageHeader title={embedded ? 'Ligações automáticas' : 'REVAH Voice'} subtitle="Agente de voz que liga, conversa, registra o resultado e transfere para um humano quando preciso." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'calls', label: 'Ligações' },
          { value: 'settings', label: 'Configurações' },
        ]}
      />
      {tab === 'calls' ? <CallsList /> : <VoiceSettingsForm />}
    </div>
  )
}

function CallsList() {
  const fb = useFeedback()
  const [status, setStatus] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useLoad(() => get<Call[]>('/voice/calls', { status }), [status])
  usePolling(() => list.reload(true), 10000)

  async function cancel(c: Call) {
    if (!confirm('Cancelar esta ligação?')) return
    try {
      await post(`/voice/calls/${c.id}/cancel`)
      fb.success('Ligação cancelada.')
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(CALL_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="small muted">Para agendar uma ligação, abra o contato no CRM ou crie uma campanha de voz.</span>
      </div>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <EmptyState icon={<Phone size={28} />} title="Nenhuma ligação">
          <Link to="/contatos">Abra um contato</Link> e use “Agendar ligação”, ou crie uma <Link to="/campanhas?nova=1">campanha de voz</Link>.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Contato</th>
                <th className="hide-sm">Objetivo</th>
                <th>Status</th>
                <th className="hide-sm">Resultado</th>
                <th className="hide-sm">Quando</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)}>
                  <td>
                    <div className="strong">{c.contact?.name || fmtPhone(c.to)}</div>
                    <div className="small muted">{fmtPhone(c.to)}</div>
                  </td>
                  <td className="hide-sm">{c.purpose || '—'}</td>
                  <td>
                    <Badge tone={CALL_STATUS[c.status]?.tone}>{CALL_STATUS[c.status]?.label || c.status}</Badge>
                    {c.attempt > 1 && <div className="small muted">tentativa {c.attempt}</div>}
                  </td>
                  <td className="hide-sm">{c.outcome ? CALL_OUTCOME[c.outcome] || c.outcome : '—'}</td>
                  <td className="hide-sm small muted nowrap">{fmtDateTime(c.startedAt || c.createdAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {['QUEUED', 'RINGING', 'IN_PROGRESS'].includes(c.status) && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(c)}>
                        Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <CallDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function CallDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const call = useLoad(() => get<Call>(`/voice/calls/${id}`), [id])
  const c = call.data
  return (
    <Modal open onClose={onClose} size="lg" title="Detalhes da ligação">
      {call.loading && !c && <Loading />}
      <ErrorBox error={call.error} onRetry={call.reload} />
      {c && (
        <div className="stack">
          <div className="row wrap gap-sm">
            <Badge tone={CALL_STATUS[c.status]?.tone}>{CALL_STATUS[c.status]?.label || c.status}</Badge>
            {c.outcome && <Badge tone="indigo">{CALL_OUTCOME[c.outcome] || c.outcome}</Badge>}
          </div>
          <dl className="details">
            <dt>Contato</dt>
            <dd>{c.contact ? <Link to={`/contatos?id=${c.contact.id}`}>{c.contact.name}</Link> : '—'}</dd>
            <dt>Número</dt>
            <dd>{fmtPhone(c.to)}</dd>
            <dt>Objetivo</dt>
            <dd>{c.purpose || '—'}</dd>
            <dt>Início / fim</dt>
            <dd>
              {fmtDateTime(c.startedAt)} → {fmtDateTime(c.endedAt)}
            </dd>
            <dt>Duração</dt>
            <dd>{fmtDuration(c.durationSec)}</dd>
            <dt>Tentativa</dt>
            <dd>{c.attempt}</dd>
            {c.callbackAt && (
              <>
                <dt>Retornar em</dt>
                <dd>{fmtDateTime(c.callbackAt)}</dd>
              </>
            )}
          </dl>
          {c.error && <Alert tone="red">{c.error}</Alert>}
          {c.summary && (
            <Card title="Resumo">
              <p className="pre">{c.summary}</p>
            </Card>
          )}
          {c.recordingUrl && (
            <div>
              <audio controls src={c.recordingUrl} className="w-full" />
              <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="small">
                Abrir gravação
              </a>
            </div>
          )}
          <h4>Transcrição</h4>
          <CallTranscript call={c} />
          {c.script && (
            <details className="details-box">
              <summary>Roteiro usado</summary>
              <p className="pre small">{c.script}</p>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}

function VoiceSettingsForm() {
  const fb = useFeedback()
  const { canManage, embedded } = useAuthed()
  const s = useLoad(() => get<VoiceSettings>('/voice/settings'))
  const [f, setF] = useState<VoiceSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (s.data) setF(s.data)
  }, [s.data])

  if (s.loading && !f) return <Loading />
  if (s.error && !f) return <ErrorBox error={s.error} onRetry={s.reload} />
  if (!f) return null

  const set = <K extends keyof VoiceSettings>(k: K, v: VoiceSettings[K]) => setF({ ...f, [k]: v })
  const setWindow = (i: number, w: Partial<CallWindow>) => set('allowedWindows', f.allowedWindows.map((x, j) => (j === i ? { ...x, ...w } : x)))

  async function save() {
    if (!f) return
    setError('')
    for (const w of f.allowedWindows) {
      if (!w.days.length) return setError('Cada janela precisa de ao menos um dia.')
      if (w.start >= w.end) return setError('O horário de início precisa ser antes do fim.')
    }
    if (f.recordCalls && !/grava/i.test(f.recordingNotice)) return setError('Com gravação ligada, o aviso precisa informar que a ligação será gravada.')
    setSaving(true)
    try {
      await put('/voice/settings', {
        enabled: f.enabled,
        allowedWindows: f.allowedWindows,
        skipHolidays: f.skipHolidays,
        recordCalls: f.recordCalls,
        recordingNotice: f.recordingNotice,
        greeting: f.greeting,
        agentInstructions: f.agentInstructions,
        transferNumber: f.transferNumber?.trim() || null,
        maxAttempts: Number(f.maxAttempts),
        retryDelayMinutes: Number(f.retryDelayMinutes),
        maxConcurrent: Number(f.maxConcurrent),
        maxTurns: Number(f.maxTurns),
      })
      fb.success('Configurações de voz salvas.')
      s.reload(true)
    } catch (e: any) {
      if (e?.status === 402) fb.fail(e)
      else setError(e?.message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canManage

  return (
    <div className="stack">
      {!f.planAllowsVoice && (
        <Alert tone="amber" title="Ligações automáticas não estão no seu plano">
          Disponível a partir do plano Pro.{' '}
          {!embedded && canManage && <Link to="/assinatura">Ver planos</Link>}
        </Alert>
      )}
      <Alert tone="gray" title="Antes de ativar">
        <span className="row gap-sm">
          <Scale size={16} /> Confirme com o jurídico as regras de telemarketing e LGPD antes de ativar.
        </span>
        <span className="small">Respeite horários, pedidos de não contato e a identificação clara de quem está ligando.</span>
      </Alert>
      {error && <Alert tone="red">{error}</Alert>}

      <Card title="Geral">
        <div className="stack">
          <Toggle checked={f.enabled} onChange={(v) => set('enabled', v)} disabled={disabled || !f.planAllowsVoice} label="Ligações automáticas ativadas" />
          {f.nextAllowedAt && (
            <p className="small muted">
              Próximo horário permitido: <strong>{fmtDateTime(f.nextAllowedAt)}</strong> (fuso {f.timezone})
            </p>
          )}
          <Field label="Saudação inicial" hint="Primeira frase da ligação. Diga quem está ligando.">
            <input value={f.greeting} onChange={(e) => set('greeting', e.target.value)} disabled={disabled} maxLength={500} />
          </Field>
          <Field label="Instruções do agente" hint="Tom de voz, o que pode ou não responder, quando transferir.">
            <textarea rows={5} value={f.agentInstructions} onChange={(e) => set('agentInstructions', e.target.value)} disabled={disabled} maxLength={4000} />
          </Field>
          <Field label="Número para transferência" hint="Se o contato pedir para falar com uma pessoa.">
            <input type="tel" value={f.transferNumber || ''} onChange={(e) => set('transferNumber', e.target.value)} disabled={disabled} placeholder="+55 44 3333-3333" />
          </Field>
        </div>
      </Card>

      <Card title="Horários permitidos" actions={!disabled && <Button size="sm" icon={<Plus size={14} />} onClick={() => set('allowedWindows', [...f.allowedWindows, { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }])}>Adicionar janela</Button>}>
        <div className="stack">
          {f.allowedWindows.length === 0 && <p className="muted small">Sem janelas: nenhuma ligação será feita.</p>}
          {f.allowedWindows.map((w, i) => (
            <div key={i} className="window-row">
              <div className="row wrap gap-xs">
                {WEEKDAYS.map((d, di) => (
                  <label key={di} className={`chip chip-check ${w.days.includes(di) ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={w.days.includes(di)}
                      onChange={(e) => setWindow(i, { days: e.target.checked ? [...w.days, di].sort() : w.days.filter((x) => x !== di) })}
                    />
                    {d}
                  </label>
                ))}
              </div>
              <div className="row gap-sm">
                <input type="time" value={w.start} disabled={disabled} onChange={(e) => setWindow(i, { start: e.target.value })} aria-label="Início" />
                <span>até</span>
                <input type="time" value={w.end} disabled={disabled} onChange={(e) => setWindow(i, { end: e.target.value })} aria-label="Fim" />
                {!disabled && (
                  <button className="icon-btn" onClick={() => set('allowedWindows', f.allowedWindows.filter((_, j) => j !== i))} aria-label="Remover janela">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <Toggle checked={f.skipHolidays} onChange={(v) => set('skipHolidays', v)} disabled={disabled} label="Não ligar em feriados nacionais" />
        </div>
      </Card>

      <Card title="Gravação">
        <div className="stack">
          <Toggle checked={f.recordCalls} onChange={(v) => set('recordCalls', v)} disabled={disabled} label="Gravar ligações" />
          <Field label="Aviso de gravação" hint="Lido no início da ligação quando a gravação está ligada. Deve mencionar a gravação.">
            <textarea rows={2} value={f.recordingNotice} onChange={(e) => set('recordingNotice', e.target.value)} disabled={disabled} maxLength={500} />
          </Field>
        </div>
      </Card>

      <Card title="Limites e tentativas">
        <div className="grid-4 gap-sm">
          <Field label="Tentativas por contato" hint="1 a 5">
            <input type="number" min={1} max={5} value={f.maxAttempts} disabled={disabled} onChange={(e) => set('maxAttempts', Number(e.target.value))} />
          </Field>
          <Field label="Intervalo entre tentativas (min)" hint="mín. 15">
            <input type="number" min={15} value={f.retryDelayMinutes} disabled={disabled} onChange={(e) => set('retryDelayMinutes', Number(e.target.value))} />
          </Field>
          <Field label="Ligações simultâneas" hint="1 a 50">
            <input type="number" min={1} max={50} value={f.maxConcurrent} disabled={disabled} onChange={(e) => set('maxConcurrent', Number(e.target.value))} />
          </Field>
          <Field label="Máximo de falas por ligação" hint="2 a 30">
            <input type="number" min={2} max={30} value={f.maxTurns} disabled={disabled} onChange={(e) => set('maxTurns', Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      {canManage ? (
        <div className="row end">
          <Button variant="primary" onClick={save} loading={saving}>
            Salvar configurações
          </Button>
        </div>
      ) : (
        <p className="small muted">Apenas proprietário ou administrador podem alterar estas configurações.</p>
      )}
    </div>
  )
}
