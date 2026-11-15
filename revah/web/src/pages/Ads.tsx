import { useEffect, useState } from 'react'
import { AlertTriangle, Megaphone, Plus, Sparkles, Trash2 } from 'lucide-react'
import { del, get, post, put } from '../lib/api'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, Loading, PageHeader, useLoad } from '../components/ui'

// REVAH Ads: add-on vendido à parte. A IA monta o plano do anúncio para Facebook e Instagram.
type Goal = 'MESSAGES' | 'LEADS' | 'SALES' | 'TRAFFIC'
const GOALS: { value: Goal; label: string }[] = [
  { value: 'MESSAGES', label: 'Conversas no WhatsApp / Direct' },
  { value: 'LEADS', label: 'Cadastros (formulário)' },
  { value: 'SALES', label: 'Vendas no site' },
  { value: 'TRAFFIC', label: 'Visitas ao site' },
]
const CTA_LABEL: Record<string, string> = {
  SEND_WHATSAPP_MESSAGE: 'Enviar mensagem no WhatsApp',
  SEND_MESSAGE: 'Enviar mensagem',
  LEARN_MORE: 'Saiba mais',
  SIGN_UP: 'Cadastre-se',
  BOOK_NOW: 'Agendar agora',
  CONTACT_US: 'Fale conosco',
  GET_QUOTE: 'Pedir orçamento',
  SHOP_NOW: 'Comprar agora',
  GET_OFFER: 'Obter oferta',
}

interface Variant {
  angle: string
  primaryText: string
  headline: string
  description: string
  cta: string
  creativeBrief: string
}
interface AdResult {
  strategy: string
  campaignObjective: string
  audience: { ageMin: number; ageMax: number; genders: string; locations: string[]; interests: string[]; exclusions: string[]; advantagePlus: boolean }
  budget: { dailySuggested: number; testDays: number; howToSplit: string }
  variants: Variant[]
  policyWarnings: string[]
  successMetrics: string[]
  nextSteps: string[]
  flagged?: string[]
}
interface AdPlan {
  id: string
  name: string
  business: string
  offer: string | null
  audience: string | null
  location: string | null
  goal: Goal
  dailyBudget: string | null
  result: AdResult | null
  generatedAt: string | null
  updatedAt: string
}

export default function Ads() {
  const access = useLoad(() => get<{ addonActive: boolean; aiAvailable: boolean }>('/ads/access'))
  const a = access.data
  return (
    <div className="page">
      <PageHeader title="REVAH Ads" subtitle="A IA monta seus anúncios para Facebook e Instagram: estratégia, público, verba e textos prontos." />
      <ErrorBox error={access.error} onRetry={access.reload} />
      {access.loading && !a ? <Loading /> : a && !a.addonActive ? <AdsCta /> : a ? <AdsWorkspace aiAvailable={a.aiAvailable} /> : null}
    </div>
  )
}

function AdsCta() {
  return (
    <Card>
      <div className="cta">
        <Megaphone size={28} className="text-indigo" />
        <h2>Anúncios que trazem clientes, montados pela IA</h2>
        <p>O REVAH Ads é contratado à parte. Você descreve o seu negócio e a IA entrega o plano completo da campanha no Meta (Facebook e Instagram).</p>
        <ul className="bullets">
          <li>Estratégia, objetivo e público ideal para a sua verba</li>
          <li>5 variações de texto, título e chamada, dentro dos limites do Meta</li>
          <li>Ideia da imagem ou vídeo de cada anúncio</li>
          <li>Alertas de reprovação (políticas do Meta e regras do seu conselho profissional)</li>
          <li>O lead do anúncio entra no CRM e é atendido na hora pelo robô do REVAH</li>
        </ul>
        <div className="row wrap gap-sm center-x">
          <a className="btn btn-primary" href="https://revah.com.br/#contato" target="_blank" rel="noreferrer">
            Quero contratar
          </a>
        </div>
      </div>
    </Card>
  )
}

const EMPTY = { name: '', business: '', offer: '', audience: '', location: '', goal: 'MESSAGES' as Goal, dailyBudget: '' }

