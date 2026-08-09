import { defineConfig } from 'prisma/config'
import path from 'path'

const dbUrl = `file:${path.join(__dirname, 'internreach.db')}`

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: dbUrl,
  },
})

// Set for runtime client use
process.env.DATABASE_URL = process.env.DATABASE_URL || dbUrl

