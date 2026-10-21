import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getFeatureFlags } from '@/lib/feature-flags'
import { SITE_URL, languageAlternates } from '@/lib/site'
import { Card, CardContent } from '@/components/ui/card'
import {
  ShieldCheck,
  FileSearch,
  Calculator,
  Handshake,
  KeyRound,
  Gavel,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'أمان شراء الوحدات على الخريطة في مصر | دليل غاية',
  description:
    'دليل عملية لشراء وحدة على الخريطة (off-plan) في مصر: إزاي تتأكد من المطور، اللي بيتحقق من العقد، المقدم والترميز، وما تتجاهله. Guide to buying off-plan safely in Egypt.',
  alternates: languageAlternates('/guides/buying-offplan'),
  openGraph: {
    title: 'أمان شراء الوحدات على الخريطة | GHAYA REAL ESTATE',
    description: 'دليل عملية يحميك عند شراء وحدة على الخريطة في مصر.',
    url: `${SITE_URL}/guides/buying-offplan`,
  },
}

const STEPS = [
  {
    icon: FileSearch,
    title: '1) اتأكد من المطور والمشروع نفسه',
    body:
      'اسأل عن الترخيص وسجل الشركة + اسم الأرض ورمز اللاند. أي مطور محترم بيدّيك المستندات بلا عناد. على غاية كل مشروع معروض ببيانات حقيقية مشتركة من المطور، وصفحة المشهور فيها المصدر والتحقق لكل سعر.',
  },
  {
    icon: Calculator,
    title: '2) هات الأرقام كاملة قبل ما توقّع',
    body:
      'المقدم والقسط الشهري وعدد السنين بس مش بقاء — اسأل كمان: رسوم الصيانة، رسوم الترميز/الاشتراك، مصاريف التشطيب، وارتفاع سنوي متوقع للأسعار في التعاقدات الجديدة. اعمل ملف مقارنة بسيط بين 2-3 مشاريع قبل ما تحسم.',
  },
  {
    icon: Handshake,
    title: '3) اقرأ العقد سطر بسطر — خصوصًا التأخير',
    body:
      'أهم بندين: تاريخ التسليم والتأخير (غرامة طلوع أو خفض قسط)، وشروط إلغاء العقد. اطلب الصياغة المكتوبة لأي وعد شفهي (المطابقة، الـview، التشطيب). لو مفيش غرامة واضحة مدرجًا في العقد — ساعتها التزامهم بيتعرض للشك.',
  },
  {
    icon: ShieldCheck,
    title: '4) دفع آمن — من غير كاش أيدي',
    body:
      'ادفع بحساب الشركة الرسمي فقط (متحول لحساب شخصي مهما كانت الملف) واحتفظ بإيصال لكل قسط. المقدم الكبير غالبًا في التعاقدات المصرية بين 10-20% — مقدماً أعلى من السوق بكتير يقفل بقى التنازل عن مزايا معينة، اسأل عنها.',
  },
  {
    icon: KeyRound,
    title: '5) معاينة التسليم قبل ما تنهي',
    body:
      'فحص عقار أو لحسابك: تسربات، التشطيبات المنصوص عليها في العقد، الـview فعلاً زي ما اتفقوا. المسائل البسيطة تُدوَّن في «قائمة الملاحظات» يجيبها المطروح قبل استلام المفاتيح.',
  },
  {
    icon: Gavel,
    title: '6) عرف حقوقك»',
    body:
      'في مصر، الحقوق محفوظة قانونيًا: مخالفة المطابقة = غرامة/خفض قسط، وإذا التسليم تأخر بدون سبب قانوني في العقد اكان حقك حل المنازعة عبر لجان الفصل في منازعات التمكين أو البوابة القضائية. استشر محامي عقارات لتوقيع العقد لو الأرقام كبيرة.',
  },
]

export default async function BuyingGuidePage() {
  const flags = await getFeatureFlags()
  if (!flags.buying_guide) notFound()

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">أمان شراء الوحدات على الخريطة في مصر</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        دليل عظيمة من غاية — خطوة بخطوة تحمي فلوسك وحقوقك وقت شراء وحدة on-map (على الخريطة) من مطور.
        مش استشارة قانونية: دي تجربة السوق مترجمة خطوات واضحة.
      </p>

      <div className="mt-6 space-y-4">
        {STEPS.map((s) => (
          <Card key={s.title}>
            <CardContent className="flex gap-4 p-5">
              <s.icon className="mt-0.5 h-6 w-6 shrink-0 text-estate-gold" />
              <div>
                <h2 className="font-bold">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        جاهز تشوف خياراتك؟{' '}
        <Link href="/projects" className="text-estate-gold hover:underline">
          تصفح المشاريع
        </Link>{' '}
        أو{' '}
        <Link href="/ai-tools/chat" className="text-estate-gold hover:underline">
          اسأل عين
        </Link>{' '}
        عن أي مشروع في دقيقة.
      </p>
    </div>
  )
}
