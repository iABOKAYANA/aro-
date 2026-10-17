'use client'

import { useState } from 'react'
import { Check, Copy, Link2, MessageCircle, Share2 } from 'lucide-react'

/**
 * Share-the-comparison button for the compare screen.
 *
 * Flow: POST /api/compare/share → try the native share sheet
 * (`navigator.share`, which on phones already lists WhatsApp) → always leave
 * the link panel on screen with copy + explicit WhatsApp fallbacks, because
 * desktop browsers have no share sheet at all.
 */
export default function ShareButton({ ids }: { ids: string[] }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'ready' | 'error'>('idle')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // Egyptian-dialect text that reads well inside a WhatsApp bubble.
  const text = 'بص على مقارنة المشاريع دي على غاية'

  async function createLink(): Promise<string | null> {
    setStatus('working')
    setCopied(false)
    try {
      const res = await fetch('/api/compare/share', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setStatus('error')
        return null
      }
      setUrl(data.url as string)
      setStatus('ready')
      return data.url as string
    } catch {
      setStatus('error')
      return null
    }
  }

  async function onShare() {
    if (status === 'working') return
    const link = status === 'ready' && url ? url : await createLink()
    if (!link) return
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'GHAYA — مقارنة مشاريع', text, url: link })
      } catch {
        // Dismissed the sheet — the link panel below still has copy + WhatsApp.
      }
    }
  }

  async function onCopy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
    } catch {
      // Clipboard API needs a secure context — fall back to a manual select.
      const ta = document.createElement('textarea')
      ta.value = `${text}\n${url}`
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
  }

  const waHref = url ? `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}` : ''

  return (
    <div className="flex w-full flex-col items-end gap-2 max-sm:items-stretch sm:w-auto">
      <button
        type="button"
        onClick={onShare}
        disabled={status === 'working' || ids.length === 0}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-estate-gold/50 px-4 py-2 text-xs font-semibold text-estate-gold transition-colors hover:bg-estate-gold/10 disabled:opacity-50 sm:min-h-0"
      >
        <Share2 className="h-3.5 w-3.5" />
        {status === 'working' ? 'بنعمل اللينك…' : 'شيّر المقارنة'}
      </button>

      {status === 'error' && (
        <p className="text-xs text-red-400">معرفناش نعمل اللينك — جرّب تاني.</p>
      )}

      {status === 'ready' && url && (
        <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.04] p-3 dark:border-[#262626] dark:bg-[#0A0A0A]">
          <p className="text-xs font-semibold text-white">اللينك جاهز! ابعته لصاحبك على واتساب</p>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-300 focus:border-estate-gold/60 focus:outline-none sm:text-[11px] dark:border-[#262626]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10 sm:min-h-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'اتنسخ!' : 'انسخ اللينك'}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#0b3d20] transition-colors hover:brightness-110 sm:min-h-0"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              واتساب
            </a>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
            <Link2 className="h-3 w-3" />
            أي حد يفتح اللينك هيشوف نفس المقارنة.
          </p>
        </div>
      )}
    </div>
  )
}
