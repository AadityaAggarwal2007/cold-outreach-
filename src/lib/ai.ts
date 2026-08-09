import OpenAI from 'openai'
import { prisma } from './db'

function getClient(settings?: { aiBaseUrl: string; aiModel: string } | null) {
  return new OpenAI({
    baseURL: settings?.aiBaseUrl || process.env.OPENAI_BASE_URL || 'http://localhost:10531/v1',
    apiKey: process.env.OPENAI_API_KEY || 'local-proxy',
  })
}

// Classify an incoming email and draft a reply if it's internship-related
export async function classifyAndDraftReply(
  incomingEmailId: number,
  body: string,
  subject: string,
  fromName: string,
  companyId: number | null
): Promise<void> {
  try {
    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: { aiStatus: 'classifying' },
    })

    const settings = await prisma.settings.findFirst({ where: { id: 1 } })
    const model = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
    const client = getClient(settings)

    let companyName = 'this company'
    if (companyId) {
      const company = await prisma.company.findFirst({ where: { id: companyId } })
      if (company) companyName = company.name
    }

    const classifyPrompt = `You are analyzing an email received by an internship applicant.

Email subject: "${subject}"
Email body:
"""
${body.substring(0, 3000)}
"""

Question: Is this email related to an internship application, job application, or career opportunity? 
Answer with only "YES" or "NO".`

    const classifyRes = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: classifyPrompt }],
      max_tokens: 5,
    })

    const isRelated = classifyRes.choices[0]?.message?.content?.trim().toUpperCase().startsWith('YES')

    if (!isRelated) {
      await prisma.incomingEmail.update({
        where: { id: incomingEmailId },
        data: { aiStatus: 'irrelevant' },
      })
      return
    }

    // Mark company as replied — stop all follow-ups
    if (companyId) {
      await prisma.company.update({
        where: { id: companyId },
        data: { repliedAt: new Date(), stage: 'replied' },
      })
      // Stop all contacts at this company
      await prisma.contact.updateMany({
        where: { companyId, status: { in: ['pending', 'sent'] } },
        data: { status: 'stopped', stoppedAt: new Date() },
      })
    }

    // Draft a reply
    const draftPrompt = `You are an enthusiastic and professional internship applicant named Aaditya Aggarwal.

You received this email from ${fromName} at ${companyName}:
Subject: "${subject}"
"""
${body.substring(0, 2000)}
"""

Write a professional, warm, and concise reply email. 
- Express genuine interest and enthusiasm
- Be specific to what they said
- Keep it under 150 words
- Do NOT use placeholders like [Your Name] — write it as Aaditya Aggarwal
- Output ONLY the email body in HTML format (no subject line, no "From:", just the body content starting with greeting)
- Use <p> tags for paragraphs`

    const draftRes = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: draftPrompt }],
      max_tokens: 400,
    })

    const draft = draftRes.choices[0]?.message?.content?.trim() || ''

    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: {
        aiStatus: 'draft_ready',
        aiDraftReply: draft,
        companyId: companyId,
      },
    })
  } catch (err) {
    console.error('[AI] classifyAndDraftReply error:', err)
    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: { aiStatus: 'new' }, // reset so it can be retried
    })
  }
}

// Re-generate a draft reply on demand
export async function regenerateDraft(incomingEmailId: number): Promise<string> {
  const email = await prisma.incomingEmail.findFirst({ where: { id: incomingEmailId } })
  if (!email) throw new Error('Email not found')

  const settings = await prisma.settings.findFirst({ where: { id: 1 } })
  const model = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
  const client = getClient(settings)

  let companyName = 'this company'
  if (email.companyId) {
    const company = await prisma.company.findFirst({ where: { id: email.companyId } })
    if (company) companyName = company.name
  }

  const draftPrompt = `You are an enthusiastic and professional internship applicant named Aaditya Aggarwal.

You received this email from ${email.fromName || email.fromEmail} at ${companyName}:
Subject: "${email.subject}"
"""
${email.body.substring(0, 2000)}
"""

Write a professional, warm, and concise reply. Under 150 words. Output only the HTML body using <p> tags.`

  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: draftPrompt }],
    max_tokens: 400,
  })

  const draft = res.choices[0]?.message?.content?.trim() || ''

  await prisma.incomingEmail.update({
    where: { id: incomingEmailId },
    data: { aiDraftReply: draft, aiStatus: 'draft_ready' },
  })

  return draft
}
