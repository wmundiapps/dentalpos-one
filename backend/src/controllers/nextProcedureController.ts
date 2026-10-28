import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const PLACEHOLDERS = ['definir após atendimento', 'reavaliar conforme plano de tratamento']

// Procedimento da próxima consulta anotado no último atendimento (odontograma/evolução) que ainda não foi agendado.
export async function hint(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = req.user!
    const patientId = String(req.params.id)
    const rows = await prisma.clinicalEvolution.findMany({
      where: { clinicId, tenantId, patientId, nextAppointmentCreated: false },
      orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, nextProcedure: true, procedure: true, professionalName: true, createdAt: true, teeth: true },
    })
    const row = rows.find((r) => r.nextProcedure.trim() && !PLACEHOLDERS.includes(r.nextProcedure.trim().toLowerCase()))
    return res.json({ hint: row ? { evolutionId: row.id, nextProcedure: row.nextProcedure.trim(), fromProcedure: row.procedure, professionalName: row.professionalName, teeth: row.teeth, createdAt: row.createdAt } : null })
  } catch (error) {
    console.error('Erro ao buscar próximo procedimento:', error)
    return res.status(500).json({ error: 'Erro ao buscar o próximo procedimento.' })
  }
}
