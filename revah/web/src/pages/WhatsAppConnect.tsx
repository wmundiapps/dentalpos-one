// Conectar WhatsApp pelo Cadastro Incorporado da Meta: cada cliente valida o PRÓPRIO número,
// sem copiar tokens. A janela é da Meta; o REVAH só recebe a autorização no fim.
import { useEffect, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { get, post } from '../lib/api'
import { useFeedback } from '../components/feedback'
import { Alert, Button, Modal } from '../components/ui'

interface SignupConfig {
  enabled: boolean
  appId: string | null
  configId: string | null
  graphVersion: string
}

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<any> {
  if (window.FB) return Promise.resolve(window.FB)
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version })
      resolve(window.FB)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => reject(new Error('Não foi possível abrir a janela da Meta. Verifique bloqueadores de anúncio e tente de novo.'))
    document.body.appendChild(s)
  })
}

export function WhatsAppConnectButton({ onConnected }: { onConnected: () => void }) {
  const fb = useFeedback()
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({})

  // A janela da Meta avisa, por mensagem, qual conta e qual número o cliente escolheu.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
          session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id }
        } else if (data.event === 'CANCEL') {
          session.current = {}
        }
      } catch {
        /* mensagens de outros scripts da Meta */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const cfg = await get<SignupConfig>('/channels/whatsapp/embedded-signup')
      if (!cfg.enabled || !cfg.appId || !cfg.configId) {
        fb.toast('A conexão automática do WhatsApp ainda não foi liberada. Fale com o suporte da WMundi.', 'error')
        return
      }
      const FB = await loadFacebookSdk(cfg.appId, cfg.graphVersion)
      session.current = {}
      const code: string | null = await new Promise((resolve) =>
        FB.login((resp: any) => resolve(resp?.authResponse?.code || null), {
          config_id: cfg.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        }),
      )
      if (!code) {
        fb.toast('Conexão cancelada. Nada foi alterado.', 'error')
        return
      }
      // A mensagem com o número chega logo depois do login; espera um instante.
      for (let i = 0; i < 20 && !session.current.phoneNumberId; i++) await new Promise((r) => setTimeout(r, 250))
      const { wabaId, phoneNumberId } = session.current
      if (!wabaId || !phoneNumberId) {
        fb.toast('A Meta não informou o número escolhido. Refaça a conexão e conclua todas as etapas da janela.', 'error')
        return
      }
      await post('/channels/whatsapp/embedded-signup', { code, wabaId, phoneNumberId })
      fb.success('WhatsApp conectado! Falta só cadastrar o cartão de pagamento na Meta (veja o passo a passo).')
      onConnected()
    } catch (e) {
      fb.fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="primary" icon={<MessageCircle size={16} />} loading={busy} onClick={connect}>
        Conectar WhatsApp
      </Button>
      <Button variant="ghost" onClick={() => setGuideOpen(true)}>
        Como conectar
      </Button>
      {guideOpen && <WhatsAppGuide onClose={() => setGuideOpen(false)} />}
    </>
  )
}

export function WhatsAppGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Como conectar o WhatsApp da sua empresa" size="lg" footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="stack">
        <Alert tone="blue">O número é seu e fica na sua conta da Meta. O REVAH só recebe autorização para enviar e receber mensagens por ele.</Alert>
        <div>
          <div className="field-label">Antes de começar, tenha em mãos</div>
          <ul>
            <li>Login no Facebook de quem administra a empresa.</li>
            <li>CNPJ, site e e-mail da empresa.</li>
            <li>Um número que receba SMS ou ligação para o código de verificação.</li>
            <li>
              O número fora do WhatsApp comum. Se ele estiver no aplicativo WhatsApp Business, você pode migrar ou, quando a Meta oferecer na janela, usar o mesmo número no
              aplicativo e aqui (coexistência).
            </li>
            <li>Um cartão de crédito para pagar as mensagens à Meta.</li>
          </ul>
        </div>
        <div>
          <div className="field-label">Passo a passo</div>
          <ol>
            <li>Toque em <strong>Conectar WhatsApp</strong>.</li>
            <li>Na janela da Meta, entre com o Facebook.</li>
            <li>Escolha o portfólio empresarial da sua empresa ou crie um novo com os dados dela.</li>
            <li>Crie a conta do WhatsApp Business e o nome de exibição (o nome que o cliente vê; precisa ter relação com a sua marca).</li>
            <li>Informe o número e digite o código recebido por SMS ou ligação.</li>
            <li>Autorize o REVAH a gerenciar a conta e enviar mensagens.</li>
            <li>De volta aqui, o canal aparece como <strong>Ativo</strong>.</li>
          </ol>
        </div>
        <div>
          <div className="field-label">Depois de conectar (na Meta)</div>
          <ol>
            <li>
              Em <strong>business.facebook.com</strong> → Gerenciador do WhatsApp → Configurações de pagamento, cadastre o cartão. Sem cartão, as mensagens de campanha não saem.
            </li>
            <li>
              Na Central de Segurança, envie os documentos da empresa para a <strong>verificação</strong>. Sem ela, o número começa com um limite baixo de conversas por dia.
            </li>
          </ol>
        </div>
        <p className="small muted">
          O REVAH acompanha a qualidade do número todos os dias. Se ela cair para baixa, as campanhas do WhatsApp são pausadas automaticamente para proteger o número.
        </p>
      </div>
    </Modal>
  )
}
