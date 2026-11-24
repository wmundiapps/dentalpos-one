// Carrossel de ofertas: editor dos cards, prévia no celular e Torre de Controle da campanha.
import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Library, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { get, post } from '../lib/api'
import type { Campaign, CarouselCard, CarouselSpec, CarouselStats, CatalogItem, Channel } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, Field, Loading, Modal, Progress, Stat, Toggle, useLoad, usePolling } from '../components/ui'

export const EMPTY_CAROUSEL: CarouselSpec = { cards: [], optOutButton: true }
export const MAX_CARDS = 10
const DEFAULT_BUTTON = 'Quero saber mais'

function newCard(partial: Partial<CarouselCard> = {}): CarouselCard {
  return { title: '', subtitle: '', imageUrl: '', buttonText: DEFAULT_BUTTON, buttonUrl: null, buttonUrlText: null, catalogItemId: null, tag: null, ...partial }
}

export function validateCarousel(spec: CarouselSpec, channel: Channel): string {
  if (spec.cards.length < 2) return 'O carrossel precisa de pelo menos 2 cards.'
  if (spec.cards.length > MAX_CARDS) return `Use no máximo ${MAX_CARDS} cards.`
  for (const [i, c] of spec.cards.entries()) {
    if (!c.title.trim()) return `Dê um título ao card ${i + 1}.`
    if (!/^https?:\/\//.test(c.imageUrl.trim())) return `Coloque o link da imagem do card ${i + 1} (JPG ou PNG).`
    if (!c.buttonText.trim()) return `Escreva o texto do botão do card ${i + 1}.`
  }
  if (channel === 'WHATSAPP') {
    const withUrl = spec.cards.filter((c) => c.buttonUrl).length
    if (withUrl && withUrl !== spec.cards.length) return 'No WhatsApp todos os cards precisam ter os mesmos botões: coloque link em todos ou em nenhum.'
  }
  return ''
}

// Limpa campos vazios antes de enviar para a API.
export function carouselPayload(spec: CarouselSpec): CarouselSpec {
  return {
    optOutButton: spec.optOutButton,
    cards: spec.cards.map((c) => ({
      title: c.title.trim(),
      subtitle: c.subtitle?.trim() || null,
      imageUrl: c.imageUrl.trim(),
      buttonText: c.buttonText.trim() || DEFAULT_BUTTON,
      buttonUrl: c.buttonUrl?.trim() || null,
      buttonUrlText: c.buttonUrl?.trim() ? c.buttonUrlText?.trim() || 'Ver detalhes' : null,
      catalogItemId: c.catalogItemId || null,
      tag: c.tag?.trim() || null,
    })),
  }
}

export function CarouselEditor({ value, onChange, channel }: { value: CarouselSpec; onChange: (v: CarouselSpec) => void; channel: Channel }) {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const cards = value.cards
  const set = (cards: CarouselCard[]) => onChange({ ...value, cards })
  const update = (i: number, patch: Partial<CarouselCard>) => set(cards.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= cards.length) return
    const next = [...cards]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }

  return (
    <div className="stack">
      <div className="row between wrap gap-sm">
        <span className="small muted">
          {cards.length} de {MAX_CARDS} cards · o contato desliza, escolhe e toca no botão. Cada clique vira conversa com sua equipe.
        </span>
        <div className="row gap-xs">
          <Button size="sm" icon={<Library size={14} />} onClick={() => setCatalogOpen(true)} disabled={cards.length >= MAX_CARDS}>
            Importar do catálogo
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => set([...cards, newCard()])} disabled={cards.length >= MAX_CARDS}>
            Card
          </Button>
        </div>
      </div>
      {channel === 'WHATSAPP' && (
        <Alert tone="blue">
          No WhatsApp o carrossel é um modelo de marketing: depois de salvar, envie para aprovação da Meta (costuma levar de minutos a algumas horas). Imagens em JPG ou PNG,
          quadradas, com link público.
        </Alert>
      )}
      {cards.map((c, i) => (
        <div key={i} className="details-box stack">
          <div className="row between">
            <span className="strong">Card {i + 1}</span>
            <div className="row gap-xs">
              <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" />
              <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} onClick={() => move(i, 1)} disabled={i === cards.length - 1} aria-label="Descer" />
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => set(cards.filter((_, j) => j !== i))} aria-label="Remover" />
            </div>
          </div>
          <div className="grid-2 gap-sm">
            <Field label="Título" hint={`${c.title.length}/60`}>
              <input value={c.title} maxLength={60} onChange={(e) => update(i, { title: e.target.value })} placeholder="ex.: Pedagogia" />
            </Field>
            <Field label="Linha de apoio (opcional)">
              <input value={c.subtitle || ''} maxLength={90} onChange={(e) => update(i, { subtitle: e.target.value })} placeholder="ex.: Licenciatura · EAD" />
            </Field>
          </div>
          <Field label="Link da imagem" hint="JPG ou PNG, até 5 MB, de preferência quadrada (1:1).">
            <input value={c.imageUrl} onChange={(e) => update(i, { imageUrl: e.target.value })} placeholder="https://…/imagem.jpg" />
          </Field>
          <div className="grid-2 gap-sm">
            <Field label="Texto do botão" hint={`${c.buttonText.length}/25`}>
              <input value={c.buttonText} maxLength={25} onChange={(e) => update(i, { buttonText: e.target.value })} />
            </Field>
            <Field label="Etiqueta no contato (opcional)" hint="Padrão: o título do card.">
              <input value={c.tag || ''} maxLength={60} onChange={(e) => update(i, { tag: e.target.value })} />
            </Field>
          </div>
          <Field label="Link extra (opcional)" hint={channel === 'WHATSAPP' ? 'Se usar, coloque em todos os cards. Com link, o botão "Não quero receber" sai do card (a Meta aceita 2 botões).' : undefined}>
            <input value={c.buttonUrl || ''} onChange={(e) => update(i, { buttonUrl: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
      ))}
      <Toggle
        checked={value.optOutButton}
        onChange={(v) => onChange({ ...value, optOutButton: v })}
        label='Botão "Não quero receber" em cada card (recomendado: protege a qualidade do número)'
      />
      {catalogOpen && (
        <CatalogPicker
          max={MAX_CARDS - cards.length}
          onClose={() => setCatalogOpen(false)}
          onPick={(items) => {
            set([
              ...cards,
              ...items.map((it) => newCard({ title: it.title.slice(0, 60), subtitle: it.subtitle || '', imageUrl: it.imageUrl || '', buttonUrl: null, catalogItemId: it.id })),
            ])
            setCatalogOpen(false)
          }}
        />
      )}
    </div>
  )
}

