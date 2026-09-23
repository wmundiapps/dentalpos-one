import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Ban, Bot, MessageSquarePlus, Pencil, Phone, PhoneCall, ShieldCheck, StickyNote, Trash2 } from 'lucide-react'
import { del, get, post } from '../lib/api'
import {
  ALL_CHANNELS,
  CALL_OUTCOME,
  CALL_STATUS,
  CHANNEL_LABEL,
  MESSAGE_STATUS,
  SOURCE_LABEL,
  SUPPRESSION_REASON,
  contactAddress,
  fmtDateTime,
  fmtDuration,
  fmtPhone,
  toLocalInput,
} from '../lib/format'
import type { Call, Channel, ContactDetail, TimelineItem } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Drawer, EmptyState, ErrorBox, Field, Loading, Modal, Tabs, useLoad } from '../components/ui'

export function CallTranscript({ call }: { call: Call }) {
  if (!call.turns?.length) return <p className="small muted">Sem transcrição.</p>
  return (
    <div className="transcript">
      {call.turns.map((t) => (
        <div key={t.id} className={`turn turn-${t.role.toLowerCase()}`}>
          <span className="turn-role">{t.role === 'AGENT' ? 'Agente' : t.role === 'CONTACT' ? 'Contato' : 'Sistema'}</span>
          <span>
            {t.text}
            {t.dtmf ? ` [tecla ${t.dtmf}]` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false)
  if (item.type === 'message') {
    const m = item.data
    return (
      <div className={`tl-item tl-msg ${m.direction === 'IN' ? 'in' : 'out'}`}>
        <div className="tl-icon">{m.direction === 'IN' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</div>
        <div className="tl-body">
          <div className="tl-meta">
            <Badge tone="gray">{CHANNEL_LABEL[m.channel]}</Badge>
            <span>{m.direction === 'IN' ? 'Recebida' : 'Enviada'}</span>
            {m.aiGenerated && (
              <span className="row gap-xs">
                <Bot size={12} /> IA
              </span>
            )}
            {m.campaignId && <span>campanha</span>}
            <span className="muted">{fmtDateTime(m.createdAt)}</span>
            {m.direction === 'OUT' && <span className={m.status === 'FAILED' || m.status === 'BLOCKED' ? 'text-red' : 'muted'}>{MESSAGE_STATUS[m.status] || m.status}</span>}
          </div>
          {m.subject && <div className="strong small">{m.subject}</div>}
          <div className="tl-text">{m.content}</div>
          {m.error && <div className="small text-red">{m.error}</div>}
        </div>
      </div>
    )
  }
  if (item.type === 'call') {
    const c = item.data
    return (
      <div className="tl-item tl-call">
        <div className="tl-icon">
          <Phone size={14} />
        </div>
        <div className="tl-body">
          <div className="tl-meta">
            <Badge tone={CALL_STATUS[c.status]?.tone}>{CALL_STATUS[c.status]?.label || c.status}</Badge>
            {c.outcome && <Badge tone="indigo">{CALL_OUTCOME[c.outcome] || c.outcome}</Badge>}
            <span>{c.direction === 'INBOUND' ? 'Ligação recebida' : 'Ligação automática'}</span>
            <span className="muted">{fmtDateTime(c.createdAt)}</span>
            {c.durationSec ? <span className="muted">{fmtDuration(c.durationSec)}</span> : null}
          </div>
          {c.purpose && <div className="small">Objetivo: {c.purpose}</div>}
          {c.summary && <div className="tl-text">{c.summary}</div>}
          {c.error && <div className="small text-red">{c.error}</div>}
          <div className="row gap-sm">
            {!!c.turns?.length && (
              <button className="link-btn small" onClick={() => setOpen(!open)}>
                {open ? 'Ocultar transcrição' : `Ver transcrição (${c.turns.length})`}
              </button>
            )}
            {c.recordingUrl && (
              <a className="small" href={c.recordingUrl} target="_blank" rel="noreferrer">
                Ouvir gravação
              </a>
            )}
          </div>
          {open && <CallTranscript call={c} />}
        </div>
      </div>
    )
  }
  const n = item.data
  return (
    <div className="tl-item tl-note">
      <div className="tl-icon">
        <StickyNote size={14} />
      </div>
      <div className="tl-body">
        <div className="tl-meta">
          <span>{n.kind === 'CALL_SUMMARY' ? 'Resumo de ligação' : n.kind === 'APPOINTMENT_REQUEST' ? 'Pedido de agendamento' : n.kind === 'SYSTEM' ? 'Sistema' : 'Nota'}</span>
          <span className="muted">{fmtDateTime(n.createdAt)}</span>
        </div>
        <div className="tl-text">{n.body}</div>
      </div>
    </div>
  )
}

export function ContactDrawer({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (c: ContactDetail) => void; onChanged: () => void }) {
  const fb = useFeedback()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'timeline' | 'dados' | 'consentimento'>('timeline')
  const contact = useLoad(() => get<ContactDetail>(`/contacts/${id}`), [id])
  const timeline = useLoad(() => get<TimelineItem[]>(`/contacts/${id}/timeline`), [id])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [startOpen, setStartOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [consentFor, setConsentFor] = useState<{ channel: Channel; granted: boolean } | null>(null)

  const c = contact.data

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    try {
      await post(`/contacts/${id}/notes`, { body: note.trim() })
      setNote('')
      timeline.reload(true)
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!c || !confirm(`Excluir ${c.name}? O histórico de mensagens é mantido, mas o contato sai do CRM. Bloqueios (opt-out) continuam valendo.`)) return
    try {
      await del(`/contacts/${id}`)
      fb.success('Contato excluído.')
      onChanged()
      onClose()
    } catch (e) {
      fb.fail(e)
    }
  }

  const channels = c ? ALL_CHANNELS.filter((ch) => contactAddress(c, ch)) : []
  const isBlocked = (ch: Channel) => {
    if (!c) return false
    const addr = contactAddress(c, ch)
    return c.suppressions.some((s) => s.channel === ch && (s.contactId === c.id || s.value === addr))
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={c ? c.name : 'Contato'}
      actions={
        c && (
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => onEdit(c)}>
            Editar
          </Button>
        )
      }
    >
      {contact.loading && !c && <Loading />}
      <ErrorBox error={contact.error} onRetry={contact.reload} />
      {c && (
        <>
          <div className="contact-head">
            <div className="small muted">
              {[c.phone && fmtPhone(c.phone), c.email, c.company].filter(Boolean).join(' · ') || 'Sem telefone ou e-mail'}
            </div>
            <div className="row wrap gap-xs">
              {c.tags.map((t) => (
                <Badge key={t.id} tone="indigo">
                  {t.name}
                </Badge>
              ))}
            </div>
            <div className="row wrap gap-sm">
              <Button size="sm" variant="primary" icon={<MessageSquarePlus size={14} />} onClick={() => setStartOpen(true)} disabled={!channels.some((ch) => ch !== 'VOICE')}>
                Iniciar conversa
              </Button>
              <Button size="sm" icon={<PhoneCall size={14} />} onClick={() => setCallOpen(true)} disabled={!c.phone}>
                Agendar ligação
              </Button>
            </div>
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'timeline', label: 'Histórico' },
              { value: 'dados', label: 'Dados' },
              { value: 'consentimento', label: 'Consentimento' },
            ]}
          />

          {tab === 'timeline' && (
            <div className="stack">
              <div className="note-box">
                <textarea rows={2} placeholder="Escreva uma nota interna…" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" onClick={addNote} loading={saving} disabled={!note.trim()}>
                  Adicionar nota
                </Button>
              </div>
              {timeline.loading && !timeline.data && <Loading />}
              <ErrorBox error={timeline.error} onRetry={timeline.reload} />
              {timeline.data?.length === 0 && <EmptyState title="Sem histórico ainda" />}
              <div className="timeline">
                {timeline.data?.map((i) => (
                  <TimelineEntry key={`${i.type}-${i.data.id}`} item={i} />
                ))}
              </div>
            </div>
          )}

          {tab === 'dados' && (
            <dl className="details">
              <dt>Telefone</dt>
              <dd>{c.phone ? fmtPhone(c.phone) : '—'}</dd>
              <dt>E-mail</dt>
              <dd>{c.email || '—'}</dd>
              <dt>Empresa</dt>
              <dd>{c.company || '—'}</dd>
              <dt>CPF/CNPJ</dt>
              <dd>{c.document || '—'}</dd>
              <dt>Telegram</dt>
              <dd>{c.telegramChatId || '—'}</dd>
              <dt>Instagram / Messenger</dt>
              <dd>{[c.instagramId, c.messengerId].filter(Boolean).join(' / ') || '—'}</dd>
              <dt>Origem</dt>
              <dd>{SOURCE_LABEL[c.source] || c.source}</dd>
              <dt>Criado em</dt>
              <dd>{fmtDateTime(c.createdAt)}</dd>
              <dt>Última interação</dt>
              <dd>{fmtDateTime(c.lastInteractionAt)}</dd>
              {c.notes && (
                <>
                  <dt>Observações</dt>
                  <dd className="pre">{c.notes}</dd>
                </>
              )}
              {c.customFields &&
                Object.entries(c.customFields)
                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt>{k}</dt>
                      <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
              <div className="contents">
                <dt />
                <dd>
                  <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={remove}>
                    Excluir contato
                  </Button>
                </dd>
              </div>
            </dl>
          )}

          {tab === 'consentimento' && (
            <div className="stack">
              <p className="small muted">Quem pede para não receber (SAIR, pedido verbal, link de descadastro) é bloqueado automaticamente no canal. Para desbloquear, registre a evidência do novo consentimento.</p>
              {channels.length === 0 && <p className="muted">Contato sem endereço em nenhum canal.</p>}
              <ul className="list">
                {channels.map((ch) => {
                  const blocked = isBlocked(ch)
                  return (
                    <li key={ch} className="list-row">
                      <div>
                        <div className="strong">{CHANNEL_LABEL[ch]}</div>
                        <div className="small muted">{ch === 'EMAIL' ? contactAddress(c, ch) : fmtPhone(contactAddress(c, ch)) || contactAddress(c, ch)}</div>
                      </div>
                      <div className="row gap-sm">
                        {blocked ? (
                          <>
                            <Badge tone="red">
                              <Ban size={12} /> Bloqueado
                            </Badge>
                            <Button size="sm" onClick={() => setConsentFor({ channel: ch, granted: true })}>
                              Desbloquear
                            </Button>
                          </>
                        ) : (
                          <>
                            <Badge tone="green">
                              <ShieldCheck size={12} /> Liberado
                            </Badge>
                            <Button size="sm" variant="ghost" onClick={() => setConsentFor({ channel: ch, granted: false })}>
                              Bloquear
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {c.suppressions.length > 0 && (
                <>
                  <h4>Bloqueios</h4>
                  <ul className="list small">
                    {c.suppressions.map((s) => (
                      <li key={s.id} className="list-row">
                        <span>
                          {CHANNEL_LABEL[s.channel]} · {SUPPRESSION_REASON[s.reason] || s.reason}
                          {s.detail ? ` — ${s.detail}` : ''}
                        </span>
                        <span className="muted">{fmtDateTime(s.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {c.consents.length > 0 && (
                <>
                  <h4>Histórico de consentimento</h4>
                  <ul className="list small">
                    {c.consents.map((s) => (
                      <li key={s.id} className="list-row">
                        <span>
                          {CHANNEL_LABEL[s.channel]} · {s.granted ? 'Autorizou' : 'Revogou'} ({s.source})
                          {s.evidence ? ` — ${s.evidence}` : ''}
                        </span>
                        <span className="muted">{fmtDateTime(s.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {startOpen && (
            <StartConversationModal
              contact={c}
              channels={channels.filter((ch) => ch !== 'VOICE')}
              onClose={() => setStartOpen(false)}
              onStarted={(convId) => navigate(`/inbox?c=${convId}`)}
            />
          )}
          {callOpen && (
            <ScheduleCallModal
              contactId={c.id}
              onClose={() => setCallOpen(false)}
              onDone={() => {
                setCallOpen(false)
                timeline.reload(true)
              }}
            />
          )}
          {consentFor && (
            <ConsentModal
              contactId={c.id}
              channel={consentFor.channel}
              granted={consentFor.granted}
              onClose={() => setConsentFor(null)}
              onDone={() => {
                setConsentFor(null)
                contact.reload(true)
              }}
            />
          )}
        </>
      )}
    </Drawer>
  )
}

function StartConversationModal({ contact, channels, onClose, onStarted }: { contact: ContactDetail; channels: Channel[]; onClose: () => void; onStarted: (id: string) => void }) {
  const fb = useFeedback()
  const [channel, setChannel] = useState<Channel>(channels[0])
  const [text, setText] = useState(`Olá, ${contact.name.split(' ')[0]}! `)
  const [tplName, setTplName] = useState('')
  const [tplLang, setTplLang] = useState('pt_BR')
  const [tplParams, setTplParams] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    setLoading(true)
    setError('')
    try {
      const template = channel === 'WHATSAPP' && tplName.trim() ? { name: tplName.trim(), language: tplLang || 'pt_BR', params: tplParams.split('\n').map((p) => p.trim()).filter(Boolean) } : undefined
      const r = await post<{ conversationId: string }>('/conversations', { contactId: contact.id, channel, text, template })
      fb.success('Mensagem enviada.')
      onStarted(r.conversationId)
    } catch (e: any) {
      if (e?.status === 402) fb.fail(e)
      else {
        setError(e?.message || 'Falha no envio.')
        if (e?.code === 'WHATSAPP_TEMPLATE_REQUIRED') setTplOpen(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Iniciar conversa"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={send} loading={loading} disabled={!text.trim()}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Canal">
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {channels.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_LABEL[ch]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mensagem">
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {channel === 'WHATSAPP' && (
          <details className="details-box" open={tplOpen} onToggle={(e) => setTplOpen((e.target as HTMLDetailsElement).open)}>
            <summary>Modelo aprovado do WhatsApp (API oficial)</summary>
            <p className="small muted">Na API oficial da Meta, fora da janela de 24h desde a última mensagem do cliente, só é possível enviar modelos aprovados.</p>
            <div className="grid-2 gap-sm">
              <Field label="Nome do modelo">
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="ex.: lembrete_consulta" />
              </Field>
              <Field label="Idioma">
                <input value={tplLang} onChange={(e) => setTplLang(e.target.value)} />
              </Field>
            </div>
            <Field label="Parâmetros (um por linha)">
              <textarea rows={2} value={tplParams} onChange={(e) => setTplParams(e.target.value)} />
            </Field>
          </details>
        )}
      </div>
    </Modal>
  )
}

export function ScheduleCallModal({ contactId, onClose, onDone }: { contactId: string; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [purpose, setPurpose] = useState('')
  const [script, setScript] = useState('')
  const [at, setAt] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    try {
      await post('/voice/calls', { contactId, purpose, script: script || undefined, at: at ? new Date(at).toISOString() : undefined })
      fb.success('Ligação agendada. Ela respeita os horários permitidos em REVAH Voice.')
      onDone()
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
      title="Agendar ligação automática"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!purpose.trim()}>
            Agendar
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Objetivo da ligação" hint="Ex.: confirmar consulta de amanhã às 14h.">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Roteiro (opcional)" hint="Informações que o agente deve passar ou perguntar.">
          <textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} maxLength={4000} />
        </Field>
        <Field label="Quando (opcional)" hint="Vazio = próximo horário permitido.">
          <input type="datetime-local" value={at} min={toLocalInput(new Date())} onChange={(e) => setAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ConsentModal({ contactId, channel, granted, onClose, onDone }: { contactId: string; channel: Channel; granted: boolean; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [evidence, setEvidence] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit() {
    setLoading(true)
    try {
      await post(`/contacts/${contactId}/consent`, { channel, granted, evidence: evidence.trim() || undefined })
      fb.success(granted ? 'Canal desbloqueado.' : 'Canal bloqueado.')
      onDone()
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
      title={granted ? `Desbloquear ${CHANNEL_LABEL[channel]}` : `Bloquear ${CHANNEL_LABEL[channel]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={granted ? 'primary' : 'danger'} onClick={submit} loading={loading} disabled={granted && !evidence.trim()}>
            {granted ? 'Desbloquear' : 'Bloquear'}
          </Button>
        </>
      }
    >
      <Field
        label={granted ? 'Evidência do consentimento (obrigatória)' : 'Motivo (opcional)'}
        hint={granted ? 'Ex.: "cliente pediu por WhatsApp em 10/09 para voltar a receber".' : undefined}
      >
        <textarea rows={3} maxLength={500} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </Field>
    </Modal>
  )
}
