import { useState } from 'react'
import { get, patch } from '../lib/api'
import { PLAN_LABEL, TENANT_STATUS_LABEL, fmtDateTime } from '../lib/format'
import { useFeedback } from '../components/feedback'
import { Badge, ErrorBox, Loading, PageHeader, Tabs, useDebounced, useLoad } from '../components/ui'

interface AdminTenant {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  source: string
  leadsAddonActive: boolean
  trialCampaignsUsed: number
  createdAt: string
  subscription: { status: string; currentPeriodEnd: string | null } | null
  _count: { contacts: number; users: number; campaigns: number }
}

export default function Admin() {
  const [tab, setTab] = useState<'tenants' | 'sales' | 'billing'>('tenants')
  return (
    <div className="page">
      <PageHeader title="Admin WMundi" subtitle="Backoffice restrito." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tenants', label: 'Empresas' },
          { value: 'sales', label: 'Contatos comerciais' },
          { value: 'billing', label: 'Eventos de cobrança' },
        ]}
      />
      {tab === 'tenants' && <Tenants />}
      {tab === 'sales' && <Sales />}
      {tab === 'billing' && <BillingEvents />}
    </div>
  )
}

function Tenants() {
  const fb = useFeedback()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const list = useLoad(() => get<AdminTenant[]>('/admin/tenants', { q: dq }), [dq])

  async function update(t: AdminTenant, body: Partial<AdminTenant>) {
    const label = Object.entries(body)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    if (!confirm(`Alterar ${t.name}: ${label}?`)) return
    try {
      const updated = await patch<AdminTenant>(`/admin/tenants/${t.id}`, body)
      list.setData((l) => l?.map((x) => (x.id === t.id ? { ...x, ...updated } : x)) || null)
      fb.success('Empresa atualizada.')
    } catch (e) {
      fb.fail(e)
    }
  }

  return (
    <div className="stack">
      <input type="search" placeholder="Buscar por nome ou e-mail de usuário" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Leads</th>
                <th>Teste</th>
                <th className="hide-sm">Uso</th>
                <th className="hide-sm">Criada</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="strong">{t.name}</div>
                    <div className="small muted">
                      {t.source === 'DENTALPOS' ? <Badge tone="blue">DentalPos</Badge> : null} {t.subscription ? `Stripe: ${t.subscription.status}` : 'sem assinatura'}
                    </div>
                  </td>
                  <td>
                    <select value={t.plan} onChange={(e) => update(t, { plan: e.target.value })}>
                      {Object.keys(PLAN_LABEL).map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
                      {Object.keys(TENANT_STATUS_LABEL).map((s) => (
                        <option key={s} value={s}>
                          {TENANT_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={t.leadsAddonActive} onChange={(e) => update(t, { leadsAddonActive: e.target.checked })} aria-label="Leads ativo" />
                  </td>
                  <td>
                    <select value={t.trialCampaignsUsed} onChange={(e) => update(t, { trialCampaignsUsed: Number(e.target.value) })} aria-label="Campanhas grátis usadas">
                      {[0, 1, 2].map((n) => (
                        <option key={n} value={n}>
                          {n}/2
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="hide-sm small">
                    {t._count.contacts} contatos · {t._count.users} usuários · {t._count.campaigns} campanhas
                  </td>
                  <td className="hide-sm small muted">{fmtDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Sales() {
  const list = useLoad(() => get<{ id: string; name: string; email: string; phone: string | null; company: string | null; message: string | null; plan: string; createdAt: string }[]>('/admin/sales-inquiries'))
  if (list.loading && !list.data) return <Loading />
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Contato</th>
            <th>Empresa</th>
            <th>Mensagem</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((s) => (
            <tr key={s.id}>
              <td className="small nowrap">{fmtDateTime(s.createdAt)}</td>
              <td>
                <div className="strong">{s.name}</div>
                <div className="small">
                  <a href={`mailto:${s.email}`}>{s.email}</a>
                  {s.phone ? ` · ${s.phone}` : ''}
                </div>
              </td>
              <td>{s.company || '—'}</td>
              <td className="small pre">{s.message || '—'}</td>
            </tr>
          ))}
          {list.data?.length === 0 && (
            <tr>
              <td colSpan={4} className="muted center">
                Nenhum contato comercial.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function BillingEvents() {
  const list = useLoad(() => get<{ id: string; stripeEventId: string; type: string; status: string; error: string | null; createdAt: string }[]>('/admin/billing-events'))
  if (list.loading && !list.data) return <Loading />
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Tipo</th>
            <th>Status</th>
            <th className="hide-sm">ID Stripe</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((e) => (
            <tr key={e.id}>
              <td className="small nowrap">{fmtDateTime(e.createdAt)}</td>
              <td className="small">{e.type}</td>
              <td>
                <Badge tone={e.status === 'PROCESSED' ? 'green' : e.status === 'FAILED' ? 'red' : 'gray'}>{e.status}</Badge>
                {e.error && <div className="small text-red">{e.error}</div>}
              </td>
              <td className="hide-sm small muted">{e.stripeEventId}</td>
            </tr>
          ))}
          {list.data?.length === 0 && (
            <tr>
              <td colSpan={4} className="muted center">
                Nenhum evento.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
