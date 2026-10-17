/**
 * Shared FAQ content (AR + EN) — single source of truth.
 *
 * Imported by BOTH the server page (`page.tsx`, for the SEO `FAQPage`
 * JSON-LD) and the client accordion (`faq-view.tsx`, for rendering), so the
 * rich result and the visible page can never drift apart.
 *
 * HONESTY RULE: every answer below is grounded in a real repo source —
 * see the `source` field per item. No phone numbers, prices, or addresses
 * (contact answers point to `/contact` + the floating buttons only).
 */

export interface FaqItem {
  qAr: string
  qEn: string
  aAr: string
  aEn: string
  /** Repo source this answer was verified against. */
  source: string
}

export interface FaqGroup {
  titleAr: string
  titleEn: string
  items: FaqItem[]
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    titleAr: 'الحجز والمعاينة',
    titleEn: 'Booking & viewings',
    items: [
      {
        qAr: 'إزاي أحجز معاينة؟',
        qEn: 'How do I book a viewing?',
        aAr: 'من صفحة المشروع دوس «احجز معاينة»، اختار النوع (زيارة على الطبيعة أو اجتماع أونلاين)، وبعدين اليوم والوقت المناسب ليك، واكتب اسمك ورقم تليفونك وأكّد الحجز — وهتلاقي صفحة تأكيد فيها زرار واتساب لمتابعة المعاد.',
        aEn: 'From the project page, click "Book a viewing", pick the type (in-person visit or online meeting), then the day and time slot that suits you, enter your name and phone number and confirm — you get a confirmation screen with a WhatsApp follow-up button.',
        source: 'src/components/viewings/booking-modal.tsx',
      },
      {
        qAr: 'لازم أعمل حساب عشان أحجز؟',
        qEn: 'Do I need an account to book?',
        aAr: 'لأ، حجز المعاينة من غير ما تسجل دخول — كل اللي محتاجه الاسم ورقم التليفون. ولو مسجل دخول، الاسم والتليفون بيتمِلوا تلقائيًا من حسابك.',
        aEn: 'No — booking a viewing needs no sign-in, just your name and phone number. If you are signed in, your name and phone are prefilled from your account.',
        source: 'src/components/viewings/booking-modal.tsx (no login; prefill effect)',
      },
      {
        qAr: 'إزاي أغيّر أو أتابع معاد المعاينة؟',
        qEn: 'How do I change or follow up on my viewing?',
        aAr: 'من زرار الواتساب في صفحة التأكيد بعد الحجز، أو ابعتلنا من /contact. ولو مسجل دخول بحسابك تقدر تتابع مواعيدك من /dashboard/viewings.',
        aEn: 'Use the WhatsApp button on the confirmation screen after booking, or message us from /contact. If you are signed in, you can track your appointments at /dashboard/viewings.',
        source: 'src/components/viewings/booking-modal.tsx (success copy)',
      },
    ],
  },
  {
    titleAr: 'الأسعار والدفع',
    titleEn: 'Prices & payment',
    items: [
      {
        qAr: 'الأسعار اللي على الموقع نهائية؟',
        qEn: 'Are the prices on the site final?',
        aAr: 'كل مشروع بيعرض سعر بداية (يبدأ من…)، والأسعار بتتغير — راجع صفحة المشروع نفسها عشان تشوف التفاصيل والأرقام المحدّثة قبل أي قرار.',
        aEn: 'Each project shows a starting price ("from…"), and prices change — always check the project page itself for current details and numbers before deciding.',
        source: 'src/lib/ai-site-knowledge.ts CHEAPEST answer convention + project pages',
      },
      {
        qAr: 'يعني إيه رادار العروض؟',
        qEn: 'What is the Offers Radar?',
        aAr: 'صفحة /offers بتجمع خصومات الكاش الشغالة في مكان واحد: المشروع وخطة السداد ونسبة الخصم والسعر قبل وبعد الخصم والمبلغ اللي هتوفره. ولو المطورين منزلوش خصومات هتلاقي رسالة بكده.',
        aEn: 'The /offers page collects live cash discounts in one place: the project, payment plan, discount rate, price before and after the discount, and what you save. If developers have no discounts, the page says so.',
        source: 'src/app/(public)/offers/offers-view.tsx',
      },
      {
        qAr: 'عندكم حاسبات للقسط والتمويل؟',
        qEn: 'Do you have installment and mortgage calculators?',
        aAr: 'أيوه، في /ai-tools: حاسبة التمويل والأقساط، وحاسبة الاستثمار، و«أقدر أشتري إيه؟»، و«أأجر ولا أشتري؟»، ومقيّم سعر العقار، والبحث بالذكاء الاصطناعي. تحليل السوق ودليل المناطق لسه قريبًا.',
        aEn: 'Yes, under /ai-tools: Mortgage Calculator, Investment Calculator, Affordability ("What can I buy?"), Rent-or-Buy, Price Estimator, and AI Search. Market Analysis and the Neighborhood Guide are coming soon.',
        source: 'src/lib/ai-site-knowledge.ts CALCULATORS (mirrors ai-tools-view.tsx)',
      },
    ],
  },
  {
    titleAr: 'المناطق والمشاريع',
    titleEn: 'Areas & projects',
    items: [
      {
        qAr: 'بتشتغلوا في أنهي مناطق؟',
        qEn: 'Which areas do you cover?',
        aAr: 'اتصفح المدن والمناطق من /locations، وتفاصيل خدمات كل منطقة من /areas — أو اسأل المساعد عين عن المنطقة اللي في بالك وهو يجيبلك المشاريع اللي فيها.',
        aEn: 'Browse cities and regions at /locations, and per-area services at /areas — or ask Ayn about the area you have in mind and it will pull its projects.',
        source: 'src/lib/ai-site-knowledge.ts PLATFORM locations line; WHERE_AREAS answer',
      },
      {
        qAr: 'إزاي أقارن بين المشاريع؟',
        qEn: 'How do I compare projects?',
        aAr: 'من /compare تحط لحد 4 مشاريع جنب بعض — السعر وخطط السداد والمساحات والاستلام والمطور — وتقدر تشيّر المقارنة بلينك. والجولات الافتراضية موجودة جوّه صفحة المشروع نفسه.',
        aEn: 'At /compare you can put up to 4 projects side by side — price, payment plans, areas, delivery and developer — and share the comparison via link. Virtual tours live inside the project page itself.',
        source: 'src/app/(public)/compare/page.tsx + src/lib/ai-site-knowledge.ts PLATFORM compare/tour lines',
      },
    ],
  },
  {
    titleAr: 'الحسابات',
    titleEn: 'Accounts',
    items: [
      {
        qAr: 'محتاج حساب عشان أستخدم الموقع؟',
        qEn: 'Do I need an account to use the site?',
        aAr: 'لأ — التصفح والبحث وحجز المعاينة وحفظ المشاريع على جهازك كلها من غير حساب. التسجيل بلينك دعوة من /auth/register، والدخول بحساب موجود من /auth/login.',
        aEn: 'No — browsing, searching, booking a viewing and saving projects on your device all work without an account. Registration is invite-link based at /auth/register, and sign-in is at /auth/login.',
        source: 'src/app/auth/register/page.tsx (token gate) + saved-projects localStorage',
      },
      {
        qAr: 'المشاريع المحفوظة بتروح فين؟',
        qEn: 'Where do my saved projects go?',
        aAr: 'في صفحة /saved على نفس الجهاز والمتصفح — دوس «Save» على أي مشروع وهيظهر هناك عشان توصله بسرعة.',
        aEn: 'On the /saved page, on the same device and browser — hit "Save" on any project and it shows up there for quick access.',
        source: 'src/app/(public)/saved/saved-client.tsx + src/lib/saved-projects.ts (localStorage)',
      },
    ],
  },
  {
    titleAr: 'المساعد عين',
    titleEn: 'Ayn assistant',
    items: [
      {
        qAr: 'مين عين (Ayn)؟',
        qEn: 'Who is Ayn?',
        aAr: 'عين هو مساعد غاية العقارية الذكي في /ai-tools/chat: يدورلك على مشروع أو شقة بالمواصفات اللي عايزها (المكان والميزانية وعدد الأوض)، يقارن بين مشاريع، يوجهك للحاسبة الصح، أو يشرحلك إزاي تحجز معاينة.',
        aEn: 'Ayn is the GHAYA smart assistant at /ai-tools/chat: it searches projects by your specs (area, budget, bedrooms), compares projects, points you to the right calculator, or explains how to book a viewing.',
        source: 'src/lib/ai-site-knowledge.ts GREETING answer + /ai-tools/chat route',
      },
      {
        qAr: 'هل ترشيحات عين تعتبر استشارة مالية؟',
        qEn: 'Are Ayn recommendations financial advice?',
        aAr: 'لأ — ترشيحات الذكاء الاصطناعي وتقديرات الأسعار ورؤى السوق معلوماتية فقط، ومش استشارة مالية أو قانونية.',
        aEn: 'No — AI recommendations, price estimates and market insights are informational only, not financial or legal advice.',
        source: 'src/app/(public)/terms/terms-view.tsx §3 AI-Powered Recommendations',
      },
    ],
  },
  {
    titleAr: 'التواصل',
    titleEn: 'Contact',
    items: [
      {
        qAr: 'إزاي أتواصل مع فريق غاية؟',
        qEn: 'How do I reach the GHAYA team?',
        aAr: 'ابعت رسالة من /contact (الاسم والتليفون بس) وهنرد عليك خلال 24 ساعة — أو استخدم زراير الواتساب والاتصال العايمة اللي ظاهرة على كل صفحات الموقع.',
        aEn: 'Send a message from /contact (name + phone only) and we reply within 24 hours — or use the floating WhatsApp and call buttons shown on every site page.',
        source: 'src/app/(public)/contact/page.tsx + floating-contact-cta.tsx',
      },
      {
        qAr: 'أنا وسيط أو مطوّر — أبدأ منين؟',
        qEn: 'I am a broker or developer — where do I start?',
        aAr: 'لو وسيط ادخل على /broker، ولو مطوّر ابعت مشروعك من /developer/submit. ولو بتدور على شغل عندنا شوف الوظايف المفتوحة في /careers.',
        aEn: 'Brokers head to /broker, developers submit a project at /developer/submit. Job seekers: see open roles at /careers.',
        source: 'src/lib/ai-site-knowledge.ts PLATFORM broker/developer lines; /careers route',
      },
    ],
  },
]

export const FAQ_COUNT = FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0)
