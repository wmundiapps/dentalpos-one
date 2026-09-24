import { useEffect, useState } from 'react'
import { KeyRound, Plus, RefreshCw, ShieldOff } from 'lucide-react'
import { del, get, patch, post, put } from '../lib/api'
import { ALL_CHANNELS, CHANNEL_LABEL, ROLE_LABEL, SUPPRESSION_REASON, fmtDateTime, fmtPhone } from '../lib/format'
import { useAuthed } from '../lib/session'
import type { Channel, Suppression, TeamUser } from '../lib/types'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, CopyButton, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, Tabs, Toggle, useLoad } from '../components/ui'

type Tab = 'empresa' | 'bot' | 'equipe' | 'api' | 'integracao' | 'bloqueios' | 'auditoria' | 'senha'

export default function SettingsPage() {
  const { canManage } = useAuthed()
  const [tab, setTab] = useState<Tab>('empresa')
  const items: { value: Tab; label: string }[] = [
    { value: 'empresa', label: 'Empresa' },
    { value: 'bot', label: 'Chatbot e IA' },
    { value: 'equipe', label: 'Equipe' },
    ...(canManage
      ? ([
          { value: 'api', label: 'Chaves de API' },
          { value: 'integracao', label: 'Integração' },
        ] as { value: Tab; label: string }[])
      : []),
    { value: 'bloqueios', label: 'Bloqueios' },
    ...(canManage ? ([{ value: 'auditoria', label: 'Auditoria' }] as { value: Tab; label: string }[]) : []),
    { value: 'senha', label: 'Minha senha' },
  ]
  return (
    <div className="page">
      <PageHeader title="Configurações" />
      <div className="tabs-scroll">
        <Tabs value={tab} onChange={setTab} items={items} />
      </div>
      {tab === 'empresa' && <CompanyTab />}
      {tab === 'bot' && <BotTab />}
      {tab === 'equipe' && <TeamTab />}
      {tab === 'api' && <ApiKeysTab />}
      {tab === 'integracao' && <IntegrationTab />}
      {tab === 'bloqueios' && <SuppressionsTab />}
      {tab === 'auditoria' && <AuditTab />}
      {tab === 'senha' && <PasswordTab />}
    </div>
  )
}

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha']

