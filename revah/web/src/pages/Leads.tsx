import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, FileSignature, MapPin, Search, Sparkles } from 'lucide-react'
import { ApiError, get, post } from '../lib/api'
import { fmtPhone } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Lead } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, PageHeader, Tabs, useLoad } from '../components/ui'

interface Access {
  addonActive: boolean
  contractAccepted: boolean
  acceptedAt: string | null
  terms: { version: string; text: string }
}

export default function Leads() {
  const { embedded } = useAuthed()
  const access = useLoad(() => get<Access>('/leads/access'))
  const a = access.data
  return (
    <div className="page">
      <PageHeader title={embedded ? 'Leads' : 'REVAH Leads'} subtitle="Encontre empresas e negócios locais e leve os contatos para o CRM." />
      <ErrorBox error={access.error} onRetry={access.reload} />
      {access.loading && !a ? <Loading /> : a && !a.addonActive ? <AddonCta /> : a && !a.contractAccepted ? <TermsForm access={a} onAccepted={() => access.reload()} /> : a ? <LeadsSearch onAccessLost={() => access.reload()} /> : null}
    </div>
  )
}

function AddonCta() {
  const fb = useFeedback()
  const { canManage, embedded, refresh } = useAuthed()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function contract() {
    if (!confirm('Adicionar o REVAH Leads à sua assinatura? O valor do add-on será cobrado proporcionalmente na próxima fatura.')) return
    setLoading(true)
    setMsg('')
    try {
      const r = await post<{ alreadyActive: boolean }>('/billing/leads-addon')
      fb.success(r.alreadyActive ? 'O add-on já estava ativo.' : 'Add-on contratado. A liberação acontece assim que o pagamento for confirmado.')
      await refresh().catch(() => null)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'SUBSCRIPTION_REQUIRED' || e.code === 'BILLING_NOT_CONFIGURED')) setMsg(e.message)
      else fb.fail(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="cta">
        <Sparkles size={28} className="text-indigo" />
        <h2>Prospecção com dados de empresas</h2>
        <p>O REVAH Leads é um add-on contratado à parte. Ele permite buscar empresas por CNPJ e negócios locais por segmento e cidade, e importar os contatos encontrados para o CRM com etiquetas.</p>
        <ul className="bullets">
          <li>Busca por lista de CNPJs</li>
          <li>Busca de negócios locais por segmento e cidade</li>
          <li>Importação para o CRM, com etiqueta “Leads”</li>
          <li>Uso sujeito a termo de responsabilidade (LGPD)</li>
        </ul>
        {msg && <Alert tone="amber">{msg}</Alert>}
        <div className="row wrap gap-sm center-x">
          {canManage && !embedded && (
            <Button variant="primary" onClick={contract} loading={loading}>
              Contratar add-on
            </Button>
          )}
          <a className="btn btn-secondary" href="https://revah.com.br/#contato" target="_blank" rel="noreferrer">
            Falar com o comercial
          </a>
        </div>
        {!canManage && <p className="small muted">Peça ao proprietário ou administrador da conta para contratar.</p>}
      </div>
    </Card>
  )
}

