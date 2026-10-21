'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { ceoApi, Toast, type ToastState } from '../components/manager-ui'

/**
 * Feature-flag control room: every customer-facing feature the codebase ships
 * can be switched ON/OFF live from here (no deploy). Stored in SystemSetting
 * `feature_flags`; public pages read it through /api/feature-flags.
 */

interface FlagDef {
  key: string
  ar: string
  en: string
  descAr: string
}

/** Minimal pill toggle (no dedicated ui/switch in this codebase). */
function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-estate-gold' : 'bg-gray-300 dark:bg-[#262626]'
      } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function FeaturesPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [defs, setDefs] = useState<FlagDef[]>([])
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    ceoApi<{ flags: Record<string, boolean>; defs: FlagDef[] }>('/api/ceo/feature-flags')
      .then((d) => {
        setFlags(d.flags)
        setDefs(d.defs)
      })
      .catch((e) => setToast({ msg: e.message, tone: 'err' }))
  }, [])

  async function toggle(key: string, enabled: boolean) {
    setBusy(key)
    setFlags((f) => ({ ...f, [key]: enabled })) // optimistic
    try {
      const d = await ceoApi<{ flags: Record<string, boolean> }>('/api/ceo/feature-flags', 'PATCH', { key, enabled })
      setFlags(d.flags)
      setToast({ msg: enabled ? (ar ? 'تم تشغيل الميزة' : 'Feature ON') : (ar ? 'تم إيقاف الميزة' : 'Feature OFF'), tone: 'ok' })
    } catch (e) {
      setFlags((f) => ({ ...f, [key]: !enabled })) // revert
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <h1 className="mb-1 text-xl font-bold">{ar ? 'مفاتيح الميزات' : 'Feature switches'}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {ar
          ? 'كل ميزة بيواجهها العميل هنا — قفلها أو شغلها فورًا من غير كود ولا نشر. التغيير بيوصل للسايت خلال ~30 ثانية.'
          : 'Every customer-facing feature can be toggled live — changes reach the public site within ~30 seconds.'}
      </p>

      <div className="space-y-3">
        {defs.map((d) => (
          <Card key={d.key}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{ar ? d.ar : d.en}</p>
                <p className="text-xs text-muted-foreground">{d.descAr}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{d.key}</p>
              </div>
              <Toggle
                on={flags[d.key] === true}
                disabled={busy === d.key}
                onClick={() => toggle(d.key, flags[d.key] !== true)}
                label={d.en}
              />
            </CardContent>
          </Card>
        ))}
        {defs.length === 0 && (
          <p className="text-sm text-muted-foreground">{ar ? 'جاري التحميل…' : 'Loading…'}</p>
        )}
      </div>
    </main>
  )
}
