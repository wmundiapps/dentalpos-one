import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Tags, Trash2, Upload, Users } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { fmtPhone, fmtRelative } from '../lib/format'
import { parseCsvRows } from '../lib/csv'
import type { Contact, ContactDetail, Tag } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { useAuthed } from '../lib/session'
import { Alert, Badge, Button, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, readFileText, useDebounced, useLoad } from '../components/ui'
import { ContactDrawer } from './ContactDrawer'

interface ContactsPage {
  total: number
  page: number
  pageSize: number
  items: Contact[]
}

const splitTags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

export default function Contacts() {
  const fb = useFeedback()
  const { session } = useAuthed()
  const csvLocked = session.tenant.limits.csvImport === false
  // CSV é recurso do PRO: no START mostra o aviso de upgrade direto (a API também bloqueia com 402).
  const openImport = () =>
    csvLocked ? fb.showUpgrade({ code: 'PLAN_FEATURE', message: 'Importação de listas externas (CSV) está disponível no plano PRO.' }) : setImportOpen(true)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tagId, setTagId] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Partial<ContactDetail> | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const openId = params.get('id')
  const [drawerVersion, setDrawerVersion] = useState(0)

  const tags = useLoad(() => get<Tag[]>('/tags'))
  const list = useLoad(() => get<ContactsPage>('/contacts', { q: dq, tagId, page, pageSize: 50 }), [dq, tagId, page])

  const items = list.data?.items || []
  const allSelected = items.length > 0 && items.every((c) => selected.has(c.id))

  function toggle(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  function openContact(id: string | null) {
    const p = new URLSearchParams(params)
    if (id) p.set('id', id)
    else p.delete('id')
    setParams(p, { replace: !id })
  }

  function refreshAll() {
    list.reload(true)
    tags.reload(true)
  }

  return (
    <div className="page">
      <PageHeader
        title="Contatos"
        subtitle={list.data ? `${list.data.total.toLocaleString('pt-BR')} contatos no CRM` : 'CRM'}
        actions={
          <>
            <Button icon={<Upload size={16} />} onClick={openImport}>
              Importar CSV {csvLocked && <Badge tone="indigo">PRO</Badge>}
            </Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({})}>
              Novo contato
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <input
          className="grow"
          type="search"
          placeholder="Buscar por nome, telefone, e-mail ou empresa"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <select
          value={tagId}
          onChange={(e) => {
            setTagId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todas as etiquetas</option>
          {tags.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.contacts})
            </option>
          ))}
        </select>
        <Button variant="ghost" icon={<Tags size={16} />} onClick={() => setTagsOpen(true)}>
          Etiquetas
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span>{selected.size} selecionado(s)</span>
          <Button size="sm" icon={<Tags size={14} />} onClick={() => setBulkOpen(true)}>
            Etiquetar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={dq || tagId ? 'Nenhum contato encontrado' : 'Seu CRM está vazio'}
          action={
            !dq &&
            !tagId && (
              <Button variant="primary" icon={<Upload size={16} />} onClick={openImport}>
                Importar planilha {csvLocked && <Badge tone="indigo">PRO</Badge>}
              </Button>
            )
          }
        >
          {!dq && !tagId && 'Importe uma planilha CSV ou cadastre contatos manualmente.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="w-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      const s = new Set(selected)
                      items.forEach((c) => (allSelected ? s.delete(c.id) : s.add(c.id)))
                      setSelected(s)
                    }}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th>Nome</th>
                <th className="hide-sm">Telefone</th>
                <th className="hide-sm">E-mail</th>
                <th>Etiquetas</th>
                <th className="hide-sm">Última interação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} onClick={() => openContact(c.id)}>
                  <td className="w-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Selecionar ${c.name}`} />
                  </td>
                  <td>
                    <div className="strong">{c.name}</div>
                    <div className="small muted show-sm">{c.phone ? fmtPhone(c.phone) : c.email}</div>
                    {c.company && <div className="small muted hide-sm">{c.company}</div>}
                  </td>
                  <td className="hide-sm nowrap">{fmtPhone(c.phone) || '—'}</td>
                  <td className="hide-sm">{c.email || '—'}</td>
                  <td>
                    <div className="row wrap gap-xs">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t.id} tone="indigo">
                          {t.name}
                        </Badge>
                      ))}
                      {c.tags.length > 3 && <span className="small muted">+{c.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td className="hide-sm small muted nowrap">{fmtRelative(c.lastInteractionAt) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}

      {openId && <ContactDrawer key={`${openId}-${drawerVersion}`} id={openId} onClose={() => openContact(null)} onEdit={(c) => setEditing(c)} onChanged={refreshAll} />}
      {editing && (
        <ContactForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null)
            refreshAll()
            // Recarrega o drawer aberto (ou abre o contato recém-criado).
            if (openId === id) setDrawerVersion((v) => v + 1)
            else openContact(id)
          }}
        />
      )}
      {importOpen && <ImportModal tags={tags.data || []} onClose={() => setImportOpen(false)} onDone={refreshAll} />}
      {bulkOpen && (
        <BulkTagModal
          ids={[...selected]}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false)
            setSelected(new Set())
            refreshAll()
          }}
        />
      )}
      {tagsOpen && <TagsModal tags={tags.data || []} onClose={() => setTagsOpen(false)} onChanged={refreshAll} />}
    </div>
  )
}

