import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'

export interface ContextRequest extends Request {
  requestId?: string
  rawBody?: Buffer
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = String(req.headers['x-request-id'] || '').trim()
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID()
  const contextReq = req as ContextRequest

  contextReq.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  return next()
}
