import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, FileText, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { ALL_CHANNELS, CHANNEL_LABEL } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Channel, LibraryTemplate, MessageTemplate } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Tabs, useLoad } from '../components/ui'

export const TEMPLATE_VARIABLES = ['{{nome}}', '{{primeiro_nome}}', '{{empresa}}', '{{minha_empresa}}', '{{data}}', '{{hora}}', '{{valor}}', '{{link}}']

function groupBy<T>(items: T[], key: (t: T) => string) {
  const map = new Map<string, T[]>()
  for (const i of items) {
    const k = key(i) || 'Geral'
    map.set(k, [...(map.get(k) || []), i])
  }
  return [...map.entries()]
}

export default function Templates() {
  const [tab, setTab] = useState<'mine' | 'library'>('mine')
  const mine = useLoad(() => get<{ items: MessageTemplate[]; limit: number | null }>('/templates'))
  return (
    <div className="page">
      <PageHeader title="Templates" subtitle="Mensagens prontas para campanhas, automações e atendimento." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'mine', label: 'Meus templates' },
          { value: 'library', label: 'Modelos prontos' },
        ]}
      />
      {tab === 'mine' ? <MyTemplates data={mine} /> : <Library onUsed={() => { mine.reload(true); setTab('mine') }} />}
    </div>
  )
}

