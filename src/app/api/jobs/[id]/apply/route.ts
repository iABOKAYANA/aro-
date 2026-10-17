import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { saveUpload, UploadError } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function ipOf(req: NextRequest): string {
  // Shared extractor (src/lib/rate-limit.ts) — signature kept, callers untouched.
  return getClientIp(req.headers)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // One person, five applications an hour — enough for a real candidate,
    // useless for a bot harvesting the form.
    const rl = rateLimit(`apply:${ipOf(req)}`, { limit: 5, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many applications. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const contentType = req.headers.get('content-type') || ''

    let name = ''
    let email = ''
    let phone: string | null = null
    let coverLetter: string | null = null
    let resumeUrl: string | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      name = String(form.get('name') ?? '').trim()
      email = String(form.get('email') ?? '').trim().toLowerCase()
      phone = String(form.get('phone') ?? '').trim() || null
      coverLetter = String(form.get('coverLetter') ?? '').trim() || null

      const file = form.get('resume')
      if (file instanceof File) {
        const saved = await saveUpload(file, 'resume')
        resumeUrl = saved.url
      }
    } else {
      const body = await req.json()
      name = String(body.name ?? '').trim()
      email = String(body.email ?? '').trim().toLowerCase()
      phone = body.phone ? String(body.phone).trim() : null
      coverLetter = body.coverLetter ? String(body.coverLetter).trim() : null
      // Legacy path — a resume must now be an uploaded file, not a URL the
      // visitor typed. Only `saveUpload()` outputs are accepted: the local
      // `/uploads/resumes/...` path, or our own Blob-store https URL (remote-
      // URL smuggling and path traversal both 400 here).
      const rawResume = body.resumeUrl ? String(body.resumeUrl) : null
      if (rawResume) {
        const ok =
          /^\/uploads\/resumes\/[A-Za-z0-9._-]+\.(pdf|doc|docx)$/i.test(rawResume) ||
          /^https:\/\/[^/]*\.blob\.vercel-storage\.com\/\S+\.(pdf|doc|docx)(\?\S*)?$/i.test(
            rawResume
          )
        if (!ok) {
          return NextResponse.json(
            { error: 'Resume must be uploaded through the application form.' },
            { status: 400 }
          )
        }
        resumeUrl = rawResume
      }
    }

    if (!name || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'A valid name and email are required.' },
        { status: 400 }
      )
    }

    const job = await db.job.findUnique({ where: { id } })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (!job.isPublished) {
      return NextResponse.json({ error: 'Job is not published' }, { status: 400 })
    }

    const application = await db.jobApplication.create({
      data: { jobId: id, name, email, phone, resumeUrl, coverLetter },
    })

    // Notify the CEO team (and email them if SMTP is configured — see lib/mailer).
    // Fail-soft by design: the applicant ALWAYS gets a 201 — a dead mail
    // server must never surface as a user-facing error. Failures are logged
    // server-side (and persisted to the CEO outbox by the mailer) instead.
    // (ar: التقديم بينجح حتى لو الإيميل واقع — المشكلة بتتسجل في السيرفر بس.)
    const notified = await notifyApplicantsTeam(job, application).catch(() => null)
    const mailResult = notified?.[0]
    if (mailResult && !mailResult.ok) {
      console.error('[apply] confirmation email failed:', mailResult.error)
    }

    return NextResponse.json({ application }, { status: 201 })
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Job application error:', error)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}

async function notifyApplicantsTeam(
  job: { id: string; title: string },
  application: { id: string; name: string; email: string; resumeUrl: string | null }
) {
  // Lazily imported so the apply endpoint keeps working even if the mailer
  // module is misconfigured.
  const { sendMail, mailHtml, escapeHtml } = await import('@/lib/mailer')
  const { notifyRole } = await import('@/lib/notify')

  const html = mailHtml({
    heading: `Application received — ${job.title}`,
    body: `<p>Hi ${escapeHtml(application.name)},</p>
           <p>We've received your application for <strong>${escapeHtml(job.title)}</strong>.
           Our team will review it and get back to you shortly.</p>`,
  })

  return Promise.all([
    sendMail({
      to: application.email,
      subject: `Application received — ${job.title}`,
      text: `Hi ${application.name},\n\nWe've received your application for "${job.title}". Our team will review it and get back to you shortly.\n\n— GHAYA REAL ESTATE`,
      html,
      meta: { jobId: job.id, applicationId: application.id },
    }),
    notifyRole(['CEO', 'ADMIN'], {
      type: 'JOB_APPLICATION',
      title: 'New job application',
      message: `${application.name} applied for ${job.title}`,
      link: `/ceo/jobs`,
      metadata: { applicationId: application.id, jobId: job.id },
    }),
  ])
}
