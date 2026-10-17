import { defineMessages } from '../define';

/**
 * Owned by src/app/onboarding.tsx and src/app/help.tsx.
 *
 * Plain Egyptian-colloquial copy for the first-run intro and the permanent
 * Help screen. No backend fields, no feature flags — just words.
 */

/** Storage flag: `'1'` once the intro has been seen (or skipped). */
export const GUIDE_SEEN_KEY = 'ghaya.guideSeen';

export const guide = defineMessages({
  'guide.helpTitle': ['Help', 'مساعدة'],
  'guide.skip': ['Skip', 'تخطي'],
  'guide.next': ['Next', 'التالي'],
  'guide.start': ['Start', 'ابدأ'],

  // ── Onboarding steps ──────────────────────────────────────────────────
  'guide.step1Title': ['Welcome to GHAYA', 'أهلاً بيك في غيّا'],
  'guide.step1Body': [
    'Browse projects and prices with no account. Sign in later only if you want your saves on every device.',
    'اتفرج على المشاريع والأسعار من غير حساب. ابقى سجّل بعدين لو عايز حاجتك المحفوظة على كل أجهزتك.',
  ],
  'guide.step2Title': ['Explore & compare', 'استكشف وقارن'],
  'guide.step2Body': [
    'Look through projects and units, then put the ones you like side by side to compare prices, areas and developers.',
    'قلّب في المشاريع والوحدات، وحط اللي يعجبك جنب بعضه عشان تقارن الأسعار والمساحات والمطورين.',
  ],
  'guide.step3Title': ['Ask Ayn & save', 'اسأل عين واحفظ اللي يعجبك'],
  'guide.step3Body': [
    'Ayn answers your real-estate questions in Arabic or English, and the save button keeps favourites one tap away.',
    'عين بيجاوب على أسئلتك العقارية بالعربي أو الإنجليزي، وزرار الحفظ بيخلي اللي يعجبك على بُعد دوسة.',
  ],
  'guide.step4Title': ['Language & currency', 'اللغة والعملة'],
  'guide.step4Body': [
    'From Tools you can switch between Arabic and English and pick the currency prices show in.',
    'من الأدوات تقدر تبدّل بين العربي والإنجليزي وتختار العملة اللي الأسعار تظهر بيها.',
  ],

  // ── Help screen ───────────────────────────────────────────────────────
  'guide.helpSubtitle': [
    'A quick tour of every corner of the app.',
    'جولة سريعة في كل حتة في التطبيق.',
  ],
  'guide.tabsTitle': ['The four tabs', 'الأربع تبويبات'],
  'guide.tabsBody': [
    'Home has featured and new projects. Explore is search and filters. Saved keeps your favourites and saved searches. Tools holds the calculators, Ayn and settings.',
    'الرئيسية فيها المميز والجديد. استكشف للبحث والفلاتر. المحفوظات فيها اللي حفظته وبحثاتك. أدوات فيها الحاسبات وعين والإعدادات.',
  ],
  'guide.searchTitle': ['Search & filters', 'البحث والفلاتر'],
  'guide.searchBody': [
    'Search by word or area, narrow with filters like price and bedrooms, and save a search to get alerted when something matching appears.',
    'دوّر بالكلمة أو المنطقة، وضيّق بالفلاتر زي السعر والغرف، واحفظ البحث عشان يوصلك تنبيه لما ينزل حاجة شبهه.',
  ],
  'guide.compareTitle': ['Compare', 'المقارنة'],
  'guide.compareBody': [
    'Pick two or more projects and hit compare to see prices, areas and developers side by side.',
    'اختار مشروعين أو أكتر ودوس قارن، هتشوف الأسعار والمساحات والمطورين جنب بعض.',
  ],
  'guide.calcTitle': ['Calculators', 'الحاسبات'],
  'guide.calcBody': [
    'Mortgage tells you the monthly instalment, investment tells you the return, and the price estimator gives a fair range for a unit.',
    'حاسبة التمويل بتقولك القسط الشهري، والاستثمار بيقولك العائد، ومقدّر السعر بيديك رينج عادل للوحدة.',
  ],
  'guide.aynTitle': ['What Ayn understands', 'عين بيفهم إيه'],
  'guide.aynBody': [
    'Ask about areas, prices, payment plans or advice, in Arabic or English — try "I want a 3-bedroom in New Cairo within this budget".',
    'اسأله عن المناطق والأسعار وخطط السداد أو نصيحة، بالعربي أو الإنجليزي — جرّب "عايز شقة ٣ غرف في التجمع بالميزانية دي".',
  ],
  'guide.accountTitle': ['Account & sign-in', 'الحساب وتسجيل الدخول'],
  'guide.accountBody': [
    'The account is optional — browsing is open. Sign in to sync saves across devices, book viewings and follow your requests.',
    'الحساب اختياري — التصفح مفتوح من غيره. سجّل عشان تحفظ حاجتك على كل الأجهزة وتحجز معاينات وتتابع طلباتك.',
  ],
  'guide.langTitle': ['Language & currency', 'اللغة والعملة'],
  'guide.langBody': [
    'Both live in Tools and Settings and are kept on your device.',
    'الاتنين في الأدوات والإعدادات، وبيتحفظوا على جهازك.',
  ],
  'guide.notifTitle': ['Notifications', 'التنبيهات'],
  'guide.notifBody': [
    'From Settings choose what reaches you — viewings, inquiries, watch alerts — and turn marketing off if you do not want it.',
    'من الإعدادات اختار إيه اللي يوصلك — المعاينات والاستفسارات وتنبيهات المتابعة — واقفل التسويق لو مش عايزه.',
  ],
  'guide.stuckTitle': ['Still stuck?', 'لسه محتار؟'],
  'guide.stuckBody': [
    'Send us a message and we will get back to you.',
    'ابعتلنا رسالة وهنرد عليك.',
  ],
  'guide.contactCta': ['Contact us', 'تواصل معانا'],
  'guide.replay': ['Watch the intro again', 'شوف التعريف تاني'],
});
