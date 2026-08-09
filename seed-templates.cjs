/**
 * Seed script — run once on VPS to insert all 6 email templates.
 * Usage: cd /root/cold-outreach && node seed-templates.cjs
 */

const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'internreach.db'))

const templates = [
  {
    name: 'Initial Outreach',
    type: 'initial',
    subject: 'B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>I'm Aaditya Aggarwal, a B.Com student at Sri Guru Gobind Singh College of Commerce, University of Delhi. I'm reaching out to explore internship opportunities at {{Company Name}} where my background could be a good fit.</p>

<p><strong>A quick snapshot of my experience:</strong></p>

<ul style="margin:0;padding-left:20px;line-height:1.8">
  <li>Worked as a <strong>Data Analyst Intern</strong>, building automation and analytics systems across marketing and operations.</li>
  <li>Led college teams and coordinated partnerships with <strong>30+ organizations/societies</strong>.</li>
  <li>Built projects involving <strong>Excel, Power Query, Google Apps Script, n8n, AI APIs, and CRM automation</strong>.</li>
</ul>

<p>I'm particularly open to opportunities across <strong>analytics, operations, strategy, marketing, or business roles</strong>, and I'm comfortable learning new tools and adapting quickly.</p>

<p>I've attached my resume for reference. If there's a suitable opportunity at {{Company Name}}, or if you could connect me with the relevant person/team, I'd really appreciate it.</p>

<p>Thank you for your time.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong><br>
+91 9289144767<br>
aadityaaggarwal3526@gmail.com<br>
{{LinkedIn}}</p>`,
  },

  {
    name: 'Follow-up 1',
    type: 'followup_1',
    subject: 'Re: B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>Just following up on my previous email regarding internship opportunities at {{Company Name}}.</p>

<p>I'd be very interested in exploring any role across <strong>analytics, operations, strategy, marketing, or business</strong> where my experience could be useful.</p>

<p>I've attached my resume again for convenience. Would really appreciate it if you could let me know if there's a suitable opportunity or point me toward the relevant person.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong></p>`,
  },

  {
    name: 'Follow-up 2',
    type: 'followup_2',
    subject: 'Re: B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>Following up once more regarding potential internship opportunities at {{Company Name}}.</p>

<p>To give a little more context, my experience includes <strong>data analysis and automation</strong>, <strong>marketing and operations work</strong>, along with managing partnerships and outreach across <strong>30+ organizations</strong>.</p>

<p>I'd be happy to contribute wherever there's a strong fit and would also be open to taking up a <strong>short assignment or interview</strong> to demonstrate what I can bring to the team.</p>

<p>Would appreciate any guidance.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong></p>`,
  },

  {
    name: 'Follow-up 3',
    type: 'followup_3',
    subject: 'Re: B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>Just checking in again regarding internship opportunities at {{Company Name}}.</p>

<p>I'm still very interested in contributing to the team and am open to roles across <strong>analytics, operations, strategy, marketing, or other business functions</strong>.</p>

<p>Even if there isn't an active opening right now, I'd really appreciate it if you could <strong>keep my profile in consideration</strong> for upcoming opportunities.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong></p>`,
  },

  {
    name: 'Follow-up 4',
    type: 'followup_4',
    subject: 'Re: B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>Wanted to follow up briefly regarding my internship enquiry for {{Company Name}}.</p>

<p>I understand hiring needs can change, so I wanted to check if there might be any <strong>current or upcoming internship opportunities</strong> where my background could be relevant.</p>

<p>Happy to share any additional information or complete a <strong>short task</strong> if helpful.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong></p>`,
  },

  {
    name: 'Follow-up 5 (Final)',
    type: 'followup_5',
    subject: 'Re: B.Com Student Seeking Internship Opportunities | SGGSCC, DU',
    htmlBody: `<p>Hi {{Recipient Name}},</p>

<p>Wanted to send one final follow-up regarding internship opportunities at {{Company Name}}.</p>

<p>I understand you may be busy or there may not be a suitable opening currently. If anything relevant comes up across <strong>analytics, operations, strategy, marketing, or business</strong>, I'd be grateful if you could <strong>keep my profile in consideration</strong>.</p>

<p>Thank you for your time.</p>

<p>Best,<br>
<strong>Aaditya Aggarwal</strong></p>`,
  },
]

// Insert or replace each template
const upsert = db.prepare(`
  INSERT INTO Template (name, type, subject, htmlBody, createdAt, updatedAt)
  VALUES (@name, @type, @subject, @htmlBody, datetime('now'), datetime('now'))
  ON CONFLICT(type) DO UPDATE SET
    name = excluded.name,
    subject = excluded.subject,
    htmlBody = excluded.htmlBody,
    updatedAt = datetime('now')
`)

let count = 0
for (const t of templates) {
  upsert.run(t)
  console.log(`✅  ${t.type}: "${t.name}"`)
  count++
}

// Also set LinkedIn URL in settings
db.prepare(`UPDATE Settings SET linkedinUrl = 'https://www.linkedin.com/in/aaditya-aggarwal-analyst/' WHERE id = 1`).run()
console.log('✅  LinkedIn URL saved to settings')

console.log(`\nDone. ${count} templates seeded. Restart internreach: pm2 restart internreach`)
db.close()