function AdsWorkspace({ aiAvailable }: { aiAvailable: boolean }) {
  const fb = useFeedback()
  const plans = useLoad(() => get<AdPlan[]>('/ads/plans'))
  const [selected, setSelected] = useState<AdPlan | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    setForm(
      selected
        ? {
            name: selected.name,
            business: selected.business,
            offer: selected.offer || '',
            audience: selected.audience || '',
            location: selected.location || '',
            goal: selected.goal,
            dailyBudget: selected.dailyBudget ? String(Number(selected.dailyBudget)) : '',
          }
        : EMPTY,
    )
  }, [selected])

  const body = () => ({
    name: form.name.trim(),
    business: form.business.trim(),
    offer: form.offer.trim() || null,
    audience: form.audience.trim() || null,
    location: form.location.trim() || null,
    goal: form.goal,
    dailyBudget: form.dailyBudget ? Number(form.dailyBudget.replace(',', '.')) : null,
  })

  async function saveAndGenerate() {
    setBusy('generate')
    try {
      const saved = selected ? await put<AdPlan>(`/ads/plans/${selected.id}`, body()) : await post<AdPlan>('/ads/plans', body())
      setSelected(saved)
      const done = await post<AdPlan>(`/ads/plans/${saved.id}/generate`)
      setSelected(done)
      plans.reload(true)
      fb.success('Plano do anúncio pronto.')
    } catch (e) {
      fb.fail(e)
      plans.reload(true)
    } finally {
      setBusy('')
    }
  }

  async function remove(p: AdPlan) {
    if (!confirm(`Apagar o plano "${p.name}"?`)) return
    try {
      await del(`/ads/plans/${p.id}`)
      if (selected?.id === p.id) setSelected(null)
      plans.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  const valid = form.name.trim().length >= 2 && form.business.trim().length >= 10
  return (
    <div className="stack">
      {!aiAvailable && <Alert tone="amber">A IA está indisponível no momento. Você pode salvar o plano e gerar depois.</Alert>}
      <Card
        title={selected ? `Plano: ${selected.name}` : 'Novo anúncio'}
        actions={
          selected ? (
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setSelected(null)}>
              Novo
            </Button>
          ) : null
        }
      >
        <div className="stack">
          <div className="grid-2 gap-sm">
            <Field label="Nome do anúncio">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Implantes — novembro" maxLength={80} />
            </Field>
            <Field label="Objetivo">
              <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value as Goal })}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="O que a empresa vende e para quem" hint="Quanto mais detalhe, melhor o anúncio.">
            <textarea rows={3} value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} maxLength={1500} placeholder="ex.: Clínica odontológica em Maringá especializada em implantes para adultos de 35 a 65 anos" />
          </Field>
          <div className="grid-2 gap-sm">
            <Field label="Oferta (opcional)">
              <input value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })} maxLength={500} placeholder="ex.: avaliação gratuita em novembro" />
            </Field>
            <Field label="Público desejado (opcional)">
              <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} maxLength={500} placeholder="ex.: adultos que perderam dentes" />
            </Field>
            <Field label="Onde anunciar">
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={200} placeholder="ex.: Maringá-PR e região" />
            </Field>
            <Field label="Verba por dia (R$, opcional)">
              <input inputMode="decimal" value={form.dailyBudget} onChange={(e) => setForm({ ...form, dailyBudget: e.target.value })} placeholder="ex.: 30" />
            </Field>
          </div>
          <div className="row end">
            <Button variant="primary" icon={<Sparkles size={16} />} onClick={saveAndGenerate} loading={busy === 'generate'} disabled={!valid || !aiAvailable}>
              {selected?.result ? 'Gerar de novo' : 'Gerar anúncio com IA'}
            </Button>
          </div>
          {busy === 'generate' && <p className="small muted">A IA está montando o plano. Pode levar até um minuto.</p>}
        </div>
      </Card>

      {selected?.result && <AdResultView r={selected.result} />}

      <Card title="Meus anúncios" pad={false}>
        {plans.loading && !plans.data ? (
          <Loading />
        ) : !plans.data?.length ? (
          <EmptyState icon={<Megaphone size={28} />} title="Nenhum anúncio ainda">
            Preencha o formulário acima e clique em Gerar.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="link-btn strong" onClick={() => setSelected(p)}>
                        {p.name}
                      </button>
                      <div className="small muted">{GOALS.find((g) => g.value === p.goal)?.label}</div>
                    </td>
                    <td className="small">{p.generatedAt ? <Badge tone="green">Pronto</Badge> : <Badge tone="gray">Rascunho</Badge>}</td>
                    <td className="w-check">
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(p)} aria-label={`Apagar ${p.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function AdResultView({ r }: { r: AdResult }) {
  const genders = r.audience.genders === 'FEMALE' ? 'Mulheres' : r.audience.genders === 'MALE' ? 'Homens' : 'Todos'
  return (
    <div className="stack">
      {(r.flagged?.length || 0) > 0 && (
        <Alert tone="red" title="Revise antes de usar">
          {r.flagged!.join(' ')}
        </Alert>
      )}
      <Card title="Estratégia">
        <div className="stack">
          <p>{r.strategy}</p>
          <div className="grid-2 gap-sm small">
            <div>
              <div className="strong">Público</div>
              <div>
                {genders}, {r.audience.ageMin}–{r.audience.ageMax} anos
              </div>
              <div>Locais: {r.audience.locations.join('; ') || '—'}</div>
              <div>Interesses: {r.audience.interests.join(', ') || '—'}</div>
              {r.audience.exclusions.length > 0 && <div>Excluir: {r.audience.exclusions.join(', ')}</div>}
              {r.audience.advantagePlus && <div className="muted">Recomendado: público Advantage+ do Meta.</div>}
            </div>
            <div>
              <div className="strong">Verba</div>
              <div>
                R$ {r.budget.dailySuggested.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por dia, testar por {r.budget.testDays} dias
              </div>
              <div className="muted">{r.budget.howToSplit}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="5 variações prontas">
        <div className="stack">
          {r.variants.map((v, i) => (
            <div key={i} className="stack" style={{ borderTop: i ? '1px solid var(--line, #1f3a2b)' : undefined, paddingTop: i ? 12 : 0 }}>
              <div className="row wrap gap-sm between">
                <span className="strong">
                  {i + 1}. {v.angle}
                </span>
                <CopyButton text={`${v.primaryText}\n\nTítulo: ${v.headline}\nDescrição: ${v.description}\nBotão: ${CTA_LABEL[v.cta] || v.cta}`} label="Copiar textos" />
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{v.primaryText}</p>
              <div className="small">
                <strong>Título:</strong> {v.headline} · <strong>Descrição:</strong> {v.description} · <strong>Botão:</strong> {CTA_LABEL[v.cta] || v.cta}
              </div>
              <div className="small muted">
                <strong>Imagem/vídeo:</strong> {v.creativeBrief}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {r.policyWarnings.length > 0 && (
        <Card title={<span className="row gap-sm"><AlertTriangle size={16} /> Cuidados para não ser reprovado</span>}>
          <ul className="bullets">
            {r.policyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Como acompanhar">
        <ul className="bullets">
          {[...r.successMetrics, ...r.nextSteps].map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
