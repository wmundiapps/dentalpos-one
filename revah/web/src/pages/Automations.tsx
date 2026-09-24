import { useState } from 'react'
import { ArrowDown, ArrowUp, Bot, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { CHANNEL_LABEL } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Automation, AutomationAction, Channel } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Toggle, useLoad } from '../components/ui'

interface Trigger {
  key: string
  label: string
}

const MSG_CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'TELEGRAM', 'EMAIL', 'INSTAGRAM', 'MESSENGER']

const ACTION_LABEL: Record<AutomationAction['type'], string> = {
  send_message: 'Enviar mensagem',
  place_call: 'Fazer ligação',
  add_tag: 'Adicionar etiqueta',
  remove_tag: 'Remover etiqueta',
  webhook: 'Chamar webhook',
}

function delayText(min?: number) {
  if (!min) return 'imediatamente'
  if (min % 1440 === 0) return `após ${min / 1440} dia(s)`
  if (min % 60 === 0) return `após ${min / 60} h`
  return `após ${min} min`
}

function describe(a: AutomationAction) {
  switch (a.type) {
    case 'send_message':
      return `${ACTION_LABEL[a.type]} por ${CHANNEL_LABEL[a.channel]}`
    case 'place_call':
      return `Ligação: ${a.purpose}`
    case 'add_tag':
    case 'remove_tag':
      return `${ACTION_LABEL[a.type]} “${a.tag}”`
    case 'webhook':
      return `Webhook ${a.url}`
  }
}

export default function Automations() {
  const fb = useFeedback()
  const { session } = useAuthed()
  const list = useLoad(() => get<Automation[]>('/automations'))
  const triggers = useLoad(() => get<Trigger[]>('/automations/triggers'))
  const [editing, setEditing] = useState<Partial<Automation> | null>(null)
  const [installing, setInstalling] = useState(false)
  const isDentalpos = session.tenant.source === 'DENTALPOS'
  const triggerLabel = (k: string) => triggers.data?.find((t) => t.key === k)?.label || k

  async function install() {
    setInstalling(true)
    try {
      const r = await post<{ created: number }>('/automations/templates/dentalpos')
      fb.success(r.created ? `${r.created} modelo(s) instalado(s) desligado(s). Revise os textos e ative os que for usar.` : 'Os modelos já estavam instalados.')
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    } finally {
      setInstalling(false)
    }
  }

  async function toggle(a: Automation, isActive: boolean) {
    list.setData((l) => l?.map((x) => (x.id === a.id ? { ...x, isActive } : x)) || null)
    try {
      await patch(`/automations/${a.id}`, { isActive })
    } catch (e) {
      fb.fail(e)
      list.reload(true)
    }
  }

  async function remove(a: Automation) {
    if (!confirm(`Excluir a automação “${a.name}”?`)) return
    try {
      await del(`/automations/${a.id}`)
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Automações"
        subtitle="Quando algo acontece, o sistema envia mensagens, liga, etiqueta ou avisa outro sistema."
        actions={
          <>
            <Button variant={isDentalpos ? 'primary' : 'ghost'} icon={<Download size={16} />} onClick={install} loading={installing}>
              Instalar modelos DentalPos One
            </Button>
            <Button variant={isDentalpos ? 'secondary' : 'primary'} icon={<Plus size={16} />} onClick={() => setEditing({ actions: [], isActive: true })}>
              Nova automação
            </Button>
          </>
        }
      />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <EmptyState icon={<Bot size={28} />} title="Nenhuma automação">
          Crie uma do zero{isDentalpos ? ' ou instale os modelos prontos para clínicas (lembrete, falta, orçamento, cobrança, recall e pós-operatório).' : '.'}
        </EmptyState>
      ) : (
        <div className="cards-list">
          {list.data?.map((a) => (
            <Card key={a.id}>
              <div className="row between gap-sm">
                <div className="min0">
                  <div className="strong">{a.name}</div>
                  <div className="small muted">
                    Quando: {triggerLabel(a.trigger)}
                    {a.conditions?.tag ? ` · se tiver a etiqueta “${a.conditions.tag}”` : ''}
                  </div>
                </div>
                <Toggle checked={a.isActive} onChange={(v) => toggle(a, v)} />
              </div>
              <ol className="action-summary">
                {a.actions.map((x, i) => (
                  <li key={i}>
                    {describe(x)} <span className="muted">— {delayText(x.delayMinutes)}</span>
                  </li>
                ))}
              </ol>
              <div className="row between">
                <span className="small muted">Executada {a.runCount} vez(es)</span>
                <div className="row gap-sm">
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(a)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(a)}>
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <AutomationEditor
          initial={editing}
          triggers={triggers.data || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            list.reload(true)
          }}
        />
      )}
    </div>
  )
}

