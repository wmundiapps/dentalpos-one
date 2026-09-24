import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, CreditCard, ExternalLink } from 'lucide-react'
import { get, post } from '../lib/api'
import { PLAN_LABEL, TENANT_STATUS_LABEL, fmtDate, fmtMoney, fmtNumber } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Limits, PlanInfo, TrialStatus } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress, useLoad } from '../components/ui'

interface BillingStatus {
  plan: string
  status: string
  leadsAddonActive: boolean
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; plan: string; hasLeadsAddon: boolean } | null
  usage: { messages: number; calls: number }
  limits: Limits
  trial: TrialStatus
  plans: PlanInfo[]
}

const PLAN_PITCH: Record<string, string[]> = {
  START: ['WhatsApp, SMS, Telegram e e-mail', 'CRM com etiquetas e importação', 'Inbox unificada com chatbot de IA', 'Campanhas e automações'],
  PRO: ['Tudo do Start', 'REVAH Voice: ligações com agente de voz', 'Mais usuários e canais', 'Volume maior de mensagens'],
  ENTERPRISE: ['Volume e limites sob medida', 'Integrações dedicadas', 'Condições comerciais negociadas', 'Atendimento prioritário'],
}

// Sem limite numérico: no Enterprise vale o contrato; nos demais a linha é omitida.
function limitLines(l: Limits, enterprise: boolean) {
  const lines: string[] = []
  if (l.monthlyMessages !== null) lines.push(`${fmtNumber(l.monthlyMessages)} mensagens/mês`)
  else if (enterprise) lines.push('Volume de mensagens sob contrato')
  if (l.users !== null) lines.push(`até ${l.users} usuário(s)`)
  else if (enterprise) lines.push('Usuários sob contrato')
  if (l.channels !== null) lines.push(`até ${l.channels} canais conectados`)
  else if (enterprise) lines.push('Canais sob contrato')
  return lines
}

