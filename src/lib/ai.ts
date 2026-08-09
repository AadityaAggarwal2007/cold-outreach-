import OpenAI from 'openai'
import { prisma } from './db'
import { DEFAULT_SYSTEM_PROMPT } from './systemPrompt'

function getClient(settings?: { aiBaseUrl: string; aiModel: string } | null) {
  return new OpenAI({
    baseURL: settings?.aiBaseUrl || process.env.OPENAI_BASE_URL || 'http://localhost:10531/v1',
    apiKey: process.env.OPENAI_API_KEY || 'local-proxy',
  })
}

// ─── Main classify + draft function ──────────────────────────────────────────
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
    const model    = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
    const client   = getClient(settings)

    const systemPrompt = (settings?.systemPrompt && settings.systemPrompt.trim())
      ? settings.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT

    // ── Step 1: 3-way classification ─────────────────────────────────────────
    const classifyRes = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Classify this email Aaditya received. Reply with EXACTLY ONE of: INTERNSHIP | REPLY_NEEDED | NO_REPLY

Definitions:
- INTERNSHIP: Genuine HR/founder reply, interview invite, shortlist, offer, or direct recruitment for a role
- REPLY_NEEDED: Needs a human response but NOT internship-related (personal, college, vendor, important info)
- NO_REPLY: Fully automated — Google/Apple alerts, OTPs, newsletters, marketing, billing, social digests

Email subject: "${subject}"
From: ${fromName} <${fromEmail}>
Body:
"""
${body.substring(0, 2000)}
"""

Reply with ONLY one word: INTERNSHIP or REPLY_NEEDED or NO_REPLY`
        }
      ],
      max_tokens: 15,
    })

    const raw = classifyRes.choices[0]?.message?.content?.trim().toUpperCase() || ''
    const category: 'INTERNSHIP' | 'REPLY_NEEDED' | 'NO_REPLY' =
      raw.includes('INTERNSHIP')   ? 'INTERNSHIP'   :
      raw.includes('REPLY_NEEDED') ? 'REPLY_NEEDED' : 'NO_REPLY'

    console.log(`[AI] "${subject}" from ${fromEmail} → ${category}`)

    // ── Step 2: Handle each category ─────────────────────────────────────────

    if (category === 'NO_REPLY') {
      // Get a short reason why no reply is needed
      const reasonRes = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `This email does NOT need a reply. In one sentence (max 15 words), explain why:
Subject: "${subject}"
From: ${fromName} <${fromEmail}>
Reply with ONLY the reason sentence, no extra text.`
          }
        ],
        max_tokens: 40,
      })
      const reason = reasonRes.choices[0]?.message?.content?.trim() || 'Automated email — no reply needed.'

      await prisma.incomingEmail.update({
        where: { id: incomingEmailId },
        data: {
          aiStatus:    'no_reply',
          aiDraftReply: `🚫 No reply needed: ${reason}`,
        },
      })
      return
    }

    // Both INTERNSHIP and REPLY_NEEDED need a draft
    // ── Step 3: Resolve company (for INTERNSHIP only) ─────────────────────────
    let resolvedCompanyId = companyId

    if (category === 'INTERNSHIP' && !resolvedCompanyId && fromEmail) {
      const domain = fromEmail.split('@')[1] || ''
      const companyNameFromDomain = domain.split('.')[0] || fromName

      const contacts = await prisma.contact.findMany({ select: { email: true, companyId: true } })
      for (const c of contacts) {
        if (c.email.toLowerCase().endsWith('@' + domain)) {
          resolvedCompanyId = c.companyId
          break
        }
      }

      if (!resolvedCompanyId) {
        const nameRes = await client.chat.completions.create({
          model,
          messages: [{
            role: 'user',
            content: `What is the company name from this sender?
