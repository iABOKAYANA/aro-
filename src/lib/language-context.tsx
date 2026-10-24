'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { translations } from '@/lib/translations'

// ─── Translation Keys ────────────────────────────────────

type TranslationKey = keyof typeof translations.en

// ─── Context ─────────────────────────────────────────────

interface LanguageContextValue {
  lang: 'en' | 'ar'
  setLang: (lang: 'en' | 'ar') => void
  t: (key: string) => string
  dir: 'ltr' | 'rtl'
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode
  initialLanguage?: 'en' | 'ar'
}) {
  const [lang, setLangState] = useState<'en' | 'ar'>(initialLanguage)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('estateai-lang') as 'en' | 'ar' | null
    if (saved === 'ar' || saved === 'en') {
      setLangState(saved)
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('estateai-lang', lang)
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `ghaya-lang=${lang}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  }, [lang, mounted])

  const setLang = useCallback((newLang: 'en' | 'ar') => {
    setLangState(newLang)
  }, [])

  const t = useCallback((key: string): string => {
    const dict = translations[lang] as Record<string, string>
    return dict[key] || key
  }, [lang])

  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  const value: LanguageContextValue = { lang, setLang, t, dir }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
