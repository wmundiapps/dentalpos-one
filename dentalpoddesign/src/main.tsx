import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
)
