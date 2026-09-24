export type Channel = 'WHATSAPP' | 'SMS' | 'TELEGRAM' | 'EMAIL' | 'INSTAGRAM' | 'MESSENGER' | 'VOICE'
export type Plan = 'TRIAL' | 'START' | 'PRO' | 'ENTERPRISE'
export type Role = 'OWNER' | 'ADMIN' | 'AGENT'

export interface Limits {
  users: number | null
  channels: number | null
  monthlyMessages: number | null
  voice: boolean
  ai: 'basic' | 'advanced' | boolean
  templates: number | null
  integrations: number | null
  csvImport: boolean
}

// Teste de 14 dias: começa ao cadastrar a forma de pagamento (checkout).
export interface TrialStatus {
  isTrial: boolean
  days: number
  endsAt: string | null
  daysLeft: number | null
  maxRecipientsPerCampaign: number
  paymentMethodRequired: boolean
  trialAvailable: boolean
  exhausted: boolean
}

export interface MessageTemplate {
  id: string
  name: string
  segment: string
  channel: Channel | null
  subject: string | null
  body: string
  createdAt: string
}

export interface LibraryTemplate {
  key: string
  segment: string
  name: string
  body: string
  variables: string[]
}

export interface Session {
  token: string
  user: { id: string; name: string; email: string; role: Role }
  tenant: {
    id: string
    name: string
    plan: Plan
    status: string
    source: string
    leadsAddonActive: boolean
    limits: Limits
    trial: TrialStatus
  }
  embedded: boolean
  superadmin: boolean
  trialAlreadyUsed?: boolean
}

export interface Tag {
  id: string
  name: string
  color: string
  contacts?: number
}

export interface Contact {
  id: string
  name: string
  phone: string | null
  email: string | null
  telegramChatId: string | null
  instagramId: string | null
  messengerId: string | null
  document: string | null
  company: string | null
  notes: string | null
  customFields: Record<string, any> | null
  source: string
  lastInteractionAt: string | null
  createdAt: string
  tags: Tag[]
}

export interface Suppression {
  id: string
  channel: Channel
  value: string
  contactId: string | null
  reason: string
  detail: string | null
  createdAt: string
}

export interface Consent {
  id: string
  channel: Channel
  granted: boolean
  source: string
  evidence: string | null
  createdAt: string
}

export interface ContactDetail extends Contact {
  suppressions: Suppression[]
  consents: Consent[]
}

export interface Message {
  id: string
  channel: Channel
  direction: 'IN' | 'OUT'
  content: string
  subject: string | null
  mediaUrl: string | null
  status: string
  error: string | null
  aiGenerated: boolean
  sentByUserId: string | null
  conversationId: string | null
  campaignId: string | null
  createdAt: string
}

export interface CallTurn {
  id: string
  role: 'AGENT' | 'CONTACT' | 'SYSTEM'
  text: string
  dtmf: string | null
  createdAt: string
}

export interface Call {
  id: string
  contactId: string | null
  contact?: { id: string; name: string; phone: string | null } | null
  direction: 'OUTBOUND' | 'INBOUND'
  from: string | null
  to: string
  purpose: string | null
  script: string | null
  status: string
  attempt: number
  recordingUrl: string | null
  startedAt: string | null
  endedAt: string | null
  durationSec: number | null
  summary: string | null
  outcome: string | null
  callbackAt: string | null
  error: string | null
  createdAt: string
  turns?: CallTurn[]
}

export interface Note {
  id: string
  kind: string
  body: string
  userId: string | null
  createdAt: string
}

export type TimelineItem =
  | { type: 'message'; at: string; data: Message }
  | { type: 'call'; at: string; data: Call }
  | { type: 'note'; at: string; data: Note }

export interface Conversation {
  id: string
  contactId: string
  channel: Channel
  channelAccountId: string | null
  status: 'BOT' | 'HUMAN' | 'CLOSED'
  assignedUserId: string | null
  lastMessageAt: string
  lastInboundAt: string | null
  unreadCount: number
  intent: string | null
  contact: { id: string; name: string; phone: string | null; email: string | null; tags?: Tag[] }
  lastMessage?: Message | null
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
  channelAccount: { id: string; label: string; provider: string } | null
  otherChannels: { id: string; channel: Channel; status: string; lastMessageAt: string }[]
}

