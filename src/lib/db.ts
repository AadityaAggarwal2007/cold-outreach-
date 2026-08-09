import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const dbFile = process.env.DATABASE_PATH || path.join(process.cwd(), 'internreach.db')
  const adapter = new PrismaBetterSqlite3({ url: dbFile })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any)
}


export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Seed default settings row if it doesn't exist
export async function ensureSettings() {
  return await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      gmailUser: process.env.GMAIL_USER || '',
      gmailAppPass: process.env.GMAIL_APP_PASSWORD || '',
      pixelBaseUrl: process.env.PIXEL_BASE_URL || '',
      aiBaseUrl: process.env.OPENAI_BASE_URL || 'http://localhost:10531/v1',
      aiModel: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
    },
  })
}

