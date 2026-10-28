'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowLeft, ArrowRight, Mic } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { useParallax } from '@/components/design/useParallax'
import { useAppType } from '@/lib/use-app-type'

/** Minimal Web Speech API surface — one-shot dictation only. */
interface VoiceResultAlternative {
  transcript: string
}
interface VoiceResult extends ArrayLike<VoiceResultAlternative> {
  isFinal: boolean
}
interface VoiceResultEvent {
  results: ArrayLike<VoiceResult>
}
interface VoiceRecognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: VoiceResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type VoiceRecognizerCtor = new () => VoiceRecognizer

function getVoiceRecognizerCtor(): VoiceRecognizerCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: VoiceRecognizerCtor
    webkitSpeechRecognition?: VoiceRecognizerCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function HeroSearch({
  availableUnits,
  hero,
}: {
  availableUnits: number | null
  hero?: import('@/lib/home-hero').HeroShowcase | null
}) {
  const router = useRouter()
  const { lang } = useLanguage()
  const [question, setQuestion] = useState('')
  const isRtl = lang === 'ar'
  // Zero-login public site: the sign-in button below only renders off the
  // public host (`null` pre-mount keeps SSR/first paint identical).
  const appType = useAppType()
  const showSignIn = appType !== null && appType !== 'public'
  // Backdrop-only parallax: SSR-safe (0px first paint), mounted gate built in.
  const { ref: backdropRef, style: backdropStyle } = useParallax<HTMLDivElement>(0.25)

  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const recognizerRef = useRef<VoiceRecognizer | null>(null)

  // Feature-detect on mount (SSR has no window); hide the mic when unsupported.
  useEffect(() => {
    setVoiceSupported(getVoiceRecognizerCtor() !== null)
    return () => {
      try {
        recognizerRef.current?.abort()
      } catch {
        // Already stopped — nothing to clean up.
      }
      recognizerRef.current = null
    }
  }, [])

  const stopVoice = () => {
    try {
      recognizerRef.current?.stop()
    } catch {
      // Already stopped — onend still resets the state.
    }
  }

  const toggleVoice = () => {
    // Second tap stops and keeps whatever already landed in the box.
    if (listening) {
      stopVoice()
      return
    }
    const Ctor = getVoiceRecognizerCtor()
    if (!Ctor) return
    setVoiceHint(null)
    const recognition = new Ctor()
    recognition.lang = 'ar-EG'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (event) => {
      const parts: string[] = []
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript
        if (transcript) parts.push(transcript)
      }
      const text = parts.join(' ').trim()
      // Into the EXISTING input for review — never auto-sends.
      if (text) setQuestion(text)
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceHint(
          isRtl
            ? 'المايك مقفول — افتحه من إعدادات المتصفح عشان تتكلم بدل ما تكتب.'
            : 'Microphone is blocked — allow it in the browser settings to speak instead of typing.',
        )
      } else if (event.error === 'no-speech') {
        setVoiceHint(isRtl ? 'مسمعتكش كويس — حاول تاني.' : 'Did not catch that — please try again.')
      } else {
        setVoiceHint(
          isRtl
            ? 'البحث الصوتي مش شغال دلوقتي — اكتب سؤالك عادي.'
            : 'Voice search is unavailable right now — just type your question.',
        )
      }
    }
    recognition.onend = () => {
      setListening(false)
      recognizerRef.current = null
    }
    try {
      recognition.start()
      recognizerRef.current = recognition
      setListening(true)
    } catch {
      setVoiceHint(
        isRtl
          ? 'البحث الصوتي مش شغال دلوقتي — اكتب سؤالك عادي.'
          : 'Voice search is unavailable right now — just type your question.',
      )
    }
  }

  // The hero box is the AI assistant, not a keyword search:
  // the question goes straight to the chat page which auto-sends it (?q=)
  const handleAsk = () => {
    const q = question.trim()
    router.push(q ? `/ai-tools/chat?q=${encodeURIComponent(q)}` : '/ai-tools/chat')
  }

  return (
    <section className="cine-hero flex flex-col bg-estate-navy dark:bg-black" style={{ height: 'auto', minHeight: '100svh' }}>
      {/* minHeight keeps the 100svh full-bleed contract while letting tall
          content grow instead of clipping (height:auto overrides the fixed
          100svh so the search box is never cut off on small screens). */}
      {/* Ken Burns backdrop (existing hero image source) — the ONLY parallax
          layer. Wipe reveal on the inner box (square, unrounded → clip-safe). */}
      {/* ref cast: hook types current as nullable (React 19 style); this repo
          is on React 18 types — cast is type-only, runtime object untouched. */}
      <div ref={backdropRef as unknown as RefObject<HTMLDivElement>} style={backdropStyle} data-parallax aria-hidden="true" className="kenburns absolute inset-0">
        {/* Above-fold LCP layer: plain div, NOT <Reveal/> — .reveal starts at
            opacity:0 until client JS fires, which gated LCP on hydration. */}
        <div className="absolute inset-0">
          <Image
            src="/images/placeholder.jpg"
            alt="Luxury Living Room"
            fill
            priority
            fetchPriority="high"
            className="h-full w-full object-cover animate-kenburns"
            sizes="100vw"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>
      </div>
      <div className="cine-scrim" aria-hidden="true" />
      <div className="cine-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      {/* Lattice + glow sit above the scrim for texture (static — no parallax). */}
      <div aria-hidden="true" className="mashrabiya pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 start-1/4 h-96 w-96 rounded-full bg-estate-gold/10 blur-3xl" />
      <div className="container relative z-10 m-auto w-full px-4 py-12 md:py-16 lg:py-20">
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-[45%]">
            {/* Rise (not wipe): the arch's rounded top + overflowing badges
                would be squared/clipped by a clip-path reveal. Phone keeps a
                narrower arch so the headline + search stay near the fold. */}
            {/* Above-fold: plain div, NOT <Reveal/> (same LCP gating reason). */}
            {/* CEO-controlled showcase: image/caption come from SystemSetting
                (home_hero); when the CEO set link-mode 'project' the whole
                arch becomes the click target into that project's page.
                Default (nothing configured) renders the built-in showcase
                exactly as before — image only. */}
            {hero?.linkMode === 'project' && hero.projectSlug ? (
              <Link
                href={`/projects/${hero.projectSlug}`}
                aria-label={isRtl
                  ? `افتح المشروع: ${hero.projectNameAr || hero.projectNameEn || ''}`
                  : `Open project: ${hero.projectNameEn || hero.projectNameAr || ''}`}
                className="block rounded-t-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-estate-gold"
              >
                <ArchShowcase hero={hero} availableUnits={availableUnits} isRtl={isRtl} linked />
              </Link>
            ) : (
              <ArchShowcase hero={hero} availableUnits={availableUnits} isRtl={isRtl} />
            )}
          </div>

          <div className="w-full text-center lg:w-[50%] lg:text-right">
            {/* Above-fold: plain div, NOT <Reveal/> (same LCP gating reason). */}
            <div>
            <div className="mb-4 flex items-center gap-3 justify-center lg:justify-end">
              <span className="cine-kicker">
                GHAYA REAL ESTATE
              </span>
              <span className="text-white/50">—</span>
              <span className="text-sm text-white/70">
                {isRtl ? 'دليل عقاري هادئ' : 'Calm Real Estate Guide'}
              </span>
            </div>

            <h1 className="cine-title mb-6">
              {isRtl ? (
                <>
                  اختيارك الصح
                  <br />
                  <span className="text-estate-gold">يوفّر وقتك.</span>
                </>
              ) : (
                <>
                  The right choice
                  <br />
                  <span className="text-estate-gold">saves you time.</span>
                </>
              )}
            </h1>

            <p className="mb-8 text-base leading-relaxed text-white/70 md:text-lg">
              {isRtl
                ? 'بنرتّب لك السوق العقاري المصري حسب اللي يهمك فعلًا: المنطقة، وضوح البيانات، وطريقة السداد.'
                : 'Navigate Egypt’s property market by what matters to you: location, clear information, and payment terms.'}
            </p>
            </div>

            <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:mx-0 dark:border dark:border-[#262626] dark:bg-[#0A0A0A]">
              <div className="flex">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => {
                      setQuestion(e.target.value)
                      if (voiceHint) setVoiceHint(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder={isRtl ? 'اسأل عين... مثلاً: شقق في القاهرة الجديدة' : 'Ask EYN... e.g. apartments in New Cairo'}
                    className="w-full border-0 bg-transparent py-4 pl-14 pr-5 text-gray-700 placeholder:text-gray-400 focus:outline-none md:pl-12 dark:text-white dark:placeholder:text-gray-400"
                  />
                  {voiceSupported ? (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      aria-label={isRtl ? 'بحث صوتي' : 'Voice search'}
                      title={isRtl ? 'بحث صوتي' : 'Voice search'}
                      className={`absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors md:left-3 md:h-auto md:w-auto md:p-1.5 ${
                        listening
                          ? 'animate-pulse bg-red-100 text-red-600'
                          : 'text-gray-400 hover:text-estate-gold'
                      }`}
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  ) : null}
                  <Sparkles className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-estate-gold" />
                </div>
                <button
                  onClick={handleAsk}
                  className="gold-shimmer flex shrink-0 items-center gap-2 bg-estate-gold px-5 py-4 font-medium text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark sm:px-6"
                >
                  {isRtl ? 'اسأل عين' : 'Ask EYN'}
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
            {listening || voiceHint ? (
              <p
                className={`mx-auto mt-2 max-w-xl text-sm lg:mx-0 ${
                  listening ? 'animate-pulse text-white' : 'text-white/70'
                }`}
              >
                {listening
                  ? isRtl
                    ? 'بسمعك… دوس على المايك عشان توقف'
                    : 'Listening… tap the mic to stop'
                  : voiceHint}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium lg:justify-end">
              <button
                onClick={() => router.push('/ai-tools/chat')}
                className="flex min-h-[44px] items-center gap-2 px-1 text-white/80 transition-colors hover:text-white"
              >
                <span>{isRtl ? 'اسأل عين' : 'Ask EYN'}</span>
                <span className="text-estate-gold">✦</span>
              </button>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/40 rtl:rotate-180" aria-hidden />
              <button
                onClick={() => router.push('/projects')}
                className="flex min-h-[44px] items-center gap-2 px-1 text-white/80 transition-colors hover:text-white"
              >
                {isRtl ? 'أو تصفح بنفسك على مزاجك' : 'or browse on your own'}
              </button>
            </div>

            {showSignIn && (
            <div className="mt-6">
              <button
                onClick={() => router.push('/auth/login')}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 hover:border-white/50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                {isRtl ? 'تسجيل الدخول' : 'Sign In'}
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The arched image showcase (image + stat badge + caption pill), extracted so
 * it can render either bare (image-only mode) or inside a project Link
 * (linked mode — gold ring+lift on hover so it reads as tappable).
 * Everything visual now comes from the CEO's home_hero settings; unset
 * fields keep the built-in defaults, so the empty hero can never break.
 */
function ArchShowcase({
  hero,
  availableUnits,
  isRtl,
  linked = false,
}: {
  hero?: import('@/lib/home-hero').HeroShowcase | null
  availableUnits: number | null
  isRtl: boolean
  linked?: boolean
}) {
  const imageUrl = hero?.imageUrl || '/images/uploads/1791413758072-611f2f09.webp'
  const caption =
    isRtl
      ? (hero?.captionAr || hero?.captionEn || 'مساحات مصممة للحياة')
      : (hero?.captionEn || hero?.captionAr || 'Spaces Designed for Living')
  const linkedName =
    isRtl
      ? (hero?.projectNameAr || hero?.projectNameEn || '')
      : (hero?.projectNameEn || hero?.projectNameAr || '')
  return (
    <div className="relative mx-auto max-w-[280px] sm:max-w-[420px]">
      <div className="animate-float-slow relative">
        <div
          className={`arch relative bg-white ring-1 transition-[box-shadow,transform] duration-300 dark:bg-[#0A0A0A] ${
            linked
              ? 'cursor-pointer ring-estate-gold/40 hover:scale-[1.01] hover:ring-estate-gold/80 hover:shadow-[0_20px_60px_-20px_rgba(212,168,67,0.45)]'
              : 'ring-estate-gold/40'
          }`}
          style={{ aspectRatio: '3/4' }}
        >
          <Image
            src={imageUrl}
            alt={linked && linkedName ? linkedName : (isRtl ? 'اليجريا — سوديك' : 'Allegria — SODIC')}
            fill
            priority
            fetchPriority="high"
            className="h-full w-full object-cover"
            sizes="(max-width: 640px) 280px, 420px"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.parentElement!.classList.add('bg-gradient-to-br', 'from-estate-sand', 'to-estate-sand-dark')
            }}
          />
        </div>

        <div className="absolute -bottom-4 -left-2 rounded-2xl bg-estate-copper px-4 py-3 text-[#0F1A2C] shadow-xl sm:-left-4 sm:px-6 sm:py-5">
          {availableUnits !== null ? (
            <>
              <p className="text-2xl font-bold sm:text-3xl">
                {new Intl.NumberFormat(isRtl ? 'ar-EG' : 'en-US').format(availableUnits)}
              </p>
              <p className="text-sm">{isRtl ? 'وحدة متاحة' : 'Available units'}</p>
              <p className="text-xs font-medium">{isRtl ? 'بسعر مسجل' : 'with a recorded price'}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold">{isRtl ? 'كتالوج غاية' : 'GHAYA catalog'}</p>
              <p className="text-sm">{isRtl ? 'مشاريع عقارية في مصر' : 'Egyptian real estate'}</p>
            </>
          )}
        </div>

        <div className="absolute -bottom-6 right-0 max-w-[62%] rounded-full bg-white/90 px-4 py-2 text-center text-sm font-medium text-gray-700 shadow-md dark:border dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white sm:left-1/2 sm:right-auto sm:max-w-[92%] sm:-translate-x-1/2 sm:-bottom-8 sm:whitespace-nowrap">
          {caption}
        </div>
      </div>
    </div>
  )
}
