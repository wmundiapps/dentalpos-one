import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { FinderError, contactProfessional, createLead, finderOptions, getListing, listReceived, revealCity, saveListing } from '../services/finderService'

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof FinderError) return res.status(error.status).json({ error: error.message })
  console.error('Indicador profissional:', error instanceof Error ? error.message : 'erro')
  return res.status(500).json({ error: fallback })
}

export const options = (_req: Request, res: Response) => res.json(finderOptions())

export async function lead(req: Request, res: Response) {
  try { return res.status(201).json(await createLead(req.body || {}, req.ip || req.socket.remoteAddress || 'unknown')) }
  catch (error) { return fail(res, error, 'Não foi possível iniciar a busca agora.') }
}

export async function reveal(req: Request, res: Response) {
  try { return res.json(await revealCity(req.body?.token, req.params.citySlug)) }
  catch (error) { return fail(res, error, 'Não foi possível abrir a cidade agora.') }
}

export async function contact(req: Request, res: Response) {
  try { return res.json(await contactProfessional(req.body?.token, req.body?.listingId)) }
  catch (error) { return fail(res, error, 'Não foi possível enviar o pedido agora.') }
}

export async function mine(req: AuthRequest, res: Response) {
  try { return res.json(await getListing(req.user!.clinicId)) }
  catch (error) { return fail(res, error, 'Erro ao carregar o indicador profissional.') }
}

export async function save(req: AuthRequest, res: Response) {
  try { return res.json(await saveListing(req.user!.clinicId, req.user!.tenantId, req.body || {})) }
  catch (error) { return fail(res, error, 'Não foi possível salvar.') }
}

export async function received(req: AuthRequest, res: Response) {
  try { return res.json(await listReceived(req.user!.clinicId)) }
  catch (error) { return fail(res, error, 'Erro ao carregar os pedidos.') }
}
