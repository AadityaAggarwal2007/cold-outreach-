/**
 * Run once to set up two users and assign existing data to user 1.
 * Usage: node scripts/seed-users.mjs
 *
 * User 1: aaditya   (owns all existing companies/templates/settings)
 * User 2: friend    (starts empty, configure Gmail in Settings after login)
 */

import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'internreach.db')

if (!fs.existsSync(dbPath)) {
  console.error('❌ internreach.db not found. Run `npx prisma db push` first.')
  process.exit(1)
}

const db = Database(dbPath)

// ─── Helper ───────────────────────────────────────────────────────────────────
function run(sql, params = []) {
  return db.prepare(sql).run(...params)
}
function get(sql, params = []) {
  return db.prepare(sql).get(...params)
}

// ─── Create users ─────────────────────────────────────────────────────────────
const PASSWORD_1 = process.env.USER1_PASS || 'aaditya123'
const PASSWORD_2 = process.env.USER2_PASS || 'friend123'

const hash1 = bcrypt.hashSync(PASSWORD_1, 12)
const hash2 = bcrypt.hashSync(PASSWORD_2, 12)

// Check if users already exist
const existing1 = get('SELECT id FROM "User" WHERE username = ?', ['aaditya'])
const existing2 = get('SELECT id FROM "User" WHERE username = ?', ['friend'])

let userId1, userId2

if (existing1) {
  userId1 = existing1.id
  console.log(`✓ User 'aaditya' already exists (id=${userId1})`)
} else {
  const r = run(
    'INSERT INTO "User" (username, password_hash, display_name, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
    ['aaditya', hash1, 'Aaditya Aggarwal']
  )
  userId1 = r.lastInsertRowid
  console.log(`✓ Created user 'aaditya' (id=${userId1}, pass='${PASSWORD_1}')`)
}

if (existing2) {
  userId2 = existing2.id
  console.log(`✓ User 'friend' already exists (id=${userId2})`)
} else {
  const r = run(
    'INSERT INTO "User" (username, password_hash, display_name, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
    ['friend', hash2, 'Friend']
  )
  userId2 = r.lastInsertRowid
  console.log(`✓ Created user 'friend' (id=${userId2}, pass='${PASSWORD_2}')`)
}

// ─── Assign existing companies to user 1 ────────────────────────────────────
const nullCompanies = db.prepare('SELECT COUNT(*) as c FROM "Company" WHERE user_id IS NULL').get()
if (nullCompanies.c > 0) {
  run('UPDATE "Company" SET user_id = ? WHERE user_id IS NULL', [userId1])
  console.log(`✓ Assigned ${nullCompanies.c} companies to user ${userId1}`)
} else {
  console.log('✓ All companies already have user_id assigned')
}

// ─── Assign existing templates to user 1 ─────────────────────────────────────
const nullTemplates = db.prepare('SELECT COUNT(*) as c FROM "Template" WHERE user_id IS NULL').get()
if (nullTemplates.c > 0) {
  run('UPDATE "Template" SET user_id = ? WHERE user_id IS NULL', [userId1])
  console.log(`✓ Assigned ${nullTemplates.c} templates to user ${userId1}`)
} else {
  console.log('✓ All templates already have user_id assigned')
}

// ─── Assign existing settings to user 1 ──────────────────────────────────────
const nullSettings = db.prepare('SELECT COUNT(*) as c FROM "Settings" WHERE user_id IS NULL').get()
if (nullSettings.c > 0) {
  run('UPDATE "Settings" SET user_id = ? WHERE user_id IS NULL', [userId1])
  console.log(`✓ Assigned ${nullSettings.c} settings row(s) to user ${userId1}`)
} else {
  console.log('✓ Settings already has user_id assigned')
}

// ─── Create empty settings for user 2 ────────────────────────────────────────
const user2Settings = get('SELECT id FROM "Settings" WHERE user_id = ?', [userId2])
if (!user2Settings) {
  run(
    `INSERT INTO "Settings" (user_id, gmailUser, gmailAppPass, pixelBaseUrl, aiBaseUrl, aiModel,
      dailyLimit, sentToday, sendingPaused, sendWindowStart, sendWindowEnd, updatedAt)
     VALUES (?, '', '', '', 'http://localhost:10531/v1', 'gpt-5.6-sol', 50, 0, 1, '10:30', '11:59', datetime('now'))`,
    [userId2]
  )
  console.log(`✓ Created empty settings for user 'friend' (id=${userId2}) — configure Gmail in Settings panel`)
} else {
  console.log('✓ Settings for user 2 already exists')
}

// ─── Assign existing daily_send_logs to user 1 ───────────────────────────────
try {
  const nullLogs = db.prepare('SELECT COUNT(*) as c FROM "DailySendLog" WHERE user_id IS NULL').get()
  if (nullLogs.c > 0) {
    run('UPDATE "DailySendLog" SET user_id = ? WHERE user_id IS NULL', [userId1])
    console.log(`✓ Assigned ${nullLogs.c} daily_send_log rows to user ${userId1}`)
  }
} catch {
  // Table might not exist yet
}

db.close()

console.log('\n✅ Done! Login credentials:')
console.log(`   aaditya / ${PASSWORD_1}`)
console.log(`   friend  / ${PASSWORD_2}`)
console.log('\n   Set custom passwords via env: USER1_PASS=xxx USER2_PASS=yyy node scripts/seed-users.mjs')
