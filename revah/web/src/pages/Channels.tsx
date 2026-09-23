import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plug, Plus, Star, Trash2, XCircle, Zap } from 'lucide-react'
import { del, get, patch, post } from '../lib/api'
import { CHANNEL_LABEL, fmtPhone } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Channel, ChannelAccount, ProviderInfo } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Toggle, useLoad } from '../components/ui'

interface ProvidersResponse {
  providers: ProviderInfo[]
  unofficialWarning: string
}

export default function Channels() {
  const fb = useFeedback()
  const { canManage } = useAuthed()
  const list = useLoad(() => get<ChannelAccount[]>('/channels'))
  const providers = useLoad(() => get<ProvidersResponse>('/channels/providers'))
  const [connectOpen, setConnectOpen] = useState(false)
  const [testing, setTesting] = useState<ChannelAccount | null>(null)
  const providerLabel = (k: string) => providers.data?.providers.find((p) => p.key === k)?.label || k

  async function update(a: ChannelAccount, body: Record<string, unknown>, msg: string) {
    try {
      await patch(`/channels/${a.id}`, body)
      fb.success(msg)
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  async function remove(a: ChannelAccount) {
    if (!confirm(`Remover o canal “${a.label}”? As conversas e o histórico continuam no CRM.`)) return
    try {
      await del(`/channels/${a.id}`)
      fb.success('Canal removido.')
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Canais"
        subtitle="Números e contas usados para enviar e receber mensagens e ligações."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setConnectOpen(true)}>
              Conectar canal
            </Button>
          )
        }
      />
      <ErrorBox error={list.error || providers.error} onRetry={() => { list.reload(); providers.reload() }} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <EmptyState
          icon={<Plug size={28} />}
          title="Nenhum canal conectado"
          action={
            canManage && (
              <Button variant="primary" onClick={() => setConnectOpen(true)}>
                Conectar canal
              </Button>
            )
          }
        >
          Para WhatsApp recomendamos a API oficial da Meta. Você pode começar em modo simulado para testar o fluxo sem enviar nada.
        </EmptyState>
      ) : (
        <div className="cards-list">
          {list.data?.map((a) => (
            <Card key={a.id}>
              <div className="row between gap-sm wrap">
                <div className="min0">
                  <div className="strong">{a.label}</div>
                  <div className="small muted">
                    {CHANNEL_LABEL[a.channel]} · {providerLabel(a.provider)} · {['WHATSAPP', 'SMS', 'VOICE'].includes(a.channel) ? fmtPhone(a.address) : a.address}
                  </div>
                </div>
                <div className="row wrap gap-xs">
                  {a.isDefault && <Badge tone="indigo">Padrão</Badge>}
                  {a.simulated && <Badge tone="blue">Simulado</Badge>}
                  {!a.official && (
                    <Badge tone="amber" title="Provedor não oficial do WhatsApp">
                      Não oficial
                    </Badge>
                  )}
                  <Badge tone={a.isActive ? 'green' : 'gray'}>{a.isActive ? 'Ativo' : 'Inativo'}</Badge>
                </div>
              </div>
              {a.webhook && (
                <div className="webhook">
                  <div className="small muted">{a.webhook.automatic ? 'Webhook (configurado automaticamente)' : 'URL do webhook — cole no painel do provedor'}</div>
                  <div className="row gap-sm">
                    <code className="grow ellipsis">{a.webhook.url}</code>
                    <CopyButton text={a.webhook.url} />
                  </div>
                  {a.webhook.verifyToken && (
                    <div className="row gap-sm small">
                      <span className="muted">Token de verificação:</span>
                      <code className="ellipsis">{a.webhook.verifyToken}</code>
                      <CopyButton text={a.webhook.verifyToken} />
                    </div>
                  )}
                  {a.webhook.note && <div className="small muted">{a.webhook.note}</div>}
                </div>
              )}
              <div className="row wrap gap-sm">
                <Button size="sm" icon={<Zap size={14} />} onClick={() => setTesting(a)}>
                  Testar
                </Button>
                {canManage && !a.isDefault && (
                  <Button size="sm" variant="ghost" icon={<Star size={14} />} onClick={() => update(a, { isDefault: true }, 'Canal definido como padrão.')}>
                    Tornar padrão
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => update(a, { isActive: !a.isActive }, a.isActive ? 'Canal desativado.' : 'Canal ativado.')}>
                    {a.isActive ? 'Desativar' : 'Ativar'}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(a)}>
                    Remover
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {connectOpen && providers.data && (
        <ConnectModal
          data={providers.data}
          onClose={() => setConnectOpen(false)}
          onDone={() => {
            setConnectOpen(false)
            list.reload(true)
          }}
        />
      )}
      {testing && <TestModal account={testing} onClose={() => setTesting(null)} />}
    </div>
  )
}

const ADDRESS_HINT: Record<string, { label: string; hint: string; placeholder: string }> = {
  WHATSAPP: { label: 'Número do WhatsApp', hint: 'Com DDD.', placeholder: '(44) 99999-9999' },
  SMS: { label: 'Número remetente', hint: 'Número comprado no provedor.', placeholder: '+55 44 99999-9999' },
  VOICE: { label: 'Número de voz', hint: 'Número comprado no provedor.', placeholder: '+55 44 99999-9999' },
  TELEGRAM: { label: 'Usuário do bot', hint: 'Ex.: @minhaclinica_bot', placeholder: '@meubot' },
  EMAIL: { label: 'E-mail remetente', hint: 'Domínio verificado no provedor.', placeholder: 'contato@suaempresa.com.br' },
  INSTAGRAM: { label: 'Conta do Instagram', hint: 'Usuário ou ID da conta.', placeholder: '@suaempresa' },
  MESSENGER: { label: 'Página do Facebook', hint: 'Nome ou ID da página.', placeholder: 'Sua Empresa' },
}

function ConnectModal({ data, onClose, onDone }: { data: ProvidersResponse; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback()
  const channels = useMemo(() => {
    const set = new Set<Channel>()
    data.providers.forEach((p) => p.channels.forEach((c) => set.add(c)))
    return [...set]
  }, [data])
  const [channel, setChannel] = useState<Channel>('WHATSAPP')
  const options = data.providers.filter((p) => p.channels.includes(channel)).sort((a, b) => Number(b.official) - Number(a.official))
  const [provider, setProvider] = useState(options[0]?.key || '')
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [externalId, setExternalId] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [simulated, setSimulated] = useState(false)
  const [ack, setAck] = useState(false)
  const [isDefault, setIsDefault] = useState(true)
  const [defTpl, setDefTpl] = useState({ name: '', language: 'pt_BR' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ account: ChannelAccount; connection: { ok: boolean; info?: string; error?: string } } | null>(null)

  const info = data.providers.find((p) => p.key === provider)
  const unofficial = info && !info.official
  const addr = ADDRESS_HINT[channel]

  function pickChannel(c: Channel) {
    setChannel(c)
    const opts = data.providers.filter((p) => p.channels.includes(c)).sort((a, b) => Number(b.official) - Number(a.official))
    setProvider(opts[0]?.key || '')
    setCreds({})
    setAck(false)
  }

  async function submit() {
    setError('')
    if (!label.trim() || !address.trim()) return setError('Informe um nome e o número/endereço.')
    if (unofficial && !ack) return setError('Confirme que entendeu os riscos do provedor não oficial.')
    const credentials: Record<string, unknown> = simulated ? { simulated: true } : Object.fromEntries(Object.entries(creds).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
    if (!simulated) {
      const missing = (info?.fields || []).filter((f) => !f.optional && !creds[f.key]?.trim()).map((f) => f.label)
      if (missing.length) return setError(`Preencha: ${missing.join(', ')}.`)
    }
    setLoading(true)
    try {
      const r = await post<{ account: ChannelAccount; connection: { ok: boolean; info?: string; error?: string } }>('/channels', {
        channel,
        provider,
        label: label.trim(),
        address: address.trim(),
        externalId: externalId.trim() || null,
        credentials,
        isDefault,
        ...(provider === 'META_CLOUD' && defTpl.name.trim() ? { settings: { defaultTemplate: { name: defTpl.name.trim(), language: defTpl.language.trim() || 'pt_BR' } } } : {}),
        ...(unofficial ? { acknowledgeRisk: true } : {}),
      })
      setResult(r)
    } catch (e: any) {
      if (e?.status === 402) fb.fail(e)
      else setError(e?.message || 'Não foi possível conectar.')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <Modal open onClose={onDone} title="Canal conectado" footer={<Button variant="primary" onClick={onDone}>Concluir</Button>}>
        <div className="stack">
          <Alert tone={result.connection.ok ? 'green' : 'amber'} title={result.connection.ok ? 'Conexão verificada' : 'Canal salvo, mas a verificação falhou'}>
            {result.connection.ok ? result.connection.info || 'Credenciais aceitas pelo provedor.' : result.connection.error}
          </Alert>
          {result.account.webhook && !result.account.webhook.automatic && (
            <div className="webhook">
              <div className="small muted">Cole esta URL no painel do provedor para receber mensagens:</div>
              <div className="row gap-sm">
                <code className="grow ellipsis">{result.account.webhook.url}</code>
                <CopyButton text={result.account.webhook.url} />
              </div>
              {result.account.webhook.verifyToken && (
                <div className="row gap-sm small">
                  <span className="muted">Token de verificação:</span> <code>{result.account.webhook.verifyToken}</code>
                  <CopyButton text={result.account.webhook.verifyToken} />
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Conectar canal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={Boolean(unofficial && !ack)}>
            Conectar
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Canal">
          <div className="choice-grid choice-grid-sm">
            {channels.map((c) => (
              <button key={c} className={`choice ${channel === c ? 'active' : ''}`} onClick={() => pickChannel(c)}>
                <span className="strong">{CHANNEL_LABEL[c]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Provedor">
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setCreds({}); setAck(false) }}>
            {options.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.key === 'META_CLOUD' ? ' — recomendado' : ''}
              </option>
            ))}
          </select>
        </Field>
        {channel === 'WHATSAPP' && provider === 'META_CLOUD' && (
          <Alert tone="green">API oficial da Meta: maior estabilidade e menor risco de bloqueio do número. Exige modelos aprovados para iniciar conversas.</Alert>
        )}
        {unofficial && (
          <div className="risk">
            <div className="row gap-sm strong">
              <AlertTriangle size={18} /> Atenção: provedor não oficial
            </div>
            <p>{data.unofficialWarning}</p>
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>Entendo e assumo o risco de bloqueio ou banimento do número. Sei que a API oficial da Meta é a opção recomendada.</span>
            </label>
          </div>
        )}
        <div className="grid-2 gap-sm">
          <Field label="Nome interno">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex.: WhatsApp recepção" maxLength={80} />
          </Field>
          <Field label={addr?.label || 'Endereço'} hint={addr?.hint}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={addr?.placeholder} />
          </Field>
        </div>
        {(channel === 'INSTAGRAM' || channel === 'MESSENGER') && (
          <Field label="ID da página/conta (Meta)" hint="Usado para identificar as mensagens recebidas.">
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </Field>
        )}
        <Toggle checked={simulated} onChange={setSimulated} label="Modo simulado (teste): nada é enviado de verdade" />
        {!simulated && info && info.fields.length > 0 && (
          <div className="grid-2 gap-sm">
            {info.fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.optional ? ' (opcional)' : ''}`}>
                <input
                  type={f.secret ? 'password' : 'text'}
                  autoComplete="off"
                  value={creds[f.key] || ''}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        )}
        {provider === 'META_CLOUD' && (
          <details className="details-box">
            <summary>Modelo padrão fora da janela de 24h (opcional)</summary>
            <p className="small muted">Se preenchido, mensagens para quem não falou com você nas últimas 24h usam este modelo aprovado, com o texto como parâmetro.</p>
            <div className="grid-2 gap-sm">
              <Field label="Nome do modelo">
                <input value={defTpl.name} onChange={(e) => setDefTpl({ ...defTpl, name: e.target.value })} />
              </Field>
              <Field label="Idioma">
                <input value={defTpl.language} onChange={(e) => setDefTpl({ ...defTpl, language: e.target.value })} />
              </Field>
            </div>
          </details>
        )}
        <Toggle checked={isDefault} onChange={setIsDefault} label="Usar como padrão deste canal" />
        <p className="small muted">As credenciais são guardadas criptografadas e não são exibidas novamente.</p>
      </div>
    </Modal>
  )
}

function TestModal({ account, onClose }: { account: ChannelAccount; onClose: () => void }) {
  const fb = useFeedback()
  const [destination, setDestination] = useState('')
  const [text, setText] = useState('Mensagem de teste.')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ connection: { ok: boolean; info?: string; error?: string }; send: { ok: boolean; status: string; error: string | null } | null } | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      setResult(await post(`/channels/${account.id}/test`, destination.trim() ? { destination: destination.trim(), text } : {}))
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
      title={`Testar ${account.label}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="primary" onClick={run} loading={loading}>
            {destination.trim() ? 'Testar e enviar' : 'Testar conexão'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {account.channel !== 'VOICE' && (
          <>
            <Field label="Enviar mensagem de teste para (opcional)" hint={account.channel === 'EMAIL' ? 'E-mail' : account.channel === 'TELEGRAM' ? 'Chat ID' : 'Telefone com DDD'}>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </Field>
            {destination.trim() && (
              <Field label="Texto">
                <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            )}
          </>
        )}
        {result && (
          <div className="stack">
            <div className="row gap-sm">
              {result.connection.ok ? <CheckCircle2 size={18} className="text-green" /> : <XCircle size={18} className="text-red" />}
              <span>Conexão: {result.connection.ok ? result.connection.info || 'OK' : result.connection.error}</span>
            </div>
            {result.send && (
              <div className="row gap-sm">
                {result.send.ok ? <CheckCircle2 size={18} className="text-green" /> : <XCircle size={18} className="text-red" />}
                <span>Envio: {result.send.ok ? `status ${result.send.status}` : result.send.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