function ContactForm({ initial, onClose, onSaved }: { initial: Partial<ContactDetail>; onClose: () => void; onSaved: (id: string) => void }) {
  const fb = useFeedback()
  const isEdit = Boolean(initial.id)
  const [f, setF] = useState({
    name: initial.name || '',
    phone: initial.phone || '',
    email: initial.email || '',
    company: initial.company || '',
    document: initial.document || '',
    telegramChatId: initial.telegramChatId || '',
    notes: initial.notes || '',
    tags: (initial.tags || []).map((t) => t.name).join(', '),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    setLoading(true)
    setError('')
    const body = {
      name: f.name.trim() || undefined,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      company: f.company.trim() || null,
      document: f.document.trim() || null,
      telegramChatId: f.telegramChatId.trim() || null,
      notes: f.notes.trim() || null,
      tags: splitTags(f.tags),
    }
    try {
      if (isEdit) {
        await patch(`/contacts/${initial.id}`, body)
        fb.success('Contato atualizado.')
        onSaved(initial.id!)
      } else {
        const r = await post<{ contact: Contact; created: boolean }>('/contacts', body)
        fb.success(r.created ? 'Contato criado.' : 'Já existia um contato com esse telefone/e-mail: os dados foram mesclados.')
        onSaved(r.contact.id)
      }
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
      title={isEdit ? 'Editar contato' : 'Novo contato'}
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
        <Field label="Nome">
          <input value={f.name} onChange={set('name')} />
        </Field>
        <div className="grid-2 gap-sm">
          <Field label="Telefone / WhatsApp" hint="Com DDD.">
            <input type="tel" value={f.phone} onChange={set('phone')} placeholder="(44) 99999-9999" />
          </Field>
          <Field label="E-mail">
            <input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Empresa">
            <input value={f.company} onChange={set('company')} />
          </Field>
          <Field label="CPF/CNPJ">
            <input value={f.document} onChange={set('document')} />
          </Field>
        </div>
        <Field label="Chat ID do Telegram" hint="Preenchido automaticamente quando o contato fala com seu bot.">
          <input value={f.telegramChatId} onChange={set('telegramChatId')} />
        </Field>
        <Field label="Etiquetas" hint="Separe por vírgula. Ex.: paciente, ortodontia">
          <input value={f.tags} onChange={set('tags')} />
        </Field>
        <Field label="Observações">
          <textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  )
}

function ImportModal({ tags, onClose, onDone }: { tags: Tag[]; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [tagText, setTagText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; invalid: { line: number; reason: string }[] } | null>(null)
  const rows = csv ? parseCsvRows(csv) : []

  async function onFile(file?: File) {
    if (!file) return
    if (file.size > 5_000_000) return fb.toast('Arquivo acima de 5 MB. Divida em partes menores.', 'error')
    setFileName(file.name)
    setResult(null)
    setCsv(await readFileText(file))
  }

  async function submit() {
    setLoading(true)
    try {
      const r = await post<{ created: number; updated: number; invalid: { line: number; reason: string }[] }>('/contacts/import', { csv, tags: splitTags(tagText) })
      setResult(r)
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
      size="lg"
      title="Importar contatos (CSV)"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={loading} disabled={rows.length < 2}>
              Importar {rows.length > 1 ? `${rows.length - 1} linhas` : ''}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="stack">
          <div className="stats">
            <div className="stat stat-green">
              <div className="stat-label">Criados</div>
              <div className="stat-value">{result.created}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Atualizados</div>
              <div className="stat-value">{result.updated}</div>
            </div>
            <div className={`stat ${result.invalid.length ? 'stat-amber' : ''}`}>
              <div className="stat-label">Linhas inválidas</div>
              <div className="stat-value">{result.invalid.length}</div>
            </div>
          </div>
          {result.invalid.length > 0 && (
            <div className="table-wrap max-h">
              <table className="table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.invalid.map((i) => (
                    <tr key={i.line}>
                      <td>{i.line}</td>
                      <td>{i.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="small muted">
            A primeira linha deve ter os nomes das colunas. Reconhecemos: <code>nome</code>, <code>telefone</code> (ou celular/whatsapp), <code>email</code>, <code>empresa</code>, <code>documento</code> e <code>tags</code> (separadas por |).
            Separador vírgula ou ponto e vírgula.
          </p>
          <label className="dropzone">
            <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
            <Upload size={20} />
            <span>{fileName || 'Escolher arquivo .csv'}</span>
          </label>
          {rows.length > 0 && (
            <>
              <div className="small muted">Prévia ({rows.length - 1} linhas de dados):</div>
              <div className="table-wrap max-h">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      {rows[0].map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1, 6).map((r, i) => (
                      <tr key={i}>
                        {rows[0].map((_, j) => (
                          <td key={j}>{r[j]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Field label="Etiquetas para todos os importados (opcional)" hint={tags.length ? `Existentes: ${tags.map((t) => t.name).join(', ')}` : 'Separe por vírgula.'}>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="ex.: importacao-setembro" />
          </Field>
          <Alert tone="blue">Importe apenas contatos que autorizaram receber suas mensagens. Quem estiver na lista de bloqueio continua bloqueado.</Alert>
        </div>
      )}
    </Modal>
  )
}

function BulkTagModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [add, setAdd] = useState('')
  const [remove, setRemove] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit() {
    setLoading(true)
    try {
      const r = await post<{ updated: number }>('/contacts/bulk-tag', { contactIds: ids, add: splitTags(add), remove: splitTags(remove) })
      fb.success(`${r.updated} contato(s) atualizados.`)
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
      title={`Etiquetar ${ids.length} contato(s)`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!add.trim() && !remove.trim()}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Adicionar etiquetas" hint="Separe por vírgula.">
          <input value={add} onChange={(e) => setAdd(e.target.value)} />
        </Field>
        <Field label="Remover etiquetas">
          <input value={remove} onChange={(e) => setRemove(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function TagsModal({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  const fb = useFeedback()
  const [name, setName] = useState('')
  async function create() {
    try {
      await post('/tags', { name: name.trim() })
      setName('')
      onChanged()
    } catch (e) {
      fb.fail(e)
    }
  }
  async function remove(t: Tag) {
    if (!confirm(`Excluir a etiqueta "${t.name}"? Ela sai de ${t.contacts || 0} contato(s).`)) return
    try {
      await del(`/tags/${t.id}`)
      onChanged()
    } catch (e) {
      fb.fail(e)
    }
  }
  return (
    <Modal open onClose={onClose} title="Etiquetas">
      <div className="stack">
        <div className="row gap-sm">
          <input className="grow" placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          <Button onClick={create} disabled={!name.trim()}>
            Criar
          </Button>
        </div>
        {tags.length === 0 ? (
          <p className="muted">Nenhuma etiqueta ainda.</p>
        ) : (
          <ul className="list">
            {tags.map((t) => (
              <li key={t.id} className="list-row">
                <span>
                  <Badge tone="indigo">{t.name}</Badge> <span className="small muted">{t.contacts} contato(s)</span>
                </span>
                <button className="icon-btn" onClick={() => remove(t)} aria-label={`Excluir ${t.name}`}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
