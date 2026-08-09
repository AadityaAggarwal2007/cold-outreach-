import OpenAI from 'openai'
import { prisma } from './db'

function getClient(settings?: { aiBaseUrl: string; aiModel: string } | null) {
  return new OpenAI({
    baseURL: settings?.aiBaseUrl || process.env.OPENAI_BASE_URL || 'http://localhost:10531/v1',
    apiKey: process.env.OPENAI_API_KEY || 'local-proxy',
  })
}

// ─── Classify email + auto-draft reply ────────────────────────────────────────
export async function classifyAndDraftReply(
  incomingEmailId: number,
  body: string,
  subject: string,
  fromName: string,
  companyId: number | null,
  fromEmail: string = ''
): Promise<void> {
  try {
    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: { aiStatus: 'classifying' },
    })

    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    const model = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
    const client = getClient(settings)

    // ── Step 1: Classify ──────────────────────────────────────────────────────
    const classifyRes = await client.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: `You are analyzing an email received by an internship applicant named Aaditya Aggarwal.

Email subject: "${subject}"
Email from: ${fromName} <${fromEmail}>
Email body:
"""
${body.substring(0, 2000)}
"""

Classify this email into ONE of these categories:
- INTERNSHIP: Related to internship, job application, hiring, interview, resume, or career opportunity
- OTHER: Newsletters, promotions, spam, account notifications, OTPs, or anything not career-related

Reply with ONLY the category word: INTERNSHIP or OTHER`
      }],
      max_tokens: 10,
    })

    const category = classifyRes.choices[0]?.message?.content?.trim().toUpperCase()
    const isInternship = category?.includes('INTERNSHIP')

    if (!isInternship) {
      // Mark as irrelevant (shows in "Other" tab in inbox)
      await prisma.incomingEmail.update({
        where: { id: incomingEmailId },
        data: { aiStatus: 'irrelevant' },
      })
      console.log(`[AI] Classified as OTHER: "${subject}" from ${fromEmail}`)
      return
    }

    console.log(`[AI] Classified as INTERNSHIP: "${subject}" from ${fromEmail}`)

    // ── Step 2: Match / create company ───────────────────────────────────────
    let resolvedCompanyId = companyId

    if (!resolvedCompanyId && fromEmail) {
      // Try to extract company name from the email domain or sender name
      const domain = fromEmail.split('@')[1] || ''
      const companyNameFromDomain = domain.split('.')[0] || fromName

      // Check if company already exists by domain match
      const contacts = await prisma.contact.findMany({ select: { email: true, companyId: true } })
      for (const c of contacts) {
        if (c.email.toLowerCase().endsWith('@' + domain)) {
          resolvedCompanyId = c.companyId
          break
        }
      }

      // Still no match → ask AI to extract company name and create it
      if (!resolvedCompanyId) {
        const nameRes = await client.chat.completions.create({
          model,
          messages: [{
            role: 'user',
            content: `What is the company name from this email sender?
Sender name: "${fromName}"
Sender email: "${fromEmail}"
Email subject: "${subject}"

Reply with ONLY the company name (2-4 words max). If unknown, use the email domain name.`
          }],
          max_tokens: 20,
        })

        const aiCompanyName = nameRes.choices[0]?.message?.content?.trim() ||
          companyNameFromDomain.charAt(0).toUpperCase() + companyNameFromDomain.slice(1)

        // Create company
        try {
          const newCompany = await prisma.company.create({
            data: {
              name: aiCompanyName,
              stage: 'replied',
              repliedAt: new Date(),
            },
          })
          resolvedCompanyId = newCompany.id
          console.log(`[AI] Created new company: "${aiCompanyName}" for ${fromEmail}`)
        } catch {
          // Company might already exist (unique constraint) — find it
          const found = await prisma.company.findFirst({
            where: { name: { contains: companyNameFromDomain } },
          })
          if (found) resolvedCompanyId = found.id
        }
      }
    }

    // ── Step 3: Mark company as replied (stop follow-ups) ─────────────────────
    if (resolvedCompanyId) {
      await prisma.company.update({
        where: { id: resolvedCompanyId },
        data: { repliedAt: new Date(), stage: 'replied' },
      })
      await prisma.contact.updateMany({
        where: { companyId: resolvedCompanyId, status: { in: ['pending', 'sent'] } },
        data: { status: 'stopped', stoppedAt: new Date() },
      })
    }

    // ── Step 4: Get company name for draft ────────────────────────────────────
    let companyName = fromName
    if (resolvedCompanyId) {
      const company = await prisma.company.findFirst({ where: { id: resolvedCompanyId } })
      if (company) companyName = company.name
    }

    // ── Step 5: Draft reply ───────────────────────────────────────────────────
    const draftRes = await client.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: `You are Aaditya Aggarwal, a CS student applying for internships.

You received this email from ${fromName} at ${companyName}:
Subject: "${subject}"
"""
${body.substring(0, 2000)}
"""

Write a professional, warm, concise reply:
- Be specific to what they said
- Express genuine enthusiasm
- Under 130 words
- Do NOT use placeholder brackets like [Name]
- Start with a proper greeting using their name if available
- Sign off as "Aaditya Aggarwal"
- Output ONLY the email body in HTML using <p> tags
- No subject line, no headers`
      }],
      max_tokens: 450,
    })

    const draft = draftRes.choices[0]?.message?.content?.trim() || ''

    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: {
        aiStatus: 'draft_ready',
        aiDraftReply: draft,
        companyId: resolvedCompanyId,
      },
    })

    console.log(`[AI] Draft ready for email ${incomingEmailId} (company: ${companyName})`)
  } catch (err) {
    console.error('[AI] classifyAndDraftReply error:', err)
    // Reset to "new" so it gets retried
    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: { aiStatus: 'new' },
    }).catch(() => {})
  }
}

// ─── Re-generate a draft on demand ───────────────────────────────────────────
export async function regenerateDraft(incomingEmailId: number): Promise<string> {
  const email = await prisma.incomingEmail.findFirst({ where: { id: incomingEmailId } })
  if (!email) throw new Error('Email not found')

  const settings = await prisma.settings.findFirst({ where: { id: 1 } })
  const model = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
  const client = getClient(settings)

  let companyName = email.fromName || email.fromEmail
  if (email.companyId) {
    const company = await prisma.company.findFirst({ where: { id: email.companyId } })
    if (company) companyName = company.name
  }

  const res = await client.chat.completions.create({
    model,
    messages: [{
      role: 'user',
      content: `You are Aaditya Aggarwal, a CS student applying for internships.

You received this email from ${email.fromName || email.fromEmail} at ${companyName}:
Subject: "${email.subject}"
"""
${email.body.substring(0, 2000)}
"""

Write a fresh professional reply. Under 130 words. Output only HTML body using <p> tags. Sign as Aaditya Aggarwal.`
    }],
    max_tokens: 450,
  })

  const draft = res.choices[0]?.message?.content?.trim() || ''

  await prisma.incomingEmail.update({
    where: { id: incomingEmailId },
    data: { aiDraftReply: draft, aiStatus: 'draft_ready' },
  })

  return draft
}
