import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getFeatureFlags } from '@/lib/feature-flags'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

// Flag OFF → real 404 (generateMetadata runs before the stream starts).
export async function generateMetadata(): Promise<Metadata> {
  const flags = await getFeatureFlags()
  if (!flags.inquiry_tracking) notFound()
  return metadata_
}

const metadata_: Metadata = {
  title: { absolute: 'تتبع استفسارك | GHAYA REAL ESTATE' },
  robots: { index: false },
}

const STATUS_META: Record<string, { ar: string; en: string; tone: string }> = {
  NEW: { ar: 'استفسارك وصل ✓ — فريقنا هيكلمك قريب', en: 'Received ✓ — our team will contact you shortly', tone: 'bg-blue-500/10 text-blue-400' },
  IN_PROGRESS: { ar: 'جاري التواصل معاك', en: 'In progress — we are contacting you', tone: 'bg-amber-500/10 text-amber-400' },
  CONTACTED: { ar: 'تم التواصل معاك', en: 'We contacted you', tone: 'bg-amber-500/10 text-amber-400' },
  SCHEDULED: { ar: 'تم تحديد موعد معاينة', en: 'A viewing is scheduled', tone: 'bg-purple-500/10 text-purple-400' },
  RESOLVED: { ar: 'تم إنهاء استفسارك', en: 'Resolved', tone: 'bg-green-500/10 text-green-400' },
  CLOSED: { ar: 'تم إنهاء استفسارك', en: 'Closed', tone: 'bg-green-500/10 text-green-400' },
}

const dtf = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long', timeStyle: 'short' })

export default async function TrackPage({ params }: { params: { token: string } }) {
  const flags = await getFeatureFlags()
  if (!flags.inquiry_tracking) notFound()

  const inquiry = await db.inquiry.findUnique({
    where: { trackToken: params.token },
    select: { name: true, type: true, status: true, createdAt: true, contactedAt: true, resolvedAt: true, responses: { orderBy: { createdAt: 'asc' }, select: { message: true, createdAt: true } } },
  })

  return (
    <div className="mx-auto max-w-xl px-4 py-12" lang="ar" dir="rtl">
      <h1 className="mb-1 text-2xl font-bold">تتبع استفسارك</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {inquiry ? 'آخر حالة لاستفسارك — احتفظ باللينك ده للمتابعة.' : 'اللينك ده مش صحيح أو الاستفسار اتشال.'}
      </p>

      {inquiry && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">الاسم</span>
              <span className="font-medium">{inquiry.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">النوع</span>
              <span className="font-medium">{inquiry.type === 'VISIT_REQUEST' ? 'طلب معاينة' : 'استفسار عام'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">التاريخ</span>
              <span className="font-medium">{dtf.format(inquiry.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">الحالة</span>
              <Badge className={STATUS_META[inquiry.status]?.tone || 'bg-gray-500/10 text-gray-400'}>
                {STATUS_META[inquiry.status]?.ar || inquiry.status}
              </Badge>
            </div>

            {inquiry.responses.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">ردود فريقنا</p>
                <ul className="space-y-2">
                  {inquiry.responses.map((r) => (
                    <li key={r.createdAt.toISOString()} className="rounded-xl bg-muted/40 p-3 text-sm">
                      {r.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Link href="/projects" className="mt-6 inline-block text-sm text-estate-gold hover:underline">
        تصفح المشاريع ←
      </Link>
    </div>
  )
}
