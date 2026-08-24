import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import routes from './routes'

dotenv.config()

const app = express()

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  })
)

app.use(helmet())

app.use(compression())

app.use(morgan('dev'))

app.use(express.json())

app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}))

app.get('/health', (_, res) => {
  return res.json({
    status: 'ok',
    application: 'DentalPos Gerenciador Inteligente',
    version: '1.0.0'
  })
})

app.use('/api', routes)

app.use((req, res) => {
  return res.status(404).json({
    error: 'Rota não encontrada.'
  })
})

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err)

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    })
  }
)

export default app
