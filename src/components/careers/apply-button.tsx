'use client'

import { useRef, useState } from 'react'
import { useLanguage } from '@/lib/language-context'

type Props = {
  jobId: string
  jobTitle: string
}

const MAX_MB = 5
const ACCEPT = '.pdf,.doc,.docx'

/**
 * "Apply Now" → inline modal with a real CV upload.
 *
 * Posts `multipart/form-data` to /api/jobs/[id]/apply; the server validates
 * extension, size and magic bytes before writing the file.
 */
export default function ApplyButton({ jobId, jobTitle }: Props) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function close() {
    setOpen(false)
    setError(null)
    setDone(false)
    setFileName(null)
    formRef.current?.reset()
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('resume')
    if (!(file instanceof File) || file.size === 0) {
      setError(ar ? 'ارفق السي في بتاعك (PDF أو DOC أو DOCX — لحد 5 ميجا).' : 'Please attach your CV (PDF, DOC or DOCX — max 5 MB).')
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(ar ? `الملف كبير أوي — الحد الأقصى ${MAX_MB} ميجا.` : `File is too large — maximum ${MAX_MB} MB.`)
      return
    }

    setSending(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('job apply failed', data.error)
        throw new Error(ar ? 'حصلت مشكلة. جرّب تاني.' : 'Something went wrong. Please try again.')
      }
      setDone(true)
      formRef.current?.reset()
      setFileName(null)
    } catch (err) {
      console.error('job apply error', err)
      setError(ar ? 'حصلت مشكلة. جرّب تاني.' : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-estate-gold/40 bg-estate-gold/10 px-5 py-2 text-sm font-medium text-estate-gold transition-colors hover:bg-estate-gold hover:text-estate-navy"
      >
        {ar ? 'قدّم دلوقتي' : 'Apply Now'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-title"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0d1428] shadow-2xl dark:border-[#262626] dark:bg-black">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 dark:border-[#262626]">
              <div>
                <h2 id="apply-title" className="text-lg font-semibold text-white">
                  {ar ? 'قدّم على' : 'Apply for'} {jobTitle}
                </h2>
                <p className="mt-1 text-xs text-gray-400">{ar ? 'كل الخانات اللي عليها * إجباري.' : 'All fields marked * are required.'}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-400">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <p className="mt-4 text-base font-medium text-white">{ar ? 'الطلب وصلنا' : 'Application received'}</p>
                <p className="mt-2 text-sm text-gray-400">
                  {ar ? 'شكراً — بعتنا لك إيميل تأكيد وفريقنا هيراجع السي في بتاعك.' : "Thanks — we've sent you a confirmation email and our team will review your CV."}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 rounded-full bg-estate-gold px-6 py-2.5 text-sm font-semibold text-estate-navy hover:brightness-110"
                >
                  {ar ? 'اقفل' : 'Close'}
                </button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={onSubmit} className="space-y-4 px-6 py-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={ar ? 'الاسم بالكامل *' : 'Full name *'} name="name" type="text" autoComplete="name" required />
                  <Field label={ar ? 'الإيميل *' : 'Email *'} name="email" type="email" autoComplete="email" required />
                </div>
                <Field label={ar ? 'التليفون' : 'Phone'} name="phone" type="tel" autoComplete="tel" />

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-300" htmlFor="resume">
                    {ar ? 'السي في *' : 'CV / Resume *'} <span className="text-gray-500">{ar ? `(PDF أو DOC أو DOCX — لحد ${MAX_MB} ميجا)` : `(PDF, DOC, DOCX — max ${MAX_MB} MB)`}</span>
                  </label>
                  <input
                    id="resume"
                    name="resume"
                    type="file"
                    accept={ACCEPT}
                    required
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                    className="block w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-200 file:mr-3 file:rounded-full file:border-0 file:bg-estate-gold/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-estate-gold hover:file:bg-estate-gold/30 focus:border-estate-gold/60 focus:outline-none"
                  />
                  {fileName && <p className="mt-1.5 text-xs text-estate-gold">📎 {fileName}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-300" htmlFor="coverLetter">
                    {ar ? 'خطاب التقديم' : 'Cover letter'}
                  </label>
                  <textarea
                    id="coverLetter"
                    name="coverLetter"
                    rows={4}
                    maxLength={4000}
                    placeholder={ar ? 'قولّنا ليه انت مناسب...' : "Tell us why you're a great fit…"}
                    className="w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-500 focus:border-estate-gold/60 focus:outline-none"
                  />
                </div>

                {error && (
                  <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/10"
                  >
                    {ar ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="rounded-full bg-estate-gold px-6 py-2.5 text-sm font-semibold text-estate-navy transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (ar ? 'بيتبعت...' : 'Submitting…') : (ar ? 'ابعت الطلب' : 'Submit application')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  name,
  type,
  autoComplete,
  required,
}: {
  label: string
  name: string
  type: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-300" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-500 focus:border-estate-gold/60 focus:outline-none"
      />
    </div>
  )
}
