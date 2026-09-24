import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from 'lucide-react'
import { ApiError, errorMessage, isUpgradeError } from '../lib/api'
import { useSession } from '../lib/session'
import { Button, Modal } from './ui'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface UpgradeInfo {
  code?: string
  message: string
}

interface FeedbackCtx {
  toast: (text: string, kind?: ToastKind) => void
  success: (text: string) => void
  // Trata qualquer erro de API: 402 abre o aviso de upgrade, o resto vira toast.
  fail: (e: unknown) => void
  showUpgrade: (info: UpgradeInfo) => void
}

const Ctx = createContext<FeedbackCtx | null>(null)

const UPGRADE_TITLES: Record<string, string> = {
  PAYMENT_METHOD_REQUIRED: 'Cadastre a forma de pagamento',
  TRIAL_MESSAGE_LIMIT: 'Limite de mensagens do teste',
  TRIAL_RECIPIENT_LIMIT: 'Limite do teste grátis',
  MONTHLY_LIMIT: 'Volume mensal atingido',
  PLAN_FEATURE: 'Recurso de outro plano',
  PLAN_LIMIT: 'Limite do plano',
  PAYMENT_PAST_DUE: 'Pagamento pendente',
  SUBSCRIPTION_CANCELED: 'Assinatura cancelada',
  LEADS_ADDON_REQUIRED: 'REVAH Leads não contratado',
  LEADS_TERMS_REQUIRED: 'Termo de responsabilidade pendente',
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [upgrade, setUpgrade] = useState<UpgradeInfo | null>(null)
  const { embedded, canManage } = useSession()
  const navigate = useNavigate()

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])

  const showUpgrade = useCallback((info: UpgradeInfo) => setUpgrade(info), [])

  const fail = useCallback(
    (e: unknown) => {
      if (isUpgradeError(e)) {
        const err = e as ApiError
        setUpgrade({ code: err.code, message: err.message })
        return
      }
      toast(errorMessage(e), 'error')
    },
    [toast],
  )

  const value = useMemo<FeedbackCtx>(() => ({ toast, success: (t) => toast(t, 'success'), fail, showUpgrade }), [toast, fail, showUpgrade])

  const isLeads = upgrade?.code === 'LEADS_ADDON_REQUIRED' || upgrade?.code === 'LEADS_TERMS_REQUIRED'
  const isPayment = upgrade?.code === 'PAYMENT_PAST_DUE' || upgrade?.code === 'SUBSCRIPTION_CANCELED'
  const needsMethod = upgrade?.code === 'PAYMENT_METHOD_REQUIRED'

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            {t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <XCircle size={18} /> : <Info size={18} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal
        open={!!upgrade}
        onClose={() => setUpgrade(null)}
        size="sm"
        title={
          <span className="row gap-sm">
            {isPayment ? <AlertTriangle size={20} className="text-amber" /> : <Sparkles size={20} className="text-indigo" />}
            {UPGRADE_TITLES[upgrade?.code || ''] || 'Ação necessária'}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setUpgrade(null)}>
              Agora não
            </Button>
            {isLeads ? (
              <Button
                variant="primary"
                onClick={() => {
                  setUpgrade(null)
                  navigate('/leads')
                }}
              >
                Ver REVAH Leads
              </Button>
            ) : (
              !embedded &&
              canManage && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setUpgrade(null)
                    navigate('/assinatura')
                  }}
                >
                  {needsMethod ? 'Cadastrar forma de pagamento' : isPayment ? 'Regularizar assinatura' : 'Ver planos'}
                </Button>
              )
            )}
          </>
        }
      >
        <p>{upgrade?.message}</p>
        {embedded && !isLeads && <p className="muted">Para cadastrar a forma de pagamento ou mudar de plano, fale com o responsável pela conta da clínica no DentalPos One.</p>}
        {!embedded && !canManage && !isLeads && <p className="muted">Peça ao proprietário ou administrador da conta para ajustar o plano.</p>}
      </Modal>
    </Ctx.Provider>
  )
}

export function useFeedback() {
  const c = useContext(Ctx)
  if (!c) throw new Error('FeedbackProvider ausente')
  return c
}