export default function Billing() {
  const fb = useFeedback()
  const { canManage, refresh } = useAuthed()
  const [params, setParams] = useSearchParams()
  const st = useLoad(() => get<BillingStatus>('/billing/status'))
  const [busy, setBusy] = useState('')
  const [salesOpen, setSalesOpen] = useState(false)
  const flash = params.get('status')

  useEffect(() => {
    if (flash === 'sucesso') {
      // O webhook do Stripe pode levar alguns segundos: recarrega algumas vezes.
      let n = 0
      const t = setInterval(() => {
        n++
        st.reload(true)
        refresh().catch(() => null)
        if (n >= 4) clearInterval(t)
      }, 3000)
      return () => clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash])

  async function subscribe(plan: string) {
    setBusy(plan)
    try {
      const r = await post<{ url: string }>('/billing/checkout', { plan })
      if (r.url) window.location.href = r.url
    } catch (e) {
      fb.fail(e)
      setBusy('')
    }
  }

  async function portal() {
    setBusy('portal')
    try {
      const r = await post<{ url: string }>('/billing/portal')
      if (r.url) window.location.href = r.url
    } catch (e) {
      fb.fail(e)
      setBusy('')
    }
  }

  const d = st.data
  const hasSub = Boolean(d?.subscription && ['active', 'trialing', 'past_due'].includes(d.subscription.status))

  return (
    <div className="page">
      <PageHeader title="Assinatura" subtitle="Plano, uso e forma de pagamento." />
      {flash === 'sucesso' && (
        <Alert tone="green" title="Pagamento recebido">
          Obrigado! Estamos confirmando a assinatura com o meio de pagamento; o plano é atualizado em instantes. Boletos podem levar até 3 dias úteis para compensar.{' '}
          <button className="link-btn" onClick={() => setParams({})}>
            Fechar
          </button>
        </Alert>
      )}
      {flash === 'cancelado' && (
        <Alert tone="amber">
          Pagamento não concluído. Nada foi cobrado. Você pode tentar de novo quando quiser.{' '}
          <button className="link-btn" onClick={() => setParams({})}>
            Fechar
          </button>
        </Alert>
      )}
      <ErrorBox error={st.error} onRetry={st.reload} />
      {st.loading && !d ? (
        <Loading />
      ) : d ? (
        <>
          <div className="grid-2">
            <Card title="Seu plano">
              <div className="row gap-sm wrap">
                <span className="plan-name">{PLAN_LABEL[d.plan] || d.plan}</span>
                <Badge tone={d.status === 'ACTIVE' ? 'green' : d.status === 'PAST_DUE' ? 'red' : 'amber'}>{TENANT_STATUS_LABEL[d.status] || d.status}</Badge>
                {d.leadsAddonActive && <Badge tone="indigo">+ Leads</Badge>}
              </div>
              {d.subscription?.currentPeriodEnd && (
                <p className="small muted">
                  {d.subscription.cancelAtPeriodEnd ? 'Encerra em' : 'Próxima renovação em'} {fmtDate(d.subscription.currentPeriodEnd)}
                </p>
              )}
              {d.status === 'PAST_DUE' && <Alert tone="red">Há uma cobrança pendente. Regularize no portal para continuar enviando.</Alert>}
              {d.trial.isTrial && (
                <p>
                  Teste grátis: {d.trial.campaignsUsed} de {d.trial.maxCampaigns} campanhas usadas, até {d.trial.maxRecipientsPerCampaign} contatos cada.
                </p>
              )}
              {canManage && hasSub && (
                <Button icon={<ExternalLink size={16} />} onClick={portal} loading={busy === 'portal'}>
                  Gerenciar assinatura
                </Button>
              )}
              {hasSub && <p className="small muted">No portal você troca de plano, atualiza o cartão, baixa faturas ou cancela.</p>}
            </Card>
            <Card title="Uso neste mês">
              <div className="stack">
                <div>
                  <div className="row between small">
                    <span>Mensagens enviadas</span>
                    <span>
                      {fmtNumber(d.usage.messages)}
                      {d.limits.monthlyMessages !== null ? ` / ${fmtNumber(d.limits.monthlyMessages)}` : ''}
                    </span>
                  </div>
                  {d.limits.monthlyMessages !== null && <Progress value={d.usage.messages} max={d.limits.monthlyMessages} />}
                </div>
                <div className="row between small">
                  <span>Ligações automáticas</span>
                  <span>{d.limits.voice ? fmtNumber(d.usage.calls) : 'Não incluídas no plano'}</span>
                </div>
                <div className="row between small">
                  <span>Usuários</span>
                  <span>{d.limits.users !== null ? `até ${d.limits.users}` : 'conforme plano'}</span>
                </div>
                <div className="row between small">
                  <span>Canais</span>
                  <span>{d.limits.channels !== null ? `até ${d.limits.channels}` : 'conforme plano'}</span>
                </div>
              </div>
            </Card>
          </div>

          <h2 className="section-title">Planos</h2>
          <div className="plans">
            {d.plans.map((p) => {
              const current = d.plan === p.plan
              return (
                <div key={p.plan} className={`plan ${p.plan === 'PRO' ? 'plan-featured' : ''} ${current ? 'plan-current' : ''}`}>
                  {p.plan === 'PRO' && <span className="plan-ribbon">Mais completo</span>}
                  <h3>{PLAN_LABEL[p.plan]}</h3>
                  <div className="plan-price">
                    {p.priceBRL !== null ? (
                      <>
                        {fmtMoney(p.priceBRL)}
                        <span>/mês</span>
                      </>
                    ) : (
                      'Sob consulta'
                    )}
                  </div>
                  <ul>
                    {[...(PLAN_PITCH[p.plan] || []), ...limitLines(p.limits, p.plan === 'ENTERPRISE')].map((x) => (
                      <li key={x}>
                        <Check size={14} /> {x}
                      </li>
                    ))}
                  </ul>
                  {current ? (
                    <Button disabled className="btn-block">
                      Plano atual
                    </Button>
                  ) : p.contactSales ? (
                    <Button className="btn-block" onClick={() => setSalesOpen(true)}>
                      Falar com vendas
                    </Button>
                  ) : hasSub ? (
                    canManage && (
                      <Button className="btn-block" onClick={portal} loading={busy === 'portal'}>
                        Trocar no portal
                      </Button>
                    )
                  ) : canManage ? (
                    <Button variant="primary" className="btn-block" icon={<CreditCard size={16} />} onClick={() => subscribe(p.plan)} loading={busy === p.plan}>
                      Assinar {PLAN_LABEL[p.plan]}
                    </Button>
                  ) : (
                    <p className="small muted">Peça ao proprietário da conta para assinar.</p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="small muted">
            Pagamento por cartão de crédito ou boleto (Pix quando disponível), processado em ambiente seguro do Stripe. O REVAH não armazena dados de cartão. Valores em reais; impostos conforme nota fiscal. Cancele quando quiser pelo portal.
          </p>
          <p className="small muted">REVAH Leads é um add-on contratado à parte, disponível para assinantes.</p>
        </>
      ) : null}
      {salesOpen && <SalesModal onClose={() => setSalesOpen(false)} />}
    </div>
  )
}

function SalesModal({ onClose }: { onClose: () => void }) {
  const fb = useFeedback()
  const { session } = useAuthed()
  const [f, setF] = useState({ name: session.user.name, email: session.user.email, phone: '', company: session.tenant.name, message: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState('')
  async function submit() {
    setLoading(true)
    try {
      const r = await post<{ message: string }>('/sales/enterprise', { ...f, phone: f.phone || undefined, message: f.message || undefined })
      setDone(r.message)
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
      title="Plano Enterprise"
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={loading} disabled={f.name.length < 2 || !f.email}>
              Enviar
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Alert tone="green">{done}</Alert>
      ) : (
        <div className="stack">
          <div className="grid-2 gap-sm">
            <Field label="Nome">
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label="Empresa">
              <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            </Field>
          </div>
          <Field label="Conte sobre sua operação" hint="Volume aproximado, canais, integrações necessárias.">
            <textarea rows={4} maxLength={2000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </Field>
        </div>
      )}
    </Modal>
  )
}