function Library({ onUsed }: { onUsed: () => void }) {
  const fb = useFeedback()
  const { embedded, canManage } = useAuthed()
  const lib = useLoad(() => get<{ unlocked: boolean; items: LibraryTemplate[] }>('/templates/library'))
  const [busy, setBusy] = useState('')

  async function use(t: LibraryTemplate) {
    setBusy(t.key)
    try {
      await post(`/templates/library/${t.key}/use`)
      fb.success(`“${t.name}” copiado para Meus templates. Ajuste o texto se quiser.`)
      onUsed()
    } catch (e) {
      fb.fail(e)
    } finally {
      setBusy('')
    }
  }

  if (lib.loading && !lib.data) return <Loading />
  if (lib.error) return <ErrorBox error={lib.error} onRetry={lib.reload} />
  if (!lib.data) return null
  return (
    <div className="stack">
      {!lib.data.unlocked && (
        <Alert tone="amber" title={<span className="row gap-sm"><Lock size={16} /> Prévia dos modelos</span>}>
          Conteúdo completo liberado no teste de 14 dias e nos planos pagos.{' '}
          {!embedded && canManage && <Link to="/assinatura">Cadastrar forma de pagamento</Link>}
        </Alert>
      )}
      {groupBy(lib.data.items, (t) => t.segment).map(([segment, items]) => (
        <section key={segment} className="stack">
          <h3 className="section-title">{segment}</h3>
          <div className="cards-list">
            {items.map((t) => (
              <Card key={t.key} title={t.name}>
                <div className={`message-preview ${lib.data!.unlocked ? '' : 'locked'}`}>{t.body}</div>
                {t.variables.length > 0 && (
                  <div className="row wrap gap-xs">
                    {t.variables.map((v) => (
                      <code key={v} className="small">
                        {v}
                      </code>
                    ))}
                  </div>
                )}
                <div className="row end">
                  <Button size="sm" variant={lib.data!.unlocked ? 'primary' : 'secondary'} icon={lib.data!.unlocked ? <Copy size={14} /> : <Lock size={14} />} onClick={() => use(t)} loading={busy === t.key}>
                    Usar este modelo
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function MyTemplates({ data }: { data: ReturnType<typeof useLoad<{ items: MessageTemplate[]; limit: number | null }>> }) {
  const fb = useFeedback()
  const [editing, setEditing] = useState<Partial<MessageTemplate> | null>(null)
  const items = data.data?.items || []
  const limit = data.data?.limit ?? null
  const full = limit !== null && items.length >= limit

  async function remove(t: MessageTemplate) {
    if (!confirm(`Excluir o template “${t.name}”?`)) return
    try {
      await del(`/templates/${t.id}`)
      data.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  function create() {
    if (full) return fb.showUpgrade({ code: 'PLAN_LIMIT', message: `Seu plano permite até ${limit} templates. No PRO não há esse limite.` })
    setEditing({})
  }

  if (data.loading && !data.data) return <Loading />
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />
  return (
    <div className="stack">
      <div className="toolbar">
        {limit !== null && (
          <span className={`small ${full ? 'text-amber' : 'muted'}`}>
            {items.length} de {limit} templates do plano
          </span>
        )}
        <div className="grow" />
        <Button variant="primary" icon={<Plus size={16} />} onClick={create}>
          Novo template
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title="Nenhum template ainda">
          Crie um do zero ou copie um dos modelos prontos.
        </EmptyState>
      ) : (
        groupBy(items, (t) => t.segment).map(([segment, list]) => (
          <section key={segment} className="stack">
            <h3 className="section-title">{segment}</h3>
            <div className="cards-list">
              {list.map((t) => (
                <Card
                  key={t.id}
                  title={t.name}
                  actions={t.channel ? <Badge tone="gray">{CHANNEL_LABEL[t.channel]}</Badge> : undefined}
                >
                  {t.subject && (
                    <div className="small">
                      <strong>Assunto:</strong> {t.subject}
                    </div>
                  )}
                  <div className="message-preview">{t.body}</div>
                  <div className="row end gap-sm">
                    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(t)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(t)}>
                      Excluir
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
      {editing && (
        <TemplateForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            data.reload(true)
          }}
        />
      )}
    </div>
  )
}

function TemplateForm({ initial, onClose, onSaved }: { initial: Partial<MessageTemplate>; onClose: () => void; onSaved: () => void }) {
  const fb = useFeedback()
  const [f, setF] = useState({
    name: initial.name || '',
    segment: initial.segment || '',
    channel: (initial.channel || '') as Channel | '',
    subject: initial.subject || '',
    body: initial.body || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setError('')
    if (!f.name.trim() || !f.body.trim()) return setError('Informe nome e texto.')
    const body = {
      name: f.name.trim(),
      segment: f.segment.trim() || undefined,
      channel: f.channel || null,
      subject: f.subject.trim() || null,
      body: f.body.trim(),
    }
    setLoading(true)
    try {
      if (initial.id) await patch(`/templates/${initial.id}`, body)
      else await post('/templates', body)
      fb.success('Template salvo.')
      onSaved()
    } catch (e: any) {
      if (e?.status === 402) fb.fail(e)
      else setError(e?.message || 'Não foi possível salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial.id ? 'Editar template' : 'Novo template'}
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
        <div className="grid-3 gap-sm">
          <Field label="Nome">
            <input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Segmento (opcional)">
            <input value={f.segment} maxLength={60} placeholder="Geral" onChange={(e) => setF({ ...f, segment: e.target.value })} />
          </Field>
          <Field label="Canal (opcional)">
            <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as Channel | '' })}>
              <option value="">Qualquer canal</option>
              {ALL_CHANNELS.filter((c) => c !== 'VOICE').map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(f.channel === 'EMAIL' || f.channel === '') && (
          <Field label="Assunto do e-mail (opcional)">
            <input value={f.subject} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </Field>
        )}
        <Field label="Texto" hint={`${f.body.length}/4096 caracteres`}>
          <textarea rows={7} value={f.body} maxLength={4096} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="row wrap gap-xs">
          <span className="small muted">Variáveis:</span>
          {TEMPLATE_VARIABLES.map((v) => (
            <button key={v} className="chip" onClick={() => setF((x) => ({ ...x, body: `${x.body}${v}` }))}>
              {v}
            </button>
          ))}
        </div>
        <p className="small muted">{'{{nome}}'}, {'{{primeiro_nome}}'} e {'{{empresa}}'} vêm do contato; {'{{minha_empresa}}'} é o nome da sua empresa; {'{{data}}'}, {'{{hora}}'}, {'{{valor}}'} e {'{{link}}'} vêm do evento da automação ou da integração.</p>
      </div>
    </Modal>
  )
}
