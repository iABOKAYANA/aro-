import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { db } from '@/lib/db'
import { getFeatureFlags } from '@/lib/feature-flags'
import { formatEGP } from '@/lib/utils'
import { SITE_URL } from '@/lib/site'
import { absoluteImage } from '@/lib/seo'
import { isPublicProject } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'بطاقة الوحدة | GHAYA REAL ESTATE' },
  robots: { index: false },
}

const dtf = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' })

/**
 * One-pager for the unit — clean print layout the customer can save as PDF
 * (browser → Print → Save as PDF) or share with family. Data comes verbatim
 * from the catalog: type, area, starting price and the real payment terms.
 * Never invents content — fields the catalog lacks are simply omitted.
 */
export default async function UnitCardPage({ params }: { params: { slug: string } }) {
  const flags = await getFeatureFlags()
  if (!flags.unit_card_pdf) notFound()

  const CUID_RE = /^c[a-z0-9]{24}$/
  const unit = await db.unit.findUnique({
    where: CUID_RE.test(params.slug) ? { id: params.slug } : { slug: params.slug },
    include: {
      project: {
        select: {
          name: true,
          nameArabic: true,
          slug: true,
          coverImage: true,
          isActive: true,
          approvalStatus: true,
          parentProjectId: true,
          developer: { select: { companyName: true } },
          city: { select: { name: true, nameArabic: true } },
          paymentPlans: { select: { nameArabic: true, name: true, description: true, downPaymentPct: true, installmentYears: true } },
        },
      },
      phase: { select: { name: true } },
    },
  })
  if (
    !unit ||
    unit.isSample ||
    !['AVAILABLE', 'Vacant'].includes(unit.status) ||
    !isPublicProject({ ...unit.project, units: [{ price: unit.price }] })
  ) notFound()

  const p = unit.project
  const rows = [
    { label: 'النوع', value: unit.unitType },
    unit.area > 0 && { label: 'المساحة', value: `${unit.area} م²` },
    unit.price > 0 && { label: 'يبدأ من', value: formatEGP(unit.price) },
    unit.downPayment != null && { label: 'المقدم', value: formatEGP(unit.downPayment) },
    unit.monthlyInstallment != null && { label: 'القسط الشهري', value: formatEGP(unit.monthlyInstallment) },
    unit.installmentYears != null && { label: 'مدة السداد', value: `${unit.installmentYears} سنة` },
    unit.bedrooms != null && { label: 'الغرف', value: String(unit.bedrooms) },
    unit.bathrooms != null && { label: 'الحمامات', value: String(unit.bathrooms) },
    unit.finishingType && { label: 'التشطيب', value: unit.finishingType },
    unit.phase?.name && { label: 'المرحلة', value: unit.phase.name },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div dir="rtl" className="mx-auto max-w-2xl bg-white p-8 text-black print:py-0" style={{ minHeight: '80vh' }}>
      {/* Print / save hint — hidden when printing */}
      <div className="mb-6 rounded-xl bg-neutral-100 p-3 text-center text-sm text-neutral-600 print:hidden" lang="ar">
        اضغط <b>طباعة</b> (Ctrl/Cmd + P) واختار «حفظ كـ PDF» لتحميل البطاقة.
      </div>

      <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.25em] text-neutral-500">GHAYA REAL ESTATE</p>
          <h1 className="mt-1 text-2xl font-black">{p.nameArabic || p.name}</h1>
          <p className="text-sm text-neutral-600">
            {unit.name}
            {unit.phase?.name ? ` — ${unit.phase.name}` : ''}
            {p.city ? ` · ${p.city.nameArabic || p.city.name}` : ''}
          </p>
          {p.developer?.companyName && (
            <p className="mt-0.5 text-xs text-neutral-500">المطور: {p.developer.companyName}</p>
          )}
        </div>
        {p.coverImage && (
          <Image
            src={absoluteImage(p.coverImage) || p.coverImage}
            alt={p.name}
            width={140}
            height={100}
            className="h-24 w-36 rounded-lg border border-neutral-200 object-cover"
            unoptimized
          />
        )}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-neutral-200 p-3">
            <p className="text-[11px] text-neutral-500">{r.label}</p>
            <p className="mt-0.5 text-lg font-bold">{r.value}</p>
          </div>
        ))}
      </section>

      {p.paymentPlans.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-500">أنظمة السداد</h2>
          <ul className="space-y-1.5">
            {p.paymentPlans.slice(0, 4).map((pl, i) => (
              <li key={i} className="rounded-lg bg-neutral-50 p-2.5 text-sm">
                {pl.description || pl.nameArabic || pl.name}
                {pl.installmentYears ? ` — على ${pl.installmentYears} سنة` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500">
        <p>
          {SITE_URL}/units/{unit.slug || unit.id} — تاريخ الإصدار: {dtf.format(new Date())}
        </p>
        <p className="mt-1">الأسعار والمواصفات كما هي في كتالوج غاية — اطلب تأكيد التوفر قبل الحجز.</p>
      </footer>
    </div>
  )
}
