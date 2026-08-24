import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

export async function index(req: Request, res: Response) {
  try {
    const doctors = await prisma.doctor.findMany({
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return res.status(200).json(doctors)
  } catch (error) {
    console.error('Erro ao listar profissionais:', error)

    return res.status(500).json({
      error: 'Erro ao listar profissionais.'
    })
  }
}

export async function show(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const doctor = await prisma.doctor.findUnique({
      where: {
        id
      },
      include: {
        user: true
      }
    })

    if (!doctor) {
      return res.status(404).json({
        error: 'Profissional não encontrado.'
      })
    }

    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao buscar profissional:', error)

    return res.status(500).json({
      error: 'Erro ao buscar profissional.'
    })
  }
}

export async function store(req: Request, res: Response) {
  try {
    const doctor = await prisma.doctor.create({
      data: req.body
    })

    return res.status(201).json(doctor)
  } catch (error) {
    console.error('Erro ao cadastrar profissional:', error)

    return res.status(500).json({
      error: 'Erro ao cadastrar profissional.'
    })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const existingDoctor = await prisma.doctor.findUnique({
      where: {
        id
      }
    })

    if (!existingDoctor) {
      return res.status(404).json({
        error: 'Profissional não encontrado.'
      })
    }

    const doctor = await prisma.doctor.update({
      where: {
        id
      },
      data: req.body
    })

    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao atualizar profissional:', error)

    return res.status(500).json({
      error: 'Erro ao atualizar profissional.'
    })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const existingDoctor = await prisma.doctor.findUnique({
      where: {
        id
      }
    })

    if (!existingDoctor) {
      return res.status(404).json({
        error: 'Profissional não encontrado.'
      })
    }

    await prisma.doctor.delete({
      where: {
        id
      }
    })

    return res.status(200).json({
      message: 'Profissional removido com sucesso.'
    })
  } catch (error) {
    console.error('Erro ao remover profissional:', error)

    return res.status(500).json({
      error: 'Erro ao remover profissional.'
    })
  }
}