function newAction(type: AutomationAction['type']): AutomationAction {
  switch (type) {
    case 'send_message':
      return { type, channel: 'WHATSAPP', template: '', delayMinutes: 0, optOutHint: true }
    case 'place_call':
      return { type, purpose: '', script: '', delayMinutes: 0 }
    case 'add_tag':
    case 'remove_tag':
      return { type, tag: '', delayMinutes: 0 }
    case 'webhook':
      return { type, url: '', delayMinutes: 0 }
  }
}

function AutomationEditor({ initial, triggers, onClose, onSaved }: { initial: Partial<Automation>; triggers: Trigger[]; onClose: () => void; onSaved: () => void }) {
  const fb = useFeedback()
  const [name, setName] = useState(initial.name || '')
  const [trigger, setTrigger] = useState(initial.trigger || triggers[0]?.key || 'contact.created')
  const [customTrigger, setCustomTrigger] = useState(initial.trigger && !triggers.some((t) => t.key === initial.trigger) ? initial.trigger : '')
  const [condTag, setCondTag] = useState(initial.conditions?.tag || '')
  const [actions, setActions] = useState<AutomationAction[]>(initial.actions?.length ? initial.actions : [newAction('send_message')])
  const [isActive, setIsActive] = useState(initial.isActive ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(i: number, patchObj: Partial<AutomationAction>) {
    setActions((a) => a.map((x, j) => (j === i ? ({ ...x, ...patchObj } as AutomationAction) : x)))
  }
  function move(i: number, d: -1 | 1) {
    setActions((a) => {
      const b = [...a]
      const [x] = b.splice(i, 1)
      b.splice(i + d, 0, x)
      return b
    })
  }

  async function save() {
    setError('')
    const finalTrigger = trigger === '__custom' ? customTrigger.trim() : trigger
    if (!name.trim() || !finalTrigger) return setError('Informe nome e gatilho.')
    const clean = actions.map((a) => {
      const base = { ...a, delayMinutes: Math.max(0, Math.round(Number(a.delayMinutes) || 0)) }
      if (base.type === 'send_message') {
        if (!base.subject) delete base.subject
        if (!base.waTemplate?.name) delete base.waTemplate
      }
      return base
    })
    for (const a of clean) {
      if (a.type === 'send_message' && !a.template.trim()) return setError('Preencha o texto de todas as mensagens.')
      if (a.type === 'place_call' && (!a.purpose.trim() || !a.script.trim())) return setError('Preencha objetivo e roteiro das ligações.')
      if ((a.type === 'add_tag' || a.type === 'remove_tag') && !a.tag.trim()) return setError('Informe a etiqueta.')
      if (a.type === 'webhook' && !/^https?:\/\//.test(a.url)) return setError('Informe uma URL válida (https://…) para o webhook.')
    }
    const body = { name: name.trim(), trigger: finalTrigger, conditions: condTag.trim() ? { tag: condTag.trim() } : null, actions: clean, isActive }
    setLoading(true)
    try {
      if (initial.id) await patch(`/automations/${initial.id}`, body)
      else await post('/automations', body)
      fb.success('Automação salva.')
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial.id ? 'Editar automação' : 'Nova automação'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} loading={loading}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="red">{error}</Alert>}
        <div className="grid-2 gap-sm">
          <Field label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Quando (gatilho)">
            <select value={customTrigger ? '__custom' : trigger} onChange={(e) => { setTrigger(e.target.value); if (e.target.value !== '__custom') setCustomTrigger('') }}>
              {triggers.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
              <option value="__custom">Evento da API (personalizado)</option>
            </select>
          </Field>
        </div>
        {(trigger === '__custom' || customTrigger) && (
          <Field label="Nome do evento" hint='Eventos enviados por POST /v1/events chegam como "api.<tipo>". Ex.: api.pedido_pago'>
            <input value={customTrigger} onChange={(e) => { setCustomTrigger(e.target.value); setTrigger('__custom') }} placeholder="api.meu_evento" />
          </Field>
        )}
        <Field label="Só para contatos com a etiqueta (opcional)">
          <input value={condTag} onChange={(e) => setCondTag(e.target.value)} />
        </Field>
        <Toggle checked={isActive} onChange={setIsActive} label="Ativa" />

        <h4>Ações</h4>
        {actions.map((a, i) => (
          <div key={i} className="action-card">
            <div className="row between gap-sm">
              <select value={a.type} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? newAction(e.target.value as AutomationAction['type']) : x)))}>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {i + 1}. {v}
                  </option>
                ))}
              </select>
              <div className="row gap-xs">
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ArrowUp size={16} />
                </button>
                <button className="icon-btn" disabled={i === actions.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                  <ArrowDown size={16} />
                </button>
                <button className="icon-btn" disabled={actions.length === 1} onClick={() => setActions((l) => l.filter((_, j) => j !== i))} aria-label="Remover ação">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <Field label="Esperar (minutos após o gatilho)" hint={delayText(a.delayMinutes)}>
              <input type="number" min={0} value={a.delayMinutes ?? 0} onChange={(e) => update(i, { delayMinutes: Number(e.target.value) })} />
            </Field>
            {a.type === 'send_message' && (
              <>
                <Field label="Canal">
                  <select value={a.channel} onChange={(e) => update(i, { channel: e.target.value as Channel })}>
                    {MSG_CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                {a.channel === 'EMAIL' && (
                  <Field label="Assunto">
                    <input value={a.subject || ''} onChange={(e) => update(i, { subject: e.target.value })} />
                  </Field>
                )}
                <Field label="Mensagem" hint="Variáveis: {{nome}}, {{primeiro_nome}}, {{empresa}}, {{minha_empresa}} e dados do evento (ex.: {{data}}, {{hora}}).">
                  <textarea rows={4} value={a.template} onChange={(e) => update(i, { template: e.target.value })} />
                </Field>
                {a.channel === 'WHATSAPP' && (
                  <details className="details-box" open={Boolean(a.waTemplate?.name)}>
                    <summary>Modelo aprovado do WhatsApp (opcional)</summary>
                    <div className="grid-2 gap-sm">
                      <Field label="Nome do modelo">
                        <input value={a.waTemplate?.name || ''} onChange={(e) => update(i, { waTemplate: { ...(a.waTemplate || { name: '' }), name: e.target.value } })} />
                      </Field>
                      <Field label="Idioma">
                        <input value={a.waTemplate?.language || 'pt_BR'} onChange={(e) => update(i, { waTemplate: { ...(a.waTemplate || { name: '' }), language: e.target.value } })} />
                      </Field>
                    </div>
                    <Field label="Parâmetros (um por linha)">
                      <textarea
                        rows={2}
                        value={(a.waTemplate?.params || []).join('\n')}
                        onChange={(e) => update(i, { waTemplate: { ...(a.waTemplate || { name: '' }), params: e.target.value.split('\n') } })}
                      />
                    </Field>
                  </details>
                )}
                <Toggle checked={a.optOutHint ?? true} onChange={(v) => update(i, { optOutHint: v })} label="Incluir instrução de descadastro" />
              </>
            )}
            {a.type === 'place_call' && (
              <>
                <Field label="Objetivo">
                  <input value={a.purpose} onChange={(e) => update(i, { purpose: e.target.value })} maxLength={300} />
                </Field>
                <Field label="Roteiro">
                  <textarea rows={4} value={a.script} onChange={(e) => update(i, { script: e.target.value })} maxLength={4000} />
                </Field>
              </>
            )}
            {(a.type === 'add_tag' || a.type === 'remove_tag') && (
              <Field label="Etiqueta">
                <input value={a.tag} onChange={(e) => update(i, { tag: e.target.value })} maxLength={60} />
              </Field>
            )}
            {a.type === 'webhook' && (
              <Field label="URL" hint="Recebe um POST com o evento e o contato.">
                <input type="url" value={a.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://" />
              </Field>
            )}
          </div>
        ))}
        {actions.length < 10 && (
          <Button icon={<Plus size={16} />} onClick={() => setActions([...actions, newAction('send_message')])}>
            Adicionar ação
          </Button>
        )}
        <Badge tone="gray">Ligações exigem plano com voz e respeitam os horários de REVAH Voice.</Badge>
      </div>
    </Modal>
  )
}
