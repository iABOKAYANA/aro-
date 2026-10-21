'use client'

import { useState } from 'react'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/**
 * Share-one-unit button for the unit page.
 *
 * Same flow as the compare share-button: try the native share sheet
 * (`navigator.share`, which on phones already lists WhatsApp) → fall back to
 * an inline panel with copy + an explicit WhatsApp link, because desktop
 * browsers have no share sheet at all. The canonical URL is the page itself.
 */
export function UnitShareButton({ name }: { name: string }) {
  const enabled = useFeatureFlag('share_whatsapp')
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Egyptian-dialect text that reads well inside a WhatsApp bubble.
  const text = ar ? `بص على الوحدة دي على غاية: ${name}` : `Check out this unit on GHAYA: ${name}`

  if (!enabled) return null

  async function onShare() {
    const url = window.location.href
    if ('share' in navigator) {
      try {
        await navigator.share({ title: name, text, url })
        return
      } catch {
        // Dismissed the sheet — fall through to the copy/WhatsApp panel.
      }
    }
    setOpen((v) => !v)
  }

  async function onCopy() {
    const payload = `${text}\n${window.location.href}`
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
    } catch {
      // Clipboard API needs a secure context — fall back to a manual select.
      const ta = document.createElement('textarea')
      ta.value = payload
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
      } catch {
        /* user can copy from the visible input */
      }
      document.body.removeChild(ta)
    }
    setTimeout(() => setCopied(false), 1600)
  }

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${text}\n${pageUrl}`)}`

  return (
    <div className="mb-3">
      <Button type="button" variant="outline" className="min-h-[44px] w-full md:min-h-0" onClick={onShare}>
        <Share2 className="me-2 h-4 w-4" />
        {ar ? 'شير الوحدة' : 'Share unit'}
      </Button>

      {open && (
        <div className="mt-2 rounded-2xl border p-3">
          <p className="text-xs font-semibold">{ar ? 'اللينك جاهز! ابعته لصاحبك على واتساب' : 'Link ready! Send it to your friend on WhatsApp'}</p>
          <input
            readOnly
            value={typeof window !== 'undefined' ? window.location.href : ''}
            onFocus={(e) => e.target.select()}
            className="mt-2 w-full rounded-xl border px-2.5 py-1.5 text-base focus:outline-none md:text-[11px]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted md:min-h-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (ar ? 'اتنسخ!' : 'Copied!') : (ar ? 'انسخ اللينك' : 'Copy link')}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#0b3d20] transition-colors hover:brightness-110 md:min-h-0"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {ar ? 'واتساب' : 'WhatsApp'}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