function TermsForm({ access, onAccepted }: { access: Access; onAccepted: () => void }) {
  const fb = useFeedback()
  const { session, canManage } = useAuthed()
  const [signerName, setSignerName] = useState(session.user.name)
  const [signerDocument, setSignerDocument] = useState('')
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setError('')
    const doc = signerDocument.replace(/\D/g, '')
    if (doc.length !== 11 && doc.length !== 14) return setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).')
    setLoading(true)
    try {
      await post('/leads/terms/accept', { signerName: signerName.trim(), signerDocument: doc, agree: true })
      fb.success('Termo aceito.')
      onAccepted()
    } catch (e: any) {
      setError(e?.message || 'Não foi possível registrar o aceite.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title={<span className="row gap-sm"><FileSignature size={18} /> Termo de responsabilidade — versão {access.terms.version}</span>}>
      <div className="stack">
        <div className="terms">{access.terms.text}</div>
        {canManage ? (
          <>
            {error && <Alert tone="red">{error}</Alert>}
            <div className="grid-2 gap-sm">
              <Field label="Nome do responsável">
                <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </Field>
              <Field label="CPF ou CNPJ">
                <input value={signerDocument} onChange={(e) => setSignerDocument(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>Li e aceito o termo de responsabilidade em nome da empresa.</span>
            </label>
            <div className="row end">
              <Button variant="primary" onClick={accept} loading={loading} disabled={!agree || signerName.trim().length < 3}>
                Aceitar e continuar
              </Button>
            </div>
            <p className="small muted">Registramos data, hora, IP e navegador do aceite.</p>
          </>
        ) : (
          <Alert tone="amber">O termo precisa ser aceito pelo proprietário ou administrador da conta.</Alert>
        )}
      </div>
    </Card>
  )
}

function LeadsSearch({ onAccessLost }: { onAccessLost: () => void }) {
  const fb = useFeedback()
  const [kind, setKind] = useState<'COMPANY' | 'LOCAL'>('LOCAL')
  const [docs, setDocs] = useState('')
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Lead[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<'NEW' | 'IMPORTED' | 'DISCARDED' | ''>('NEW')
  const saved = useLoad(() => get<Lead[]>('/leads', { status: statusFilter }), [statusFilter])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState('')

  const rows = results ?? saved.data ?? []

  // Atualiza o status real dos resultados exibidos (importados/descartados).
  async function syncResults() {
    saved.reload(true)
    if (!results) return
    try {
      const all = await get<Lead[]>('/leads')
      const byId = new Map(all.map((l) => [l.id, l]))
      setResults((res) => res?.map((l) => byId.get(l.id) || l) ?? null)
    } catch {
      /* mantém a lista atual */
    }
  }

  function handle(e: unknown) {
    if (e instanceof ApiError && (e.code === 'LEADS_ADDON_REQUIRED' || e.code === 'LEADS_TERMS_REQUIRED')) onAccessLost()
    fb.fail(e)
  }

  async function search() {
    setSearching(true)
    setSelected(new Set())
    try {
      const body =
        kind === 'COMPANY'
          ? { kind, documents: docs.split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean) }
          : { kind, query: query.trim(), city: city.trim() || undefined, limit: 20 }
      const r = await post<{ leads: Lead[] }>('/leads/search', body)
      setResults(r.leads)
      if (!r.leads.length) fb.toast('Nenhum resultado para esta busca.', 'info')
      saved.reload(true)
    } catch (e) {
      handle(e)
    } finally {
      setSearching(false)
    }
  }

  async function importSel() {
    setBusy('import')
    try {
      const r = await post<{ imported: number; skipped: number }>('/leads/import', {
        ids: [...selected],
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      fb.success(`${r.imported} lead(s) importado(s) para o CRM${r.skipped ? ` · ${r.skipped} sem telefone/e-mail ou já importados` : ''}.`)
      setSelected(new Set())
      await syncResults()
    } catch (e) {
      handle(e)
    } finally {
      setBusy('')
    }
  }

  async function discardSel() {
    setBusy('discard')
    try {
      const r = await post<{ discarded: number }>('/leads/discard', { ids: [...selected] })
      fb.success(`${r.discarded} lead(s) descartado(s).`)
      setSelected(new Set())
      await syncResults()
    } catch (e) {
      handle(e)
    } finally {
      setBusy('')
    }
  }

  const selectable = rows.filter((l) => l.status === 'NEW')
  const allSel = selectable.length > 0 && selectable.every((l) => selected.has(l.id))

  return (
    <div className="stack">
      <Card>
        <Tabs
          value={kind}
          onChange={setKind}
          items={[
            { value: 'LOCAL', label: <span className="row gap-xs"><MapPin size={14} /> Negócios locais</span> },
            { value: 'COMPANY', label: <span className="row gap-xs"><Building2 size={14} /> Empresas por CNPJ</span> },
          ]}
        />
        {kind === 'LOCAL' ? (
          <div className="grid-search">
            <Field label="Segmento ou termo">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex.: clínica odontológica" onKeyDown={(e) => e.key === 'Enter' && search()} />
            </Field>
            <Field label="Cidade (opcional)">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex.: Maringá - PR" onKeyDown={(e) => e.key === 'Enter' && search()} />
            </Field>
            <Button variant="primary" icon={<Search size={16} />} onClick={search} loading={searching} disabled={!query.trim()}>
              Buscar
            </Button>
          </div>
        ) : (
          <div className="stack">
            <Field label="CNPJs" hint="Até 50, separados por linha, vírgula ou espaço.">
              <textarea rows={4} value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="00.000.000/0001-00" />
            </Field>
            <div className="row end">
              <Button variant="primary" icon={<Search size={16} />} onClick={search} loading={searching} disabled={!docs.trim()}>
                Buscar empresas
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card
        title={results ? `Resultados da busca (${results.length})` : 'Leads salvos'}
        actions={
          results ? (
            <Button size="sm" variant="ghost" onClick={() => setResults(null)}>
              Ver leads salvos
            </Button>
          ) : (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="NEW">Novos</option>
              <option value="IMPORTED">Importados</option>
              <option value="DISCARDED">Descartados</option>
              <option value="">Todos</option>
            </select>
          )
        }
        pad={false}
      >
        {selected.size > 0 && (
          <div className="bulkbar bulkbar-in">
            <span>{selected.size} selecionado(s)</span>
            <input placeholder="Etiquetas (opcional, separadas por vírgula)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <Button size="sm" variant="primary" onClick={importSel} loading={busy === 'import'}>
              Importar para o CRM
            </Button>
            <Button size="sm" variant="ghost" onClick={discardSel} loading={busy === 'discard'}>
              Descartar
            </Button>
          </div>
        )}
        {!results && saved.loading && !saved.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Search size={28} />} title={results ? 'Nenhum resultado' : 'Nenhum lead aqui'}>
            Faça uma busca acima.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-check">
                    <input
                      type="checkbox"
                      checked={allSel}
                      onChange={() => setSelected(allSel ? new Set() : new Set(selectable.map((l) => l.id)))}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th>Empresa</th>
                  <th>Contato</th>
                  <th className="hide-sm">Local</th>
                  <th className="hide-sm">Segmento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="w-check">
                      <input
                        type="checkbox"
                        disabled={l.status !== 'NEW'}
                        checked={selected.has(l.id)}
                        onChange={() => {
                          const s = new Set(selected)
                          if (s.has(l.id)) s.delete(l.id)
                          else s.add(l.id)
                          setSelected(s)
                        }}
                        aria-label={`Selecionar ${l.name}`}
                      />
                    </td>
                    <td>
                      <div className="strong">{l.name}</div>
                      {l.company && l.company !== l.name && <div className="small muted">{l.company}</div>}
                      {l.document && <div className="small muted">CNPJ {l.document}</div>}
                      {l.website && (
                        <a className="small" href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer">
                          site
                        </a>
                      )}
                    </td>
                    <td className="small">
                      {l.phone && <div className="nowrap">{fmtPhone(l.phone)}</div>}
                      {l.email && <div>{l.email}</div>}
                      {!l.phone && !l.email && <span className="muted">sem contato</span>}
                    </td>
                    <td className="hide-sm small">{[l.city, l.state].filter(Boolean).join(' - ') || l.address || '—'}</td>
                    <td className="hide-sm small">{l.category || '—'}</td>
                    <td>
                      {l.status === 'IMPORTED' ? (
                        l.contactId ? (
                          <Link to={`/contatos?id=${l.contactId}`}>
                            <Badge tone="green">No CRM</Badge>
                          </Link>
                        ) : (
                          <Badge tone="green">No CRM</Badge>
                        )
                      ) : l.status === 'DISCARDED' ? (
                        <Badge tone="gray">Descartado</Badge>
                      ) : (
                        <Badge tone="indigo">Novo</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted">Use os dados apenas para abordagens legítimas e respeite pedidos de não contato, conforme o termo aceito.</p>
    </div>
  )
}