function CompanyTab() {
  const fb = useFeedback()
  const { canManage, refresh } = useAuthed()
  const c = useLoad(() => get<{ name: string; document: string | null; phone: string | null; timezone: string }>('/settings/company'))
  const [f, setF] = useState({ name: '', document: '', phone: '', timezone: 'America/Sao_Paulo' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (c.data) setF({ name: c.data.name, document: c.data.document || '', phone: c.data.phone || '', timezone: c.data.timezone })
  }, [c.data])
  async function save() {
    setSaving(true)
    try {
      await patch('/settings/company', { name: f.name.trim(), document: f.document, phone: f.phone, timezone: f.timezone })
      fb.success('Dados da empresa salvos.')
      refresh().catch(() => null)
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }
  if (c.loading && !c.data) return <Loading />
  if (c.error) return <ErrorBox error={c.error} onRetry={c.reload} />
  return (
    <Card>
      <div className="stack">
        <div className="grid-2 gap-sm">
          <Field label="Nome da empresa">
            <input value={f.name} disabled={!canManage} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="CNPJ/CPF">
            <input value={f.document} disabled={!canManage} onChange={(e) => setF({ ...f, document: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input value={f.phone} disabled={!canManage} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Fuso horário" hint="Usado em agendamentos e nos horários de ligação.">
            <select value={f.timezone} disabled={!canManage} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {[...new Set([f.timezone, ...TIMEZONES])].map((t) => (
                <option key={t} value={t}>
                  {t.replace('America/', '').replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {canManage && (
          <div className="row end">
            <Button variant="primary" onClick={save} loading={saving} disabled={f.name.trim().length < 2}>
              Salvar
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

interface BotSettings {
  aiEnabled: boolean
  agentName: string
  businessInfo: string
  instructions: string
  handoffMessage: string
  optOutConfirmation: string
  schedulingEnabled: boolean
  aiConfigured: boolean
}

function BotTab() {
  const fb = useFeedback()
  const { canManage } = useAuthed()
  const s = useLoad(() => get<BotSettings>('/settings/bot'))
  const [f, setF] = useState<BotSettings | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (s.data) setF(s.data)
  }, [s.data])
  if (s.loading && !f) return <Loading />
  if (s.error && !f) return <ErrorBox error={s.error} onRetry={s.reload} />
  if (!f) return null
  async function save() {
    if (!f) return
    setSaving(true)
    try {
      const { aiConfigured: _a, ...body } = f
      await put('/settings/bot', {
        aiEnabled: body.aiEnabled,
        agentName: body.agentName,
        businessInfo: body.businessInfo,
        instructions: body.instructions,
        handoffMessage: body.handoffMessage,
        optOutConfirmation: body.optOutConfirmation,
        schedulingEnabled: body.schedulingEnabled,
      })
      fb.success('Chatbot atualizado.')
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }
  const dis = !canManage
  return (
    <div className="stack">
      {f.aiConfigured ? (
        <Alert tone="green">IA configurada no servidor. O assistente responde usando as informações abaixo.</Alert>
      ) : (
        <Alert tone="amber">A IA ainda não está configurada no servidor. Enquanto isso, o bot responde com regras simples (descadastro, pedido de atendente).</Alert>
      )}
      <Card>
        <div className="stack">
          <Toggle checked={f.aiEnabled} disabled={dis} onChange={(v) => setF({ ...f, aiEnabled: v })} label="Responder automaticamente com IA" />
          <Toggle checked={f.schedulingEnabled} disabled={dis} onChange={(v) => setF({ ...f, schedulingEnabled: v })} label="Registrar pedidos de agendamento feitos na conversa" />
          <Field label="Nome do assistente">
            <input value={f.agentName} disabled={dis} maxLength={60} onChange={(e) => setF({ ...f, agentName: e.target.value })} />
          </Field>
          <Field label="Informações do negócio" hint="Endereço, horários, serviços, preços que podem ser informados, formas de pagamento…">
            <textarea rows={8} value={f.businessInfo} disabled={dis} maxLength={8000} onChange={(e) => setF({ ...f, businessInfo: e.target.value })} />
          </Field>
          <Field label="Instruções de comportamento" hint="Tom de voz e o que o assistente não deve fazer.">
            <textarea rows={5} value={f.instructions} disabled={dis} maxLength={4000} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          </Field>
          <Field label="Mensagem ao transferir para humano">
            <textarea rows={2} value={f.handoffMessage} disabled={dis} maxLength={500} onChange={(e) => setF({ ...f, handoffMessage: e.target.value })} />
          </Field>
          <Field label="Confirmação de descadastro" hint="Enviada quando o contato pede para não receber mais mensagens.">
            <textarea rows={2} value={f.optOutConfirmation} disabled={dis} maxLength={500} onChange={(e) => setF({ ...f, optOutConfirmation: e.target.value })} />
          </Field>
          {canManage && (
            <div className="row end">
              <Button variant="primary" onClick={save} loading={saving}>
                Salvar
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function TeamTab() {
  const fb = useFeedback()
  const { canManage, session } = useAuthed()
  const users = useLoad(() => get<TeamUser[]>('/users'))
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', email: '', role: 'AGENT' })
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string | null } | null>(null)

  async function create() {
    setSaving(true)
    try {
      const r = await post<{ email: string; temporaryPassword: string | null }>('/users', f)
      setCreated(r)
      setOpen(false)
      setF({ name: '', email: '', role: 'AGENT' })
      users.reload(true)
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }

  async function update(u: TeamUser, body: Partial<TeamUser>) {
    try {
      await patch(`/users/${u.id}`, body)
      users.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }

  return (
    <div className="stack">
      {created && (
        <Alert tone="green" title="Usuário criado">
          {created.temporaryPassword ? (
            <>
              Não conseguimos enviar o e-mail de convite. Repasse o acesso com segurança: <strong>{created.email}</strong> / senha provisória{' '}
              <code>{created.temporaryPassword}</code> <CopyButton text={created.temporaryPassword} />
            </>
          ) : (
            <>Enviamos o convite com a senha provisória para {created.email}.</>
          )}
        </Alert>
      )}
      <Card
        title="Equipe"
        actions={
          canManage && (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(true)}>
              Adicionar usuário
            </Button>
          )
        }
        pad={false}
      >
        {users.loading && !users.data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th className="hide-sm">Último acesso</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map((u) => {
                  const editable = canManage && u.role !== 'OWNER' && u.id !== session.user.id
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="strong">{u.name}</div>
                        <div className="small muted">{u.email}</div>
                      </td>
                      <td>
                        {editable ? (
                          <select value={u.role} onChange={(e) => update(u, { role: e.target.value as TeamUser['role'] })}>
                            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                            <option value="AGENT">{ROLE_LABEL.AGENT}</option>
                          </select>
                        ) : (
                          ROLE_LABEL[u.role]
                        )}
                      </td>
                      <td className="hide-sm small muted">{fmtDateTime(u.lastLoginAt)}</td>
                      <td>
                        {editable ? (
                          <Toggle checked={u.isActive} onChange={(v) => update(u, { isActive: v })} label={u.isActive ? 'Ativo' : 'Inativo'} />
                        ) : (
                          <Badge tone={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Ativo' : 'Inativo'}</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={users.error} onRetry={users.reload} />
      </Card>
      <p className="small muted">Administradores gerenciam canais, equipe e configurações. Atendentes usam inbox, CRM e campanhas.</p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Adicionar usuário"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={create} loading={saving} disabled={f.name.trim().length < 2 || !f.email}>
              Criar e convidar
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Nome">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Perfil">
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="AGENT">{ROLE_LABEL.AGENT}</option>
              <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

function ApiKeysTab() {
  const fb = useFeedback()
  const { session } = useAuthed()
  const intLimit = session.tenant.limits.integrations
  const keys = useLoad(() => get<ApiKeyRow[]>('/settings/api-keys'))
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  async function create() {
    try {
      const r = await post<{ key: string }>('/settings/api-keys', { name: name.trim() })
      setCreated(r.key)
      setName('')
      keys.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }
  async function revoke(k: ApiKeyRow) {
    if (!confirm(`Revogar a chave “${k.name}”? Sistemas que a usam deixam de funcionar.`)) return
    try {
      await del(`/settings/api-keys/${k.id}`)
      keys.reload(true)
    } catch (e) {
      fb.fail(e)
    }
  }
  return (
    <div className="stack">
      {created && (
        <Alert tone="amber" title="Copie a chave agora">
          Ela não será exibida novamente.
          <div className="row gap-sm">
            <code className="grow break">{created}</code>
            <CopyButton text={created} />
          </div>
        </Alert>
      )}
      <Card title="Nova chave">
        <div className="row gap-sm">
          <input className="grow" placeholder="Nome (ex.: Integração ERP)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button variant="primary" icon={<KeyRound size={16} />} onClick={create} disabled={!name.trim()}>
            Criar chave
          </Button>
        </div>
        {intLimit !== null && intLimit !== undefined && (
          <p className="small muted">{intLimit === 0 ? 'Integrações ficam disponíveis após ativar o plano.' : `Seu plano permite ${intLimit} chave(s) de integração ativa(s). No PRO não há esse limite.`}</p>
        )}
        <p className="small muted">Use no cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code> ou <code>X-Api-Key</code> nas rotas /v1 e de integração com o DentalPos One.</p>
      </Card>
      <Card title="Chaves" pad={false}>
        {keys.loading && !keys.data ? (
          <Loading />
        ) : keys.data?.length === 0 ? (
          <EmptyState title="Nenhuma chave criada" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Prefixo</th>
                  <th className="hide-sm">Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.data?.map((k) => (
                  <tr key={k.id}>
                    <td>
                      {k.name}
                      <div className="small muted">criada em {fmtDateTime(k.createdAt)}</div>
                    </td>
                    <td>
                      <code>rvh_{k.prefix}_…</code>
                    </td>
                    <td className="hide-sm small muted">{fmtDateTime(k.lastUsedAt)}</td>
                    <td>
                      {k.revokedAt ? (
                        <Badge tone="gray">Revogada</Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => revoke(k)}>
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorBox error={keys.error} onRetry={keys.reload} />
      </Card>
    </div>
  )
}

function IntegrationTab() {
  const fb = useFeedback()
  const s = useLoad(() => get<{ webhookUrl: string | null; hasSecret: boolean; source: string; externalRef: string | null }>('/settings/integration'))
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (s.data) setUrl(s.data.webhookUrl || '')
  }, [s.data])
  async function save(rotate = false) {
    if (rotate && !confirm('Gerar um novo segredo? O sistema que recebe os eventos precisará ser atualizado.')) return
    setSaving(true)
    try {
      const r = await put<{ secret: string | null }>('/settings/integration', { webhookUrl: url.trim() || null, rotateSecret: rotate })
      if (r.secret) setSecret(r.secret)
      fb.success('Integração salva.')
      s.reload(true)
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }
  if (s.loading && !s.data) return <Loading />
  if (s.error) return <ErrorBox error={s.error} onRetry={s.reload} />
  return (
    <div className="stack">
      {secret && (
        <Alert tone="amber" title="Segredo de assinatura (copie agora)">
          <div className="row gap-sm">
            <code className="grow break">{secret}</code>
            <CopyButton text={secret} />
          </div>
          <span className="small">Use para validar a assinatura dos eventos recebidos.</span>
        </Alert>
      )}
      <Card title="Webhook de saída">
        <div className="stack">
          <p className="small muted">Enviamos um POST para esta URL quando chegam mensagens, ligações terminam, contatos pedem descadastro e outros eventos.</p>
          <Field label="URL">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-sistema.com.br/webhooks/revah" />
          </Field>
          <div className="row wrap gap-sm end">
            {s.data?.hasSecret && (
              <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => save(true)} loading={saving}>
                Gerar novo segredo
              </Button>
            )}
            <Button variant="primary" onClick={() => save(false)} loading={saving}>
              Salvar
            </Button>
          </div>
        </div>
      </Card>
      {s.data?.source === 'DENTALPOS' && (
        <Alert tone="blue">Esta conta está vinculada ao DentalPos One{s.data.externalRef ? ` (${s.data.externalRef})` : ''}. Agenda, pacientes e cobranças chegam automaticamente.</Alert>
      )}
    </div>
  )
}

function SuppressionsTab() {
  const fb = useFeedback()
  const [channel, setChannel] = useState('')
  const list = useLoad(() => get<Suppression[]>('/suppressions', { channel }), [channel])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<{ channel: Channel; values: string; reason: string }>({ channel: 'WHATSAPP', values: '', reason: '' })
  const [saving, setSaving] = useState(false)
  async function importList() {
    setSaving(true)
    try {
      const values = f.values.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean)
      const r = await post<{ added: number }>('/suppressions', { channel: f.channel, values, reason: f.reason || undefined })
      fb.success(`${r.added} de ${values.length} endereço(s) bloqueado(s).`)
      setOpen(false)
      setF({ ...f, values: '', reason: '' })
      list.reload(true)
    } catch (e) {
      fb.fail(e)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Todos os canais</option>
          {ALL_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
        <div className="grow" />
        <Button icon={<ShieldOff size={16} />} onClick={() => setOpen(true)}>
          Importar bloqueios
        </Button>
      </div>
      <p className="small muted">Endereços nesta lista não recebem mensagens nem ligações automáticas no canal indicado, mesmo que sejam reimportados. Para desbloquear, use a aba Consentimento do contato.</p>
      <ErrorBox error={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <EmptyState title="Nenhum bloqueio" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Endereço</th>
                <th>Motivo</th>
                <th className="hide-sm">Data</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id}>
                  <td>{CHANNEL_LABEL[s.channel]}</td>
                  <td className="nowrap">{['WHATSAPP', 'SMS', 'VOICE'].includes(s.channel) ? fmtPhone(s.value) : s.value}</td>
                  <td>
                    {SUPPRESSION_REASON[s.reason] || s.reason}
                    {s.detail && <div className="small muted">{s.detail}</div>}
                  </td>
                  <td className="hide-sm small muted">{fmtDateTime(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Importar bloqueios"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={importList} loading={saving} disabled={!f.values.trim()}>
              Bloquear
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Canal">
            <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as Channel })}>
              {ALL_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Telefones, e-mails ou IDs" hint="Um por linha (ou separados por vírgula).">
            <textarea rows={6} value={f.values} onChange={(e) => setF({ ...f, values: e.target.value })} />
          </Field>
          <Field label="Motivo (opcional)">
            <input value={f.reason} maxLength={200} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="ex.: lista de não contato do cliente" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

const AUDIT_LABEL: Record<string, string> = {
  REGISTER: 'Cadastro da conta',
  CONTACT_CREATE: 'Contato criado',
  CONTACT_MERGE: 'Contato mesclado',
  CONTACT_UPDATE: 'Contato editado',
  CONTACT_DELETE: 'Contato excluído',
  CONTACT_IMPORT: 'Importação de contatos',
  CONSENT_GRANTED: 'Consentimento registrado',
  CONSENT_REVOKED: 'Contato bloqueado',
  SUPPRESSION_IMPORT: 'Bloqueios importados',
  CHANNEL_CREATE: 'Canal conectado',
  CHANNEL_UPDATE: 'Canal alterado',
  CHANNEL_DELETE: 'Canal removido',
  CAMPAIGN_CREATE: 'Campanha criada',
  CAMPAIGN_LAUNCH: 'Campanha disparada',
  CAMPAIGN_PAUSE: 'Campanha pausada',
  CAMPAIGN_RESUME: 'Campanha retomada',
  CAMPAIGN_CANCEL: 'Campanha cancelada',
  AUTOMATION_CREATE: 'Automação criada',
  VOICE_SETTINGS: 'Configurações de voz',
  CALL_QUEUED: 'Ligação agendada',
  LEADS_TERMS_ACCEPTED: 'Termo do Leads aceito',
  LEADS_IMPORT: 'Leads importados',
  USER_CREATE: 'Usuário criado',
  USER_UPDATE: 'Usuário alterado',
  API_KEY_CREATE: 'Chave de API criada',
  API_KEY_REVOKE: 'Chave de API revogada',
  BILLING_CHECKOUT_CREATED: 'Checkout de assinatura iniciado',
  ADMIN_TENANT_UPDATE: 'Ajuste pelo suporte WMundi',
}

function AuditTab() {
  const logs = useLoad(() => get<{ id: string; userId: string | null; action: string; entity: string | null; entityId: string | null; data: unknown; createdAt: string }[]>('/audit'))
  const users = useLoad(() => get<TeamUser[]>('/users'))
  const name = (id: string | null) => (id ? users.data?.find((u) => u.id === id)?.name || 'Usuário' : 'Sistema')
  if (logs.loading && !logs.data) return <Loading />
  if (logs.error) return <ErrorBox error={logs.error} onRetry={logs.reload} />
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Quem</th>
            <th>Ação</th>
            <th className="hide-sm">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.data?.map((l) => (
            <tr key={l.id}>
              <td className="small nowrap">{fmtDateTime(l.createdAt)}</td>
              <td className="small">{name(l.userId)}</td>
              <td>{AUDIT_LABEL[l.action] || l.action}</td>
              <td className="hide-sm small muted mono-wrap">{l.data ? JSON.stringify(l.data).slice(0, 160) : ''}</td>
            </tr>
          ))}
          {logs.data?.length === 0 && (
            <tr>
              <td colSpan={4} className="muted center">
                Sem registros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PasswordTab() {
  const fb = useFeedback()
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setError('')
    if (f.next.length < 8) return setError('A nova senha precisa ter ao menos 8 caracteres.')
    if (f.next !== f.confirm) return setError('As senhas não conferem.')
    setSaving(true)
    try {
      await post('/auth/change-password', { currentPassword: f.current, newPassword: f.next })
      fb.success('Senha alterada.')
      setF({ current: '', next: '', confirm: '' })
    } catch (e: any) {
      setError(e?.message || 'Não foi possível alterar a senha.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <div className="stack narrow">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Senha atual">
          <input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
          <input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="Confirme a nova senha">
          <input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        <div className="row end">
          <Button variant="primary" onClick={save} loading={saving}>
            Alterar senha
          </Button>
        </div>
      </div>
    </Card>
  )
}
