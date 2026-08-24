import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

export async function getAllUsers(clinicId: string) {
  return prisma.user.findMany({
    where: {
      clinicId,
      isActive: true
    },
    orderBy: {
      firstName: 'asc'
    }
  })
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: {
      id
    }
  })
}

export async function getUserByEmail(clinicId: string, email: string) {
  return prisma.user.findUnique({
    where: {
      clinicId_email: {
        clinicId,
        email
      }
    }
  })
}

export async function createUser(data: any) {
  const hashedPassword = await hashPassword(data.password)

  return prisma.user.create({
    data: {
      ...data,
      password: hashedPassword
    }
  })
}

export async function updateUser(id: string, data: any) {
  if (data.password) {
    data.password = await hashPassword(data.password)
  }

  return prisma.user.update({
    where: {
      id
    },
    data
  })
}

export async function deleteUser(id: string) {
  return prisma.user.update({
    where: {
      id
    },
    data: {
      isActive: false
    }
  })
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
