'use client'

import { useState, useEffect, useCallback } from 'react'
import { Heart, Trash2, Bell, BellOff, Eye, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

interface Favorite {
  id: string
  createdAt: string
  unit: {
    id: string
    name: string
    slug: string | null
    unitType: string
    price: number
    area: number
    bedrooms: number | null
    bathrooms: number | null
    project: { name: string; slug: string }
  } | null
}

interface WatchRow {
  id: string
  targetType: 'UNIT' | 'PROJECT'
  targetId: string
  name: string
  link: string | null
  exists: boolean
  alertsEnabled: boolean
  lastNotifiedAt: string | null
  snapshot: Record<string, unknown>
  createdAt: string
}

const STATUS_LABEL_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  COMING_SOON: 'قريب',
  DELIVERED: 'اتسلّم',
  SOLD_OUT: 'خلص',
  RESERVED: 'محجوز',
  SOLD: 'متباع',
  RENTED: 'متأجر',
}

function fmtEGP(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n)
}

export default function DashboardFavoritesPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

  // ── F7: watchlist state ──
  const [watches, setWatches] = useState<WatchRow[]>([])
  const [watchLoading, setWatchLoading] = useState(true)
  const [watchError, setWatchError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((data) => { setFavorites(data.favorites || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadWatches = useCallback(() => {
    fetch('/api/watch')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load watchlist'))))
      .then((d) => { setWatches(d.watches || []); setWatchLoading(false) })
      .catch((e) => {
        console.error('Watchlist load failed:', e)
        setWatchError(ar ? 'معرفناش نجيب قايمة المتابعة — جرب تاني.' : 'Could not load the watchlist — try again.')
        setWatchLoading(false)
      })
  }, [ar])

  useEffect(() => { loadWatches() }, [loadWatches])

  const removeFavorite = async (id: string) => {
    await fetch(`/api/favorites?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    setFavorites((prev) => prev.filter((f) => f.id !== id))
  }

  const removeWatch = async (id: string) => {
    await fetch('/api/watch', {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setWatches((prev) => prev.filter((w) => w.id !== id))
  }

  const toggleAlerts = async (w: WatchRow) => {
    setWatches((prev) => prev.map((x) => (x.id === w.id ? { ...x, alertsEnabled: !x.alertsEnabled } : x)))
    const res = await fetch('/api/watch', {
      method: 'PATCH',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, alertsEnabled: !w.alertsEnabled }),
    })
    if (!res.ok) setWatches((prev) => prev.map((x) => (x.id === w.id ? { ...x, alertsEnabled: w.alertsEnabled } : x)))
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'قايمتك الخاصة' : 'Your shortlist'}
          title={ar ? 'المفضلة' : 'Favorites'}
          description={ar ? 'العقارات اللي حفظتها والحاجات اللي متابعها' : 'Your saved properties and watched items'}
        />
      </Reveal>

      <Tabs defaultValue="favorites">
        <TabsList>
          <TabsTrigger value="favorites">{ar ? `المفضلة (${favorites.length})` : `Favorites (${favorites.length})`}</TabsTrigger>
          <TabsTrigger value="watching">{ar ? `المتابَعة (${watches.length})` : `Watching (${watches.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="favorites">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground">{ar ? 'بيحمّل...' : 'Loading...'}</div>
          ) : favorites.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Heart className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <h3 className="mt-4 text-lg font-semibold">{ar ? 'لسه مفيش مفضلة' : 'No Favorites Yet'}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {ar ? 'ابدأ اتفرج على العقارات واحفظ اللي يعجبك.' : 'Start browsing properties and save the ones you like.'}
                </p>
                <Button asChild className="mt-4 bg-estate-gold hover:bg-estate-gold-dark">
                  <Link href="/projects">{ar ? 'اتفرج على المشاريع' : 'Browse Projects'}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {favorites.map((fav) => fav.unit && (
                <Card key={fav.id} className="card-hover border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href={`/units/${fav.unit.slug || fav.unit.id}`} className="font-semibold hover:text-estate-gold">
                          {fav.unit.project.name} - {fav.unit.name}
                        </Link>
                        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{fav.unit.unitType}</span>
                          <span>{fav.unit.area} {ar ? 'متر' : 'sqm'}</span>
                          {fav.unit.bedrooms != null && <span>{fav.unit.bedrooms} {ar ? 'أوض' : 'bed'}</span>}
                          <span className="font-medium text-estate-gold">{fmtEGP(fav.unit.price)}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeFavorite(fav.id)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="watching">
          {watchLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنحمّل قايمة المتابعة...' : 'Loading watchlist…'}
            </div>
          ) : watchError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-red-600">{watchError}</CardContent>
            </Card>
          ) : watches.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Eye className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <h3 className="mt-4 text-lg font-semibold">{ar ? 'لسه متابعتش حاجة' : 'Nothing Watched Yet'}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {ar
                    ? 'دوس "تابع تغيرات السعر" على أي مشروع أو وحدة عشان تجيلك تنبيهات لما السعر المتأكد منه أو التوافر يتغيروا فعلاً.'
                    : 'Tap \u201cWatch for price changes\u201d on any project or unit to get alerts when its verified price or availability actually changes.'}
                </p>
                <Button asChild className="mt-4 bg-estate-gold hover:bg-estate-gold-dark">
                  <Link href="/projects">{ar ? 'اتفرج على المشاريع' : 'Browse Projects'}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {watches.map((w) => {
                const price = typeof w.snapshot?.price === 'number' ? w.snapshot.price : null
                const status = typeof w.snapshot?.status === 'string' ? w.snapshot.status : null
                return (
                  <Card key={w.id} className="card-hover border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          {w.link && w.exists ? (
                            <Link href={w.link} className="font-semibold hover:text-estate-gold">{w.name}</Link>
                          ) : (
                            <span className="font-semibold text-muted-foreground">{w.name}</span>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                              {w.targetType === 'UNIT' ? (ar ? 'وحدة' : 'Unit') : (ar ? 'مشروع' : 'Project')}
                            </span>
                            {price !== null && <span className="font-medium text-estate-gold">{fmtEGP(price)}</span>}
                            {status && <span>{ar ? `الحالة: ${STATUS_LABEL_AR[status] || status.replace(/_/g, ' ').toLowerCase()}` : `Status: ${status.replace(/_/g, ' ').toLowerCase()}`}</span>}
                            {w.lastNotifiedAt && (
                              <span>{ar ? `آخر تنبيه: ${new Date(w.lastNotifiedAt).toLocaleDateString('en-GB')}` : `Last alert: ${new Date(w.lastNotifiedAt).toLocaleDateString('en-GB')}`}</span>
                            )}
                            {!w.exists && <span className="text-amber-600">{ar ? 'مبقاش معروض' : 'No longer listed'}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={w.alertsEnabled ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggleAlerts(w)}
                            title={w.alertsEnabled ? (ar ? 'التنبيهات شغالة — دوس عشان تكتمها' : 'Alerts on — click to mute') : (ar ? 'مكتومة — دوس عشان تشغّل التنبيهات' : 'Muted — click to enable alerts')}
                          >
                            {w.alertsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                            {w.alertsEnabled ? (ar ? 'التنبيهات شغالة' : 'Alerts on') : (ar ? 'مكتومة' : 'Muted')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeWatch(w.id)}
                            className="text-red-500 hover:text-red-600"
                            aria-label={ar ? 'شيل من قايمة المتابعة' : 'Remove from watchlist'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