const KIND_LABEL: Record<CatalogItem['kind'], string> = { CURSO: 'Curso', TRATAMENTO: 'Tratamento', PRODUTO: 'Produto', SERVICO: 'Serviço', OFERTA: 'Oferta' }
const SOURCE_LABEL: Record<CatalogItem['source'], string> = { MANUAL: 'Cadastro manual', DENTALPOS: 'DentalPos', EDUMASTER: 'EduMaster', API: 'Integração' }

function CatalogPicker({ max, onClose, onPick }: { max: number; onClose: () => void; onPick: (items: CatalogItem[]) => void }) {
  const list = useLoad(() => get<CatalogItem[]>('/catalog'))
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= max ? p : [...p, id]))
  return (
    <Modal
      open
      onClose={onClose}
      title="Importar do catálogo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" disabled={!picked.length} onClick={() => onPick((list.data || []).filter((i) => picked.includes(i.id)))}>
            Adicionar {picked.length || ''}
          </Button>
        </>
      }
    >
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.length ? (
        <p className="muted">
          O catálogo está vazio. Os cursos do EduMaster e os tratamentos do DentalPos aparecem aqui quando o sistema integrado sincroniza; você também pode cadastrar itens pela API
          (POST /v1/catalog).
        </p>
      ) : (
        <div className="stack">
          <p className="small muted">Escolha até {max} itens. Sem imagem no catálogo, você coloca o link depois.</p>
          {list.data.map((it) => (
            <label key={it.id} className="row gap-sm chip-check">
              <input type="checkbox" checked={picked.includes(it.id)} onChange={() => toggle(it.id)} />
              <span className="min0">
                <span className="strong">{it.title}</span>
                <span className="small muted">
                  {' '}
                  · {KIND_LABEL[it.kind]} · {SOURCE_LABEL[it.source]}
                  {it.subtitle ? ` · ${it.subtitle}` : ''}
                  {!it.imageUrl ? ' · sem imagem' : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  )
}

// Prévia: um card por vez, como o contato vê (setas para passar).
export function CarouselPreview({ spec, opening }: { spec: CarouselSpec; opening: string }) {
  const [i, setI] = useState(0)
  const n = spec.cards.length
  if (!n) return <p className="muted small">Os cards aparecem aqui.</p>
  const idx = Math.min(i, n - 1)
  const c = spec.cards[idx]
  return (
    <div className="stack">
      {opening && <div className="message-preview">{opening}</div>}
      <div className="carousel-card">
        {c.imageUrl ? <img src={c.imageUrl} alt="" className="carousel-img" /> : <div className="carousel-img carousel-img-empty">sem imagem</div>}
        <div className="carousel-body">
          <div className="strong">{c.title || 'Título do card'}</div>
          {c.subtitle && <div className="small muted">{c.subtitle}</div>}
        </div>
        <div className="carousel-btn">{c.buttonText || DEFAULT_BUTTON}</div>
        {c.buttonUrl && <div className="carousel-btn">{c.buttonUrlText || 'Ver detalhes'}</div>}
        {spec.optOutButton && <div className="carousel-btn muted">Não quero receber</div>}
      </div>
      <div className="row between">
        <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} onClick={() => setI((idx - 1 + n) % n)} aria-label="Card anterior" />
        <span className="small muted">
          {idx + 1} de {n}
        </span>
        <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />} onClick={() => setI((idx + 1) % n)} aria-label="Próximo card" />
      </div>
    </div>
  )
}

const TEMPLATE_STATUS: Record<string, { label: string; tone: 'gray' | 'green' | 'red' | 'amber' | 'blue' }> = {
  PENDING: { label: 'Aguardando a Meta', tone: 'amber' },
  APPROVED: { label: 'Aprovado', tone: 'green' },
  REJECTED: { label: 'Rejeitado', tone: 'red' },
  PAUSED: { label: 'Pausado pela Meta', tone: 'amber' },
  DISABLED: { label: 'Desativado pela Meta', tone: 'red' },
}

// Painel da campanha com carrossel: aprovação do modelo (WhatsApp) e Torre de Controle.
export function CarouselPanel({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const fb = useFeedback()
  const [busy, setBusy] = useState('')
  const isWa = campaign.channel === 'WHATSAPP'
  const stats = useLoad(() => get<CarouselStats>(`/campaigns/${campaign.id}/carousel/stats`), [campaign.id])
  const live = ['RUNNING', 'SCHEDULED', 'PAUSED', 'COMPLETED'].includes(campaign.status)
  usePolling(() => stats.reload(true), 30_000, live)
  usePolling(() => onChanged(), 60_000, isWa && campaign.waTemplateStatus === 'PENDING')

  async function act(kind: 'submit' | 'refresh') {
    setBusy(kind)
    try {
      await post(`/campaigns/${campaign.id}/carousel/${kind}`)
      fb.success(kind === 'submit' ? 'Modelo enviado para aprovação da Meta.' : 'Status atualizado.')
      onChanged()
    } catch (e) {
      fb.fail(e)
    } finally {
      setBusy('')
    }
  }

  const st = campaign.waTemplateStatus ? TEMPLATE_STATUS[campaign.waTemplateStatus] || { label: campaign.waTemplateStatus, tone: 'gray' as const } : null
  const f = stats.data?.funnel
  const maxCard = Math.max(1, ...(stats.data?.cards || []).map((c) => c.interest))

  return (
    <div className="stack">
      {isWa && campaign.status === 'DRAFT' && (
        <Card
          title="Aprovação na Meta"
          actions={
            <div className="row gap-xs">
              {campaign.waTemplateStatus && (
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} loading={busy === 'refresh'} onClick={() => act('refresh')}>
                  Consultar
                </Button>
              )}
              {campaign.waTemplateStatus !== 'APPROVED' && campaign.waTemplateStatus !== 'PENDING' && (
                <Button size="sm" variant="primary" icon={<ShieldCheck size={14} />} loading={busy === 'submit'} onClick={() => act('submit')}>
                  {campaign.waTemplateStatus === 'REJECTED' ? 'Corrigir e reenviar' : 'Enviar para aprovação'}
                </Button>
              )}
            </div>
          }
        >
          {st ? (
            <p>
              Modelo: <Badge tone={st.tone}>{st.label}</Badge>
              {campaign.waTemplateRejection ? <span className="small text-red"> · motivo da Meta: {campaign.waTemplateRejection}</span> : null}
            </p>
          ) : (
            <p className="muted">Ainda não enviado. A Meta precisa aprovar o carrossel antes do disparo.</p>
          )}
          {campaign.waTemplateStatus === 'REJECTED' && <p className="small muted">Edite o texto de abertura ou os cards (evite promessas e letras maiúsculas em excesso) e reenvie.</p>}
        </Card>
      )}

      <Card title="Torre de Controle" actions={<Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => stats.reload()} loading={stats.loading}>Atualizar</Button>}>
        {!f ? (
          <Loading />
        ) : (
          <div className="stack">
            <div className="stats">
              <Stat label="Enviadas" value={f.sent} />
              <Stat label="Entregues" value={f.delivered} />
              <Stat label="Lidas" value={f.read} />
              <Stat label="Interessados" value={f.interested} tone="green" sub={f.sent ? `${Math.round((f.interested / f.sent) * 100)}% das enviadas` : undefined} />
              <Stat label="Não querem receber" value={f.optOuts} tone={f.optOuts ? 'amber' : undefined} />
              <Stat label="Falhas" value={f.failed} tone={f.failed ? 'red' : undefined} />
            </div>
            <div>
              <div className="field-label">Cliques por card</div>
              {stats.data!.cards.map((c) => (
                <div key={c.index} className="carousel-stat">
                  <div className="row between small">
                    <span>{c.title}</span>
                    <span className="muted">
                      {c.interest} interessado(s){c.optOut ? ` · ${c.optOut} saída(s)` : ''}
                    </span>
                  </div>
                  <Progress value={c.interest} max={maxCard} tone="green" />
                </div>
              ))}
            </div>
            {stats.data!.agents.length > 0 && (
              <div>
                <div className="field-label">Conversas geradas por atendente</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Atendente</th>
                      <th>Em aberto</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.data!.agents.map((a) => (
                      <tr key={a.userId || 'bot'}>
                        <td>{a.name}</td>
                        <td>{a.open}</td>
                        <td>{a.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
