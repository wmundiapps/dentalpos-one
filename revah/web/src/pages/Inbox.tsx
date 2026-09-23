import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, CheckCheck, Hand, MessageSquare, Send, UserRound, XCircle } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { ALL_CHANNELS, CHANNEL_LABEL, CONVERSATION_STATUS, MESSAGE_STATUS, fmtPhone, fmtRelative, initials } from '../lib/format'
import type { Conversation, ConversationDetail } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, EmptyState, ErrorBox, Field, Loading, Tabs, useDebounced, useLoad, usePolling } from '../components/ui'

type Filter = 'OPEN' | 'BOT' | 'HUMAN' | 'CLOSED' | 'ALL'

export default function Inbox() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [channel, setChannel] = useState('')
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const selectedId = params.get('c')

  const list = useLoad(
    () => get<Conversation[]>('/conversations', { status: filter === 'ALL' ? '' : filter, channel, q: dq, mine: mine ? '1' : '' }),
    [filter, channel, dq, mine],
  )
  usePolling(() => list.reload(true), 8000)

  function select(id: string | null) {
    const p = new URLSearchParams(params)
    if (id) p.set('c', id)
    else p.delete('c')
    setParams(p)
  }

  return (
    <div className={`inbox ${selectedId ? 'has-selection' : ''}`}>
      <div className="inbox-list">
        <div className="inbox-list-head">
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'OPEN', label: 'Abertas' },
              { value: 'BOT', label: 'Bot' },
              { value: 'HUMAN', label: 'Humano' },
              { value: 'CLOSED', label: 'Encerradas' },
              { value: 'ALL', label: 'Todas' },
            ]}
          />
          <div className="row gap-sm">
            <input className="grow" type="search" placeholder="Buscar contato" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
              <option value="">Todos os canais</option>
              {ALL_CHANNELS.filter((c) => c !== 'VOICE').map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <label className="check small">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só as atribuídas a mim
          </label>
        </div>
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? (
          <Loading />
        ) : list.data?.length === 0 ? (
          <EmptyState icon={<MessageSquare size={28} />} title="Nenhuma conversa aqui">
            As conversas aparecem quando um contato responde ou quando você inicia uma pelo CRM.
          </EmptyState>
        ) : (
          <ul className="conv-list">
            {list.data?.map((c) => (
              <li key={c.id}>
                <button className={`conv-item ${selectedId === c.id ? 'active' : ''}`} onClick={() => select(c.id)}>
                  <span className="avatar">{initials(c.contact.name)}</span>
                  <span className="conv-main">
                    <span className="conv-top">
                      <span className="strong ellipsis">{c.contact.name}</span>
                      <span className="small muted nowrap">{fmtRelative(c.lastMessageAt)}</span>
                    </span>
                    <span className="conv-bottom">
                      <span className="small muted ellipsis">
                        {c.lastMessage ? `${c.lastMessage.direction === 'OUT' ? 'Você: ' : ''}${c.lastMessage.content}` : '—'}
                      </span>
                      {c.unreadCount > 0 && <span className="unread">{c.unreadCount}</span>}
                    </span>
                    <span className="row gap-xs">
                      <Badge tone="gray">{CHANNEL_LABEL[c.channel]}</Badge>
                      <Badge tone={CONVERSATION_STATUS[c.status].tone}>{CONVERSATION_STATUS[c.status].label}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="inbox-view">
        {selectedId ? (
          <ConversationView key={selectedId} id={selectedId} onBack={() => select(null)} onChanged={() => list.reload(true)} onSelect={select} />
        ) : (
          <EmptyState icon={<MessageSquare size={28} />} title="Selecione uma conversa" />
        )}
      </div>
    </div>
  )
}

function ConversationView({ id, onBack, onChanged, onSelect }: { id: string; onBack: () => void; onChanged: () => void; onSelect: (id: string) => void }) {
  const fb = useFeedback()
  const conv = useLoad(() => get<ConversationDetail>(`/conversations/${id}`), [id])
  usePolling(() => conv.reload(true), 8000)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<{ message: string; code?: string } | null>(null)
  const [useTpl, setUseTpl] = useState(false)
  const [tpl, setTpl] = useState({ name: '', language: 'pt_BR', params: '' })
  const endRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  const c = conv.data
  useEffect(() => {
    if (c && c.messages.length !== lastCount.current) {
      lastCount.current = c.messages.length
      endRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [c])

  async function setStatus(status: 'BOT' | 'HUMAN' | 'CLOSED') {
    try {
      await post(`/conversations/${id}/status`, { status })
      fb.success(status === 'HUMAN' ? 'Você assumiu o atendimento.' : status === 'BOT' ? 'Conversa devolvida ao bot.' : 'Conversa encerrada.')
      conv.reload(true)
      onChanged()
    } catch (e) {
      fb.fail(e)
    }
  }

  async function send() {
    if (!text.trim() && !(useTpl && tpl.name)) return
    setSending(true)
    setSendError(null)
    try {
      const template = useTpl && tpl.name.trim() ? { name: tpl.name.trim(), language: tpl.language || 'pt_BR', params: tpl.params.split('\n').map((p) => p.trim()).filter(Boolean) } : undefined
      await post(`/conversations/${id}/messages`, { text: text.trim() || `[modelo ${tpl.name}]`, template })
      setText('')
      conv.reload(true)
      onChanged()
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) fb.fail(e)
      else {
        const err = e as ApiError
        setSendError({ message: err.message, code: err.code })
        if (err.code === 'WHATSAPP_TEMPLATE_REQUIRED') setUseTpl(true)
        conv.reload(true)
      }
    } finally {
      setSending(false)
    }
  }

  if (conv.loading && !c) return <Loading />
  if (conv.error && !c) return <ErrorBox error={conv.error} onRetry={conv.reload} />
  if (!c) return null

  const status = CONVERSATION_STATUS[c.status]
  return (
    <div className="conv">
      <div className="conv-head">
        <button className="icon-btn only-mobile" onClick={onBack} aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div className="grow min0">
          <Link to={`/contatos?id=${c.contact.id}`} className="strong ellipsis">
            {c.contact.name}
          </Link>
          <div className="small muted ellipsis">
            {CHANNEL_LABEL[c.channel]} · {c.channel === 'EMAIL' ? c.contact.email : fmtPhone(c.contact.phone)}
            {c.channelAccount ? ` · via ${c.channelAccount.label}` : ''}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="conv-actions">
        {c.status !== 'HUMAN' && (
          <Button size="sm" variant="primary" icon={<Hand size={14} />} onClick={() => setStatus('HUMAN')}>
            Assumir atendimento
          </Button>
        )}
        {c.status !== 'BOT' && (
          <Button size="sm" icon={<Bot size={14} />} onClick={() => setStatus('BOT')}>
            Devolver ao bot
          </Button>
        )}
        {c.status !== 'CLOSED' && (
          <Button size="sm" variant="ghost" icon={<CheckCheck size={14} />} onClick={() => setStatus('CLOSED')}>
            Encerrar
          </Button>
        )}
        {c.otherChannels.length > 0 && (
          <span className="row gap-xs small muted">
            Também em:
            {c.otherChannels.map((o) => (
              <button key={o.id} className="chip" onClick={() => onSelect(o.id)}>
                {CHANNEL_LABEL[o.channel]}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="messages">
        {c.messages.length === 0 && <p className="muted center">Sem mensagens.</p>}
        {c.messages.map((m) => (
          <div key={m.id} className={`bubble-row ${m.direction === 'IN' ? 'in' : 'out'}`}>
            <div className={`bubble ${m.status === 'FAILED' || m.status === 'BLOCKED' ? 'failed' : ''}`}>
              {m.subject && <div className="strong small">{m.subject}</div>}
              <div className="bubble-text">{m.content}</div>
              {m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="small">
                  Ver anexo
                </a>
              )}
              {m.error && (
                <div className="bubble-error">
                  <XCircle size={12} /> {m.error}
                </div>
              )}
              <div className="bubble-meta">
                {m.aiGenerated && (
                  <span className="row gap-xs">
                    <Bot size={11} /> IA
                  </span>
                )}
                {m.direction === 'OUT' && !m.aiGenerated && m.sentByUserId && (
                  <span className="row gap-xs">
                    <UserRound size={11} />
                  </span>
                )}
                <span>{fmtRelative(m.createdAt)}</span>
                {m.direction === 'OUT' && <span>{MESSAGE_STATUS[m.status] || m.status}</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="composer">
        {sendError && (
          <Alert tone="red" title="Mensagem não enviada">
            {sendError.message}
            {sendError.code === 'SUPPRESSED' && <div className="small">Este contato pediu para não receber mensagens neste canal. Veja a aba Consentimento no CRM.</div>}
          </Alert>
        )}
        {c.channel === 'WHATSAPP' && (
          <label className="check small">
            <input type="checkbox" checked={useTpl} onChange={(e) => setUseTpl(e.target.checked)} /> Enviar modelo aprovado (fora da janela de 24h)
          </label>
        )}
        {useTpl && c.channel === 'WHATSAPP' && (
          <div className="grid-3 gap-sm">
            <Field label="Modelo">
              <input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="nome_do_modelo" />
            </Field>
            <Field label="Idioma">
              <input value={tpl.language} onChange={(e) => setTpl({ ...tpl, language: e.target.value })} />
            </Field>
            <Field label="Parâmetros (um por linha)">
              <textarea rows={1} value={tpl.params} onChange={(e) => setTpl({ ...tpl, params: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="composer-row">
          <textarea
            rows={2}
            placeholder={c.status === 'BOT' ? 'Ao responder, você assume o atendimento.' : 'Escreva sua mensagem…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
                e.preventDefault()
                send()
              }
            }}
          />
          <Button variant="primary" icon={<Send size={16} />} onClick={send} loading={sending} disabled={!text.trim() && !(useTpl && tpl.name.trim())} aria-label="Enviar">
            <span className="hide-sm">Enviar</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
