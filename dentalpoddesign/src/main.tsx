import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { loadSecurityConfig } from './security/config'
import { checkEnvironment } from './security/guard'
import { initSession } from './security/session'
import { BlockedScreen, LockScreen } from './ui/LockScreen'

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  render() {
    if (!this.state.err) return this.props.children
    const webgl = /webgl/i.test(this.state.err.message)
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: '10vh auto' }}>
        <h2>O DentalPod Design encontrou um problema</h2>
        <p className="hint">
          {webgl ? 'Este navegador/dispositivo não ofereceu WebGL, necessário para o 3D. Ative a aceleração de hardware ou use Chrome/Edge/Firefox atualizados.' : this.state.err.message}
        </p>
        <button className="btn primary" onClick={() => location.reload()}>Recarregar</button>
      </div>
    )
  }
}

const root = createRoot(document.getElementById('root')!)

async function boot() {
  const cfg = await loadSecurityConfig()
  const env = checkEnvironment(cfg)
  if (!env.ok) {
    root.render(<BlockedScreen reason={env.reason!} host={env.host} />)
    return // o app (e o verificador de conteúdo) nem chega a ser carregado
  }
  initSession()
  const { default: App } = await import('./App')
  root.render(
    <StrictMode>
      <Boundary>
        <App />
        <LockScreen />
      </Boundary>
    </StrictMode>,
  )
}
void boot()
