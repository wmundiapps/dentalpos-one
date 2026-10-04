import { unlockIdle, useSession } from '../security/session'

export function LockScreen() {
  const s = useSession()
  if (s.lock === 'none') return null
  return (
    <div role="alertdialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: '#0b1220', color: '#e8eefc', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🔒</div>
        <h2 style={{ margin: '8px 0' }}>DentalPod Design</h2>
        <p style={{ opacity: 0.8 }}>{s.msg}</p>
        {s.lock === 'idle' && <button className="btn primary" onClick={unlockIdle}>Continuar</button>}
      </div>
    </div>
  )
}

export function BlockedScreen({ reason, host }: { reason: 'host' | 'parent'; host: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', color: '#e8eefc', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>⛔</div>
        <h2>Uso não autorizado</h2>
        <p style={{ opacity: 0.8 }}>
          {reason === 'host' ? `Este software está licenciado apenas para domínios autorizados (${host} não está na lista).` : 'Este software só pode ser incorporado por sites autorizados.'}
        </p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>DentalPod Design · contato@dentalpos.com.br</p>
      </div>
    </div>
  )
}
