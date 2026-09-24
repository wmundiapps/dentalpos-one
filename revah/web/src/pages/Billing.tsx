import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, CreditCard, ExternalLink, Globe, Landmark } from 'lucide-react'
import { get, post } from '../lib/api'
import { PLAN_LABEL, TENANT_STATUS_LABEL, fmtDate, fmtMoney, fmtNumber } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Limits, PlansResponse, TrialStatus } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Progress, useLoad } from '../components/ui'

interface Subscription {
  provider: 'ASAAS' | 'STRIPE'
  status: string
  plan: string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasLeadsAddon: boolean
}

interface BillingStatus {
  plan: string
  status: string
  leadsAddonActive: boolean
  subscription: Subscription | null
  usage: { messages: number; calls: number }
  limits: Limits
  trial: TrialStatus
}

const SUB_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'indigo' }> = {
  trialing: { label: 'Em teste grátis', tone: 'indigo' },
  active: { label: 'Ativa', tone: 'green' },
  past_due: { label: 'Pagamento pendente', tone: 'red' },
  canceled: { label: 'Cancelada', tone: 'gray' },
  incomplete: { label: 'Aguardando pagamento', tone: 'amber' },
}

const PROVIDER_LABEL: Record<string, string> = { ASAAS: 'Asaas — Brasil (Pix, boleto ou cartão)', STRIPE: 'Stripe — cartão internacional' }

const LIVE = ['active', 'trialing', 'past_due']

