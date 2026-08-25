import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })
const supportedSources = [
  'RECEITA_FEDERAL',
  'GOOGLE_PLACES',
  'META_LEADS',
  'LINKEDIN_AUTHORIZED',
  'INSTAGRAM_AUTHORIZED',
  'PHANTOMBUSTER_ALLOWED',
  'CSV',
  'JSON',
]

export async function imports(req: AuthRequest, res: Response) {
  res.json(await prisma.leadImport.findMany({ where: ctx(req), orderBy: { createdAt: 'desc' }, take: 100 }))
}

export async function createImport(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const source = String(req.body.source || '').toUpperCase()
  if (!supportedSources.includes(source)) return res.status(400).json({ error: 'Fonte não suportada.' })

  const fileBased = ['CSV', 'JSON'].includes(source)
  const authorizedConnector = ['META_LEADS', 'LINKEDIN_AUTHORIZED', 'INSTAGRAM_AUTHORIZED', 'PHANTOMBUSTER_ALLOWED'].includes(source)
  const status = fileBased ? 'READY_FOR_FILE' : authorizedConnector ? 'READY_FOR_AUTHORIZED_ADAPTER' : 'READY_FOR_LICENSED_ADAPTER'

  const row = await prisma.leadImport.create({
    data: {
      ...c,
      source,
      query: req.body.query || {},
      legalBasis: req.body.legalBasis || null,
      sourceReference: req.body.sourceReference || null,
      status,
    },
  })
  res.status(201).json(row)
}