Name: "${fromName}", Email: "${fromEmail}", Subject: "${subject}"
Reply with ONLY the company name (2-4 words). If unclear, use the email domain name.`
          }],
          max_tokens: 20,
        })
        const aiCompanyName = nameRes.choices[0]?.message?.content?.trim() ||
          companyNameFromDomain.charAt(0).toUpperCase() + companyNameFromDomain.slice(1)

        try {
          const newCompany = await prisma.company.create({
            data: { name: aiCompanyName, stage: 'replied', repliedAt: new Date() },
          })
          resolvedCompanyId = newCompany.id
          console.log(`[AI] Created company: "${aiCompanyName}"`)
        } catch {
          const found = await prisma.company.findFirst({
            where: { name: { contains: companyNameFromDomain } },
          })
          if (found) resolvedCompanyId = found.id
        }
      }
    }

    // ── Step 4: Stop follow-ups if internship reply ───────────────────────────
    if (category === 'INTERNSHIP' && resolvedCompanyId) {
      await prisma.company.update({
        where: { id: resolvedCompanyId },
        data: { repliedAt: new Date(), stage: 'replied' },
      })
      await prisma.contact.updateMany({
        where: { companyId: resolvedCompanyId, status: { in: ['pending', 'sent'] } },
        data: { status: 'stopped', stoppedAt: new Date() },
      })
    }

    // ── Step 5: Get company name for context ──────────────────────────────────
    let companyName = fromName
    if (resolvedCompanyId) {
      const company = await prisma.company.findFirst({ where: { id: resolvedCompanyId } })
      if (company) companyName = company.name
    }

    // ── Step 6: Draft reply ───────────────────────────────────────────────────
    const draftPrompt = category === 'INTERNSHIP'
      ? `You are Aaditya Aggarwal (CS student, SGGSCC Delhi). Write a reply to this email from ${fromName} at ${companyName}.

Subject: "${subject}"
"""
${body.substring(0, 2000)}
"""

Rules:
- Professional, warm, confident — never desperate
- Under 120 words unless the email is complex
- Be specific to what they said
- Sign as Aaditya Aggarwal
- Output ONLY the HTML body using <p> tags (no subject line, no headers)`

      : `You are Aaditya Aggarwal (CS student, SGGSCC Delhi). Write a brief, appropriate reply to this email from ${fromName}.

Subject: "${subject}"
"""
${body.substring(0, 1500)}
"""

Rules:
- Match the tone (formal or casual) of the email
- Keep it short and appropriate
- Sign as Aaditya Aggarwal
- Output ONLY the HTML body using <p> tags`

    const draftRes = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: draftPrompt }
      ],
      max_tokens: 500,
    })

    const draft = draftRes.choices[0]?.message?.content?.trim() || ''

    await prisma.incomingEmail.update({
      where: { id: incomingEmailId },
      data: {
        aiStatus:    category === 'INTERNSHIP' ? 'draft_ready' : 'reply_needed',
        aiDraftReply: draft,
        companyId:   resolvedCompanyId,
      },
    })

  } catch (err) {
    console.error('[AI] classifyAndDraftReply error:', err)
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
  const model    = settings?.aiModel || process.env.OPENAI_MODEL || 'gpt-5.6-sol'
  const client   = getClient(settings)

  const systemPrompt = (settings?.systemPrompt && settings.systemPrompt.trim())
    ? settings.systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT

  let companyName = email.fromName || email.fromEmail
  if (email.companyId) {
    const company = await prisma.company.findFirst({ where: { id: email.companyId } })
    if (company) companyName = company.name
  }

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a fresh professional reply from Aaditya Aggarwal to ${email.fromName || email.fromEmail} at ${companyName}.

Subject: "${email.subject}"
"""
${email.body.substring(0, 2000)}
"""

Under 130 words. Output only HTML body using <p> tags. Sign as Aaditya Aggarwal.`
      }
    ],
    max_tokens: 500,
  })

  const draft = res.choices[0]?.message?.content?.trim() || ''

  await prisma.incomingEmail.update({
    where: { id: incomingEmailId },
    data: { aiDraftReply: draft, aiStatus: 'draft_ready' },
  })

  return draft
}