export default function Billing() {
  const fb = useFeedback()
  const { canManage, refresh } = useAuthed()
  const [params, setParams] = useSearchParams()
  const st = useLoad(() => get<BillingStatus>('/billing/status'))
  const info = useLoad(() => get<PlansResponse>('/plans'))
  const [busy, setBusy] = useState('')
  const [salesOpen, setSalesOpen] = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const flash = params.get('status')

  useEffect(() => {
    if (flash === 'sucesso') {
      // A confirmação chega por webhook e pode levar alguns segundos: recarrega algumas vezes.
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

  async function portal() {
    setBusy('portal')
    try {
      const r = await post<{ url: string }>('/billing/portal')
      if (r.url) window.location.href = r.url
    } catch (e) {
      fb.fail(e)
    } finally {
      setBusy('')
    }
  }

  function reloadAll() {
    st.reload(true)
    refresh().catch(() => null)
  }

  const d = st.data
  const sub = d?.subscription || null
  const hasSub = Boolean(sub && LIVE.includes(sub.status))
  const trial = d?.trial
  const nextCharge = sub?.currentPeriodEnd || sub?.trialEndsAt || trial?.endsAt || null

  function startPlan(plan: string) {
    if (hasSub) {
      if (sub?.provider === 'ASAAS') setChangeOpen(true)
      else portal()
    } else setCheckoutPlan(plan)
  }

  return (
    <div className="page">
      <PageHeader title="Assinatura" subtitle="Plano, teste grátis, forma de pagamento e uso." />
      {flash === 'sucesso' && (
        <Alert tone="green" title="Tudo certo">
          Recebemos sua forma de pagamento. O plano é atualizado em instantes.{' '}
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
      <ErrorBox error={st.error || info.error} onRetry={() => { st.reload(); info.reload() }} />
      {(st.loading && !d) || (info.loading && !info.data) ? (
        <Loading />
      ) : d && trial ? (
        <>
          {trial.paymentMethodRequired && (
            <Alert tone="amber" title={trial.trialAvailable ? `Cadastre a forma de pagamento e ganhe ${trial.days} dias grátis` : 'Escolha um plano para começar a enviar'}>
              {trial.trialAvailable
                ? `Escolha o plano abaixo. O teste de ${trial.days} dias começa na hora; a primeira mensalidade só é cobrada ao fim do teste. Se cancelar antes, não há cobrança.`
                : 'Este e-mail, telefone ou documento já usou o teste grátis. A assinatura começa a valer na confirmação do pagamento.'}
            </Alert>
          )}
          <div className="grid-2">
            <Card title="Seu plano">
              <div className="row gap-sm wrap">
                <span className="plan-name">{PLAN_LABEL[d.plan] || d.plan}</span>
                <Badge tone={d.status === 'ACTIVE' ? 'green' : d.status === 'TRIAL' ? 'indigo' : d.status === 'PAST_DUE' ? 'red' : 'amber'}>{TENANT_STATUS_LABEL[d.status] || d.status}</Badge>
                {d.leadsAddonActive && <Badge tone="indigo">+ Leads</Badge>}
              </div>
              {trial.isTrial && (
                <p>
                  Teste grátis: {trial.daysLeft ?? trial.days} dia(s) restante(s){trial.endsAt ? `, até ${fmtDate(trial.endsAt)}` : ''}. Até {trial.maxRecipientsPerCampaign} contatos por campanha durante o teste.
                </p>
              )}
              {d.status === 'PAST_DUE' && <Alert tone="red">Há uma cobrança pendente. Regularize a fatura para continuar enviando.</Alert>}
              {d.status === 'CANCELED' && <Alert tone="gray">Assinatura cancelada. Escolha um plano abaixo para voltar a enviar.</Alert>}

              {sub && (
                <dl className="details">
                  <dt>Pagamento</dt>
                  <dd>{PROVIDER_LABEL[sub.provider] || sub.provider}</dd>
                  <dt>Assinatura</dt>
                  <dd>
                    <Badge tone={SUB_STATUS[sub.status]?.tone || 'gray'}>{SUB_STATUS[sub.status]?.label || sub.status}</Badge> {PLAN_LABEL[sub.plan] || sub.plan}
                  </dd>
                  {sub.status === 'trialing' && sub.trialEndsAt && (
                    <>
                      <dt>Fim do teste</dt>
                      <dd>{fmtDate(sub.trialEndsAt)}</dd>
                    </>
                  )}
                  {nextCharge && sub.status !== 'canceled' && !sub.cancelAtPeriodEnd && (
                    <>
                      <dt>Próxima cobrança</dt>
                      <dd>{fmtDate(nextCharge)}</dd>
                    </>
                  )}
                  {sub.cancelAtPeriodEnd && sub.status !== 'canceled' && (
                    <>
                      <dt>Cancelamento</dt>
                      <dd>Agendado: o plano fica ativo até {fmtDate(sub.currentPeriodEnd || nextCharge)} e não será renovado.</dd>
                    </>
                  )}
                </dl>
              )}

              {canManage && hasSub && (
                <div className="row wrap gap-sm">
                  <Button icon={<ExternalLink size={16} />} onClick={portal} loading={busy === 'portal'}>
                    {sub?.provider === 'ASAAS' ? 'Ver fatura' : 'Gerenciar pagamento'}
                  </Button>
                  <Button variant="ghost" onClick={() => (sub?.provider === 'ASAAS' ? setChangeOpen(true) : portal())}>
                    Trocar plano
                  </Button>
                  {!sub?.cancelAtPeriodEnd && (
                    <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                      Cancelar assinatura
                    </Button>
                  )}
                </div>
              )}
              {!canManage && <p className="small muted">Apenas o proprietário ou um administrador podem alterar a assinatura.</p>}
            </Card>
            <Card title="Uso neste mês">
              <div className="stack">
                <div>
                  <div className="row between small">
                    <span>Mensagens enviadas</span>
                    <span>
                      {fmtNumber(d.usage.messages)}
                      {d.limits.monthlyMessages ? ` / ${fmtNumber(d.limits.monthlyMessages)}` : ''}
                    </span>
                  </div>
                  {!!d.limits.monthlyMessages && <Progress value={d.usage.messages} max={d.limits.monthlyMessages} />}
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
                  <span>Templates</span>
                  <span>{d.limits.templates !== null ? `até ${d.limits.templates}` : 'conforme plano'}</span>
                </div>
                <div className="row between small">
                  <span>Importação CSV</span>
                  <span>{d.limits.csvImport ? 'Incluída' : 'No plano PRO'}</span>
                </div>
              </div>
            </Card>
          </div>

          <h2 className="section-title">Planos</h2>
          <div className="plans">
            {(info.data?.plans || []).map((p) => {
              const current = d.plan === p.plan && (hasSub || ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(d.status))
              const label = PLAN_LABEL[p.plan] || p.plan
              return (
                <div key={p.plan} className={`plan ${p.highlight ? 'plan-featured' : ''} ${current ? 'plan-current' : ''}`}>
                  {p.highlight && <span className="plan-ribbon">Mais escolhido</span>}
                  <h3>{p.plan}</h3>
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
                    {p.features.map((x) => (
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
                      Falar com equipe
                    </Button>
                  ) : canManage ? (
                    <Button variant={p.highlight ? 'primary' : 'secondary'} className="btn-block" icon={<CreditCard size={16} />} onClick={() => startPlan(p.plan)} loading={busy === 'portal' && hasSub}>
                      {hasSub ? `Trocar para ${label}` : trial.trialAvailable ? `Testar ${p.plan} por ${trial.days} dias` : `Assinar ${p.plan}`}
                    </Button>
                  ) : (
                    <p className="small muted">Peça ao proprietário da conta para assinar.</p>
                  )}
                </div>
              )
            })}
          </div>
          {info.data?.note && <p className="small muted">{info.data.note}</p>}
          <p className="small muted">
            No Brasil a cobrança é feita pelo Asaas (Pix, boleto ou cartão); para cartões internacionais, pelo Stripe. O REVAH não armazena dados de cartão.
            {info.data?.leadsPriceBRL ? ` REVAH Leads é um add-on contratado à parte (${fmtMoney(info.data.leadsPriceBRL)}/mês).` : ' REVAH Leads é um add-on contratado à parte.'}
          </p>
        </>
      ) : null}

      {checkoutPlan && info.data && trial && (
        <CheckoutModal
          plan={checkoutPlan}
          price={info.data.plans.find((p) => p.plan === checkoutPlan)?.priceBRL ?? null}
          providers={info.data.providers}
          trial={trial}
          onClose={() => setCheckoutPlan(null)}
          onDone={reloadAll}
        />
      )}
      {changeOpen && d && (
        <ChangePlanModal
          current={d.plan}
          plans={(info.data?.plans || []).filter((p) => !p.contactSales).map((p) => ({ plan: p.plan, price: p.priceBRL }))}
          onClose={() => setChangeOpen(false)}
          onDone={() => {
            setChangeOpen(false)
            reloadAll()
          }}
        />
      )}
      {cancelOpen && sub && (
        <CancelModal
          sub={sub}
          onClose={() => setCancelOpen(false)}
          onDone={() => {
            setCancelOpen(false)
            reloadAll()
          }}
        />
      )}
      {salesOpen && <SalesModal onClose={() => setSalesOpen(false)} />}
    </div>
  )
}

function CheckoutModal({
  plan,
  price,
  providers,
  trial,
  onClose,
  onDone,
}: {
  plan: string
  price: number | null
  providers: { ASAAS: boolean; STRIPE: boolean }
  trial: TrialStatus
  onClose: () => void
  onDone: () => void
}) {
  const fb = useFeedback()
  const { refresh } = useAuthed()
  const [provider, setProvider] = useState<'ASAAS' | 'STRIPE' | null>(providers.ASAAS ? 'ASAAS' : providers.STRIPE ? 'STRIPE' : null)
  const [doc, setDoc] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const none = !providers.ASAAS && !providers.STRIPE

  async function submit() {
    if (!provider) return
    setError('')
    const cpfCnpj = doc.replace(/\D/g, '')
    if (provider === 'ASAAS' && cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) para emitir as cobranças.')
    setLoading(true)
    try {
      const r = await post<{ url: string | null; provider: string; trialEndsAt?: string | null }>('/billing/checkout', { plan, provider, ...(provider === 'ASAAS' ? { cpfCnpj } : {}) })
      if (r.provider === 'ASAAS' && r.trialEndsAt) {
        await refresh().catch(() => null)
        onDone()
        setDone(`Pronto! Seus ${trial.days} dias grátis começaram. A primeira cobrança será em ${fmtDate(r.trialEndsAt)}; o Asaas envia a fatura por e-mail (Pix, boleto ou cartão).`)
      } else if (r.url) {
        window.location.href = r.url
      } else {
        await refresh().catch(() => null)
        onDone()
        setDone('Assinatura registrada. O plano é liberado assim que o pagamento for confirmado.')
      }
    } catch (e: any) {
      if (e?.status === 402) fb.fail(e)
      else setError(e?.message || 'Não foi possível iniciar o pagamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${trial.trialAvailable ? 'Testar' : 'Assinar'} ${plan}${price ? ` — ${fmtMoney(price)}/mês` : ''}`}
      footer={
        done || none ? (
          <Button variant="primary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={loading} disabled={!provider}>
              {provider === 'STRIPE' ? 'Ir para o pagamento' : trial.trialAvailable ? `Começar ${trial.days} dias grátis` : 'Assinar'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Alert tone="green">{done}</Alert>
      ) : none ? (
        <Alert tone="amber">Pagamentos ainda não configurados. Fale com a equipe REVAH para ativar sua assinatura.</Alert>
      ) : (
        <div className="stack">
          {error && <Alert tone="red">{error}</Alert>}
          {trial.trialAvailable ? (
            <p className="small">
              Os {trial.days} dias grátis começam agora. Ao fim do teste a mensalidade é cobrada automaticamente todo mês. Cancele quando quiser: durante o teste não há cobrança; depois, o ciclo já pago segue ativo até o fim.
            </p>
          ) : (
            <p className="small">A mensalidade é cobrada todo mês. Cancele quando quiser; o ciclo já pago segue ativo até o fim.</p>
          )}
          <div className="choice-grid">
            {providers.ASAAS && (
              <button className={`choice ${provider === 'ASAAS' ? 'active' : ''}`} onClick={() => setProvider('ASAAS')}>
                <span className="row gap-sm strong">
                  <Landmark size={16} /> Pagamento no Brasil
                </span>
                <span className="small muted">Pix, boleto ou cartão</span>
              </button>
            )}
            {providers.STRIPE && (
              <button className={`choice ${provider === 'STRIPE' ? 'active' : ''}`} onClick={() => setProvider('STRIPE')}>
                <span className="row gap-sm strong">
                  <Globe size={16} /> Cartão internacional
                </span>
                <span className="small muted">Pagamento seguro pelo Stripe</span>
              </button>
            )}
          </div>
          {provider === 'ASAAS' && (
            <Field label="CPF ou CNPJ do pagador" hint="Usado para emitir as cobranças.">
              <input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" />
            </Field>
          )}
          {provider === 'STRIPE' && <p className="small muted">Você será levado à página de pagamento do Stripe e volta para cá ao concluir.</p>}
        </div>
      )}
    </Modal>
  )
}

function ChangePlanModal({ current, plans, onClose, onDone }: { current: string; plans: { plan: string; price: number | null }[]; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [plan, setPlan] = useState(plans.find((p) => p.plan !== current)?.plan || '')
  const [loading, setLoading] = useState(false)
  async function submit() {
    setLoading(true)
    try {
      const r = await post<{ url: string | null; plan?: string }>('/billing/change-plan', { plan })
      if (r.url) {
        window.location.href = r.url
        return
      }
      fb.success(`Plano alterado para ${plan}. As próximas faturas usam o novo valor.`)
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
      title="Trocar plano"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!plan || plan === current}>
            Confirmar troca
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="choice-grid">
          {plans.map((p) => (
            <button key={p.plan} className={`choice ${plan === p.plan ? 'active' : ''}`} disabled={p.plan === current} onClick={() => setPlan(p.plan)}>
              <span className="strong">{p.plan}</span>
              <span className="small muted">{p.plan === current ? 'Plano atual' : p.price ? `${fmtMoney(p.price)}/mês` : ''}</span>
            </button>
          ))}
        </div>
        <p className="small muted">O novo valor vale para as faturas em aberto e as próximas.</p>
      </div>
    </Modal>
  )
}

function CancelModal({ sub, onClose, onDone }: { sub: Subscription; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const [loading, setLoading] = useState(false)
  const inTrial = sub.status === 'trialing'
  async function submit() {
    setLoading(true)
    try {
      await post('/billing/cancel')
      fb.success(inTrial ? 'Assinatura cancelada. Nada será cobrado.' : 'Cancelamento agendado. O plano segue ativo até o fim do ciclo pago.')
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
      title="Cancelar assinatura"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Manter assinatura
          </Button>
          <Button variant="danger" onClick={submit} loading={loading}>
            Confirmar cancelamento
          </Button>
        </>
      }
    >
      <div className="stack">
        {inTrial ? (
          <p>Você está no teste grátis: ao cancelar agora, nenhuma cobrança é feita e os envios são interrompidos.</p>
        ) : (
          <p>
            A renovação é cancelada. O ciclo já pago continua ativo até {fmtDate(sub.currentPeriodEnd)} e depois os envios são interrompidos.
          </p>
        )}
        <p className="small muted">Seus contatos, conversas e configurações continuam salvos. Você pode assinar de novo quando quiser.</p>
      </div>
    </Modal>
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
