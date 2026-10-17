'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'
import { AppAccountPanel } from '@/components/app-account-panel'
import { useAppType } from '@/lib/use-app-type'

/**
 * Heart button wired to /api/favorites (units). Console/`all` guests are
 * sent to login; on the PUBLIC host (zero login) guests get the app-forward
 * panel instead — never a dead link to the removed login page.
 */
export function FavoriteButton({ unitId }: { unitId: string }) {
  const { status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const isPublic = useAppType() === 'public'
  const [fav, setFav] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAppNote, setShowAppNote] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    let alive = true
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((d) => {
        if (alive && Array.isArray(d.favorites)) {
          setFav(d.favorites.some((f: any) => f.unitId === unitId))
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [status, unitId])

  const onClick = async () => {
    if (status === 'unauthenticated') {
      if (isPublic) {
        setShowAppNote(true)
        return
      }
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
      return
    }
    if (status !== 'authenticated' || busy) return
    setBusy(true)
    setError(null)
    try {
      if (fav) {
        const r = await fetch(`/api/favorites?unitId=${unitId}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        if (r.ok) {
          setFav(false)
        } else {
          const d = await r.json().catch(() => ({}))
          console.error('Favorite remove failed:', d.error)
          setError(ar ? 'معرفناش نشيلها من المفضلة — جرب تاني.' : 'Could not remove from favorites — try again.')
        }
      } else {
        const r = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitId }),
        })
        if (r.ok) {
          setFav(true)
        } else {
          const d = await r.json().catch(() => ({}))
          console.error('Favorite save failed:', d.error)
          setError(ar ? 'معرفناش نحفظها في المفضلة — جرب تاني.' : 'Could not save to favorites — try again.')
        }
      }
    } catch (e) {
      console.error('Favorite request failed:', e)
      setError(ar ? 'مش قادرين نوصل للسيرفر — اتأكد من النت وجرب تاني.' : 'Could not reach the server — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Button
      type="button"
      variant="outline"
      className="mb-3 min-h-[44px] w-full md:min-h-0"
      onClick={onClick}
      disabled={busy || status === 'loading'}
    >
      <Heart className={fav ? 'me-2 h-4 w-4 fill-estate-gold text-estate-gold' : 'me-2 h-4 w-4'} />
      {fav ? (ar ? 'في المفضلة' : 'Saved to favorites') : (ar ? 'ضيف للمفضلة' : 'Add to favorites')}
    </Button>
    {error && <p className="mb-3 -mt-1 text-center text-xs text-red-500">{error}</p>}
    {showAppNote && isPublic && <div className="mb-3 -mt-1"><AppAccountPanel compact /></div>}
    </>
  )
}