export interface WaTemplate {
  name: string
  language?: string
  params?: string[]
}

export interface Audience {
  tagIds?: string[]
  contactIds?: string[]
  manual?: { name?: string; destination: string }[]
}

export interface Campaign {
  id: string
  name: string
  channel: Channel
  channelAccountId: string | null
  template: string
  subject: string | null
  voiceScript: string | null
  waTemplate: WaTemplate | null
  audience: Audience
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELED'
  scheduledAt: string | null
  isTrial: boolean
  appendOptOutHint: boolean
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface CampaignRecipient {
  id: string
  contactId: string | null
  name: string | null
  destination: string
  status: string
  error: string | null
  attemptedAt: string | null
}

export interface AudiencePreview {
  total: number
  valid: number
  invalid: number
  suppressed: number
  eligible: number
  trial: TrialStatus
  fitsTrial: boolean
}

export interface ChannelAccount {
  id: string
  channel: Channel
  provider: string
  label: string
  address: string
  externalId: string | null
  settings: Record<string, any> | null
  isDefault: boolean
  isActive: boolean
  riskAcknowledgedAt: string | null
  official: boolean
  simulated: boolean
  configuredFields: string[]
  webhook: { url: string; verifyToken?: string; automatic?: boolean; note?: string } | null
  createdAt: string
}

export interface ProviderField {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
}

export interface ProviderInfo {
  key: string
  label: string
  channels: Channel[]
  official: boolean
  fields: ProviderField[]
}

export type AutomationAction =
  | { type: 'send_message'; channel: Channel; template: string; subject?: string; waTemplate?: WaTemplate; optOutHint?: boolean; delayMinutes?: number }
  | { type: 'place_call'; purpose: string; script: string; delayMinutes?: number }
  | { type: 'add_tag'; tag: string; delayMinutes?: number }
  | { type: 'remove_tag'; tag: string; delayMinutes?: number }
  | { type: 'webhook'; url: string; delayMinutes?: number }

export interface Automation {
  id: string
  name: string
  trigger: string
  conditions: { tag?: string; equals?: Record<string, string | number | boolean> } | null
  actions: AutomationAction[]
  isActive: boolean
  runCount: number
  createdAt: string
}

export interface CallWindow {
  days: number[]
  start: string
  end: string
}

export interface VoiceSettings {
  enabled: boolean
  allowedWindows: CallWindow[]
  skipHolidays: boolean
  recordCalls: boolean
  recordingNotice: string
  greeting: string
  agentInstructions: string
  transferNumber: string | null
  maxAttempts: number
  retryDelayMinutes: number
  maxConcurrent: number
  maxTurns: number
  voice: string
  planAllowsVoice: boolean
  nextAllowedAt: string | null
  timezone: string
}

export interface Lead {
  id: string
  name: string
  company: string | null
  document: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  category: string | null
  status: 'NEW' | 'IMPORTED' | 'DISCARDED'
  contactId: string | null
  createdAt: string
}

export interface TeamUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface PlanInfo {
  plan: Plan
  priceBRL: number | null
  limits: Limits
  contactSales?: boolean
  highlight?: boolean
  features: string[]
}

export interface PlansResponse {
  plans: PlanInfo[]
  trial: { days: number; maxRecipientsPerCampaign: number; maxMessages?: number }
  leadsPriceBRL: number | null
  providers: { ASAAS: boolean; STRIPE: boolean }
  note: string
}

export interface DashboardData {
  contacts: number
  openConversations: number
  waitingHuman: number
  recentCampaigns: Campaign[]
  usage: { messages: number; calls: number; since: string }
  limits: Limits
  trial: TrialStatus
  channels: { id: string; channel: Channel; provider: string; label: string; isActive: boolean }[]
  callsByOutcome: { outcome: string; count: number }[]
  messagesByChannel: { channel: Channel; direction: 'IN' | 'OUT'; count: number }[]
  suppressions: number
  aiEnabled: boolean
}
