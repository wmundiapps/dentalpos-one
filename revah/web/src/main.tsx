import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SessionProvider } from './lib/session'
import { FeedbackProvider } from './components/feedback'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <FeedbackProvider>
          <App />
        </FeedbackProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
)
