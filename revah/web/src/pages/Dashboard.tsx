import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { get } from '../lib/api'
import { CALL_OUTCOME, CAMPAIGN_STATUS, CHANNEL_LABEL, fmtDate, fmtNumber, trialText } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { DashboardData } from '../lib/types'
import { Alert, Badge, Card, EmptyState, ErrorBox, Loading, PageHeader, Progress, Stat, useLoad } from '../components/ui'

export function TrialBanner({ trial, compact }: { trial: DashboardData['trial']; compact?: boolean }) {
  const { embedded, canManage } = useAuthed()
  const tt = trialText(trial)
  if (!tt) return null
  const pending = trial.paymentMethodRequired
  return (
    <div className={`trial-banner ${pending ? 'exhausted' : ''}`}>
      <div className="trial-banner-text">
        <Sparkles size={20} />
        <div>
          <strong>{tt.title}</strong>
          {!compact &&
            (pending ? (
              <div className="small">
                {trial.trialAvailable
                  ? `Você já pode explorar o painel. Os envios são liberados ao cadastrar a forma de pagamento; se cancelar antes do fim dos ${trial.days} dias, não há cobrança.`
                  : 'Este e-mail, telefone ou documento já usou o teste grátis. Assine um plano para liberar os envios.'}
              </div>
            ) : (
              <div className="small">
                {trial.endsAt ? `A primeira cobrança acontece em ${fmtDate(trial.endsAt)}, se você não cancelar antes.` : 'Ao fim do teste a assinatura mensal é cobrada automaticamente.'} Cancele quando quiser em Assinatura.
              </div>
            ))}
          {pending && (embedded || !canManage) && <div className="small">Peça ao responsável pela conta para cadastrar a forma de pagamento.</div>}
        </div>
      </div>
      {!embedded && canManage && (
        <Link to="/assinatura" className={`btn ${pending ? 'btn-primary' : 'btn-secondary'} btn-sm`}>
          {pending ? (trial.trialAvailable ? 'Cadastrar forma de pagamento' : 'Escolher plano') : 'Ver assinatura'}
        </Link>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { session } = useAuthed()
  const { data, loading, error, reload } = useLoad(() => get<DashboardData>('/dashboard'))

  if (loading && !data) return <Loading />
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />
  if (!data) return null

  const limit = data.limits.monthlyMessages
  const activeChannels = data.channels.filter((c) => c.isActive)
  const needsOnboarding = activeChannels.length === 0 || data.contacts === 0 || data.recentCampaigns.length === 0
  const firstName = session.user.name.split(' ')[0]
  const outboundByChannel = Object.entries(
    data.messagesByChannel.reduce<Record<string, { in: number; out: number }>>((acc, m) => {
      acc[m.channel] ||= { in: 0, out: 0 }
      acc[m.channel][m.direction === 'IN' ? 'in' : 'out'] += m.count
      return acc
    }, {}),
  )
  const maxMsgs = Math.max(1, ...outboundByChannel.map(([, v]) => v.in + v.out))
  const totalCalls = data.callsByOutcome.reduce((s, c) => s + c.count, 0)

  return (
    <div className="page">
      <PageHeader title={`Olá, ${firstName}`} subtitle="Resumo da sua operação nos últimos 30 dias." />
      <TrialBanner trial={data.trial} />

      {needsOnboarding && (
        <Card title="Primeiros passos">
          <ol className="checklist">
            <Step done={activeChannels.length > 0} to="/canais" title="Conecte um canal" text="WhatsApp, SMS, Telegram ou e-mail. Dá para começar em modo simulado." />
            <Step done={data.contacts > 0} to="/contatos" title="Importe seus contatos" text="Planilha CSV com nome e telefone ou e-mail." />
            <Step done={data.recentCampaigns.length > 0} to="/campanhas" title="Crie sua primeira campanha" text="Monte a mensagem, confira o público e faça um envio de teste." />
          </ol>
        </Card>
      )}

      <div className="stats">
        <Stat
          label="Mensagens enviadas no mês"
          value={fmtNumber(data.usage.messages)}
          sub={
            limit === 0 ? (
              'Envios liberados após cadastrar a forma de pagamento'
            ) : limit !== null ? (
              <>
                <Progress value={data.usage.messages} max={limit} tone={data.usage.messages / limit > 0.9 ? 'red' : 'indigo'} />
                de {fmtNumber(limit)} do plano
              </>
            ) : (
              'Volume conforme contrato'
            )
          }
        />
        <Stat label="Conversas abertas" value={fmtNumber(data.openConversations)} sub={<Link to="/inbox">Abrir inbox</Link>} />
        <Stat label="Aguardando atendente" value={fmtNumber(data.waitingHuman)} tone={data.waitingHuman > 0 ? 'amber' : undefined} sub="Com mensagens não lidas" />
        <Stat label="Contatos" value={fmtNumber(data.contacts)} sub={data.suppressions ? `${fmtNumber(data.suppressions)} bloqueios (opt-out)` : 'no CRM'} />
      </div>

      <div className="grid-2">
        <Card title="Campanhas recentes" actions={<Link to="/campanhas" className="small">Ver todas</Link>}>
          {data.recentCampaigns.length === 0 ? (
            <EmptyState title="Nenhuma campanha ainda" action={<Link to="/campanhas?nova=1" className="btn btn-primary btn-sm">Criar campanha</Link>} />
          ) : (
            <ul className="list">
              {data.recentCampaigns.map((c) => (
                <li key={c.id}>
                  <Link to={`/campanhas/${c.id}`} className="list-row">
                    <div>
                      <div className="strong">{c.name}</div>
                      <div className="small muted">
                        {CHANNEL_LABEL[c.channel]} · {fmtDate(c.createdAt)} · {c.sentCount}/{c.totalRecipients || '—'} enviados
                      </div>
                    </div>
                    <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label || c.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Canais conectados" actions={<Link to="/canais" className="small">Gerenciar</Link>}>
          {data.channels.length === 0 ? (
            <EmptyState title="Nenhum canal conectado" action={<Link to="/canais" className="btn btn-primary btn-sm">Conectar canal</Link>} />
          ) : (
            <ul className="list">
              {data.channels.map((c) => (
                <li key={c.id} className="list-row">
                  <div>
                    <div className="strong">{c.label}</div>
                    <div className="small muted">{CHANNEL_LABEL[c.channel]}</div>
                  </div>
                  <Badge tone={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Ativo' : 'Inativo'}</Badge>
                </li>
              ))}
            </ul>
          )}
          {!data.aiEnabled && (
            <Alert tone="amber">O atendimento com IA ainda não está configurado no servidor. As respostas automáticas usam regras simples até lá.</Alert>
          )}
        </Card>

        <Card title="Mensagens por canal (30 dias)">
          {outboundByChannel.length === 0 ? (
            <p className="muted">Sem mensagens no período.</p>
          ) : (
            <div className="bars">
              {outboundByChannel.map(([ch, v]) => (
                <div key={ch} className="bar-row">
                  <span className="bar-label">{CHANNEL_LABEL[ch] || ch}</span>
                  <div className="bar-track">
                    <div className="bar bar-out" style={{ width: `${(v.out / maxMsgs) * 100}%` }} title={`Enviadas: ${v.out}`} />
                    <div className="bar bar-in" style={{ width: `${(v.in / maxMsgs) * 100}%` }} title={`Recebidas: ${v.in}`} />
                  </div>
                  <span className="bar-value small">
                    {v.out} env · {v.in} rec
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Ligações por resultado (30 dias)" actions={<Link to="/voz" className="small">Ver ligações</Link>}>
          {totalCalls === 0 ? (
            <p className="muted">Nenhuma ligação no período.</p>
          ) : (
            <div className="bars">
              {data.callsByOutcome
                .sort((a, b) => b.count - a.count)
                .map((c) => (
                  <div key={c.outcome} className="bar-row">
                    <span className="bar-label">{CALL_OUTCOME[c.outcome] || c.outcome}</span>
                    <div className="bar-track">
                      <div className="bar bar-out" style={{ width: `${(c.count / totalCalls) * 100}%` }} />
                    </div>
                    <span className="bar-value small">{c.count}</span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Step({ done, to, title, text }: { done: boolean; to: string; title: string; text: string }) {
  return (
    <li className={done ? 'done' : ''}>
      {done ? <CheckCircle2 size={22} className="text-green" /> : <Circle size={22} className="muted" />}
      <div className="grow">
        <div className="strong">{title}</div>
        <div className="small muted">{text}</div>
      </div>
      {!done && (
        <Link to={to} className="btn btn-sm btn-primary">
          Começar
        </Link>
      )}
    </li>
  )
}
