import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

export async function index(req: Request, res: Response) {
  try {
    const feedbacks = await prisma.feedback.findMany({
      include: {
        patient: true,
        appointment: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return res.status(200).json(feedbacks)
  } catch (error) {
    console.error('Erro ao listar avaliações:', error)

    return res.status(500).json({
      error: 'Erro ao listar avaliações.'
    })
  }
}

export async function show(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const feedback = await prisma.feedback.findUnique({
      where: {
        id
      },
      include: {
        patient: true,
        appointment: true
      }
    })

    if (!feedback) {
      return res.status(404).json({
        error: 'Avaliação não encontrada.'
      })
    }

    return res.status(200).json(feedback)
  } catch (error) {
    console.error('Erro ao buscar avaliação:', error)

    return res.status(500).json({
      error: 'Erro ao buscar avaliação.'
    })
  }
}

export async function store(req: Request, res: Response) {
  try {
    const feedback = await prisma.feedback.create({
      data: req.body
    })

    return res.status(201).json(feedback)
  } catch (error) {
    console.error('Erro ao criar avaliação:', error)

    return res.status(500).json({
      error: 'Erro ao criar avaliação.'
    })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const existingFeedback = await prisma.feedback.findUnique({
      where: {
        id
      }
    })

    if (!existingFeedback) {
      return res.status(404).json({
        error: 'Avaliação não encontrada.'
      })
    }

    const feedback = await prisma.feedback.update({
      where: {
        id
      },
      data: req.body
    })

    return res.status(200).json(feedback)
  } catch (error) {
    console.error('Erro ao atualizar avaliação:', error)

    return res.status(500).json({
      error: 'Erro ao atualizar avaliação.'
    })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = String(req.params.id)

    const existingFeedback = await prisma.feedback.findUnique({
      where: {
        id
      }
    })

    if (!existingFeedback) {
      return res.status(404).json({
        error: 'Avaliação não encontrada.'
      })
    }

    await prisma.feedback.delete({
      where: {
        id
      }
    })

    return res.status(200).json({
      message: 'Avaliação removida com sucesso.'
    })
  } catch (error) {
    console.error('Erro ao remover avaliação:', error)

    return res.status(500).json({
      error: 'Erro ao remover avaliação.'
    })
  }
}
