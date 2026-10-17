'use client'

import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { RefreshCw, TriangleAlert } from 'lucide-react'

// Client-side error boundary for the AI Command Center: if the page
// component throws while rendering in the browser, show something useful
// (and reloadable) instead of a blank screen.
export default function CEOAIError({ error, reset }: { error: Error; reset: () => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
        <TriangleAlert className="h-7 w-7 text-red-400" />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-xl text-foreground">
          {ar ? 'حصل خطأ في الصفحة دي' : 'This page hit an error'}
        </h2>
        <p className="max-w-md text-sm text-gray-400">
          {ar
            ? 'جرّب تعمل تحديث للصفحة (Cmd/Ctrl + Shift + R). لو رجعت تاني كلمني.'
            : 'Try a hard refresh (Cmd/Ctrl + Shift + R). If it keeps happening, let us know.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()} className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]">
          <RefreshCw className="mr-2 h-4 w-4" />
          {ar ? 'جرّب تاني' : 'Try again'}
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {ar ? 'حدّث الصفحة' : 'Reload page'}
        </Button>
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <p className="max-w-lg break-words font-mono text-xs text-gray-600">{error.message}</p>
      )}
    </div>
  )
}
