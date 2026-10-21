'use client'

import { useEffect, useState } from 'react'
import { X, Smartphone } from 'lucide-react'

/**
 * PWA install banner (flag pwa_install): Android/Chrome exposes the native
 * beforeinstallprompt; iOS shows manual instructions. Dismissed state is
 * remembered for 30 days (not forever — owners re-installing recover it).
 */

const DISMISS_KEY = 'pwa-banner-dismissed'

export function InstallPwaBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua)
    const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    setInstalled(standalone)
    setIsIos(ios)

    // 30-day dismissal memory
    let hidden = false
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      hidden = raw ? Date.now() - Number(raw) < 30 * 24 * 60 * 60_000 : false
    } catch { hidden = false }
    if (hidden) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      if (!hidden) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    if (ios && !standalone) setShow(true) // iOS never fires the event — show instructions
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (installed || !show) return null

  const dismiss = () => {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  async function install() {
    if (prompt) {
      prompt.prompt()
      try {
        const choice = await prompt.userChoice
        if (choice?.outcome === 'accepted') setShow(false)
      } catch { /* ignore */ }
      return
    }
    dismiss()
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-estate-gold/30 bg-background/95 p-3 shadow-lg backdrop-blur md:inset-x-auto md:end-3"
      role="dialog"
      aria-label="تسطيب التطبيق"
    >
      <Smartphone className="h-5 w-5 shrink-0 text-estate-gold" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed">
        {isIos ? (
          <>سطّب غاية على موبايلك: من مشاركة الصفحة ← <b>إضافة لشاشة البداية</b></>
        ) : (
          <>سطّب تطبيق غاية على موبايلك — وصول أسرع وتنبيه باقات جديدة</>
        )}
      </p>
      {!isIos && (
        <button
          onClick={install}
          className="shrink-0 rounded-full bg-estate-gold px-3 py-1.5 text-xs font-bold text-[#0F1A2C]"
        >
          تسطيب
        </button>
      )}
      <button onClick={dismiss} aria-label="إغلاق" className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
