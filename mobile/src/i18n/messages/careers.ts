import { defineMessages } from '../define';

// Owned by src/app/careers/index.tsx and src/app/careers/[slug].tsx
// English copy mirrors the website's src/app/(public)/careers pages.
export const careers = defineMessages({
  'careers.title': ['Careers', 'الوظائف'],
  'careers.subtitle': [
    'Join us in transforming Egypt’s real estate landscape with AI',
    'انضم لنا عشان نغيّر مع بعض شكل العقارات في مصر بالذكاء الاصطناعي',
  ],
  'careers.loading': ['Loading jobs…', 'بنحمّل الوظائف…'],
  'careers.empty': ['No open positions at the moment.', 'مفيش وظائف فاضية دلوقتي.'],
  'careers.emptyHint': [
    'We’re always looking for talented people. Check back later.',
    'إحنا دايمًا بندور على ناس شاطرة، ارجع اتفرج تاني بعدين.',
  ],
  'careers.failed': ['Could not load jobs.', 'مقدرناش نحمّل الوظائف.'],
  'careers.apply': ['Apply Now', 'قدّم دلوقتي'],
  'careers.applied': ['Application received', 'استلمنا طلبك'],
  'careers.applyFailed': ['Could not send your application.', 'مقدرناش نبعت طلبك.'],
  'careers.department': ['Department', 'القسم'],
  'careers.type': ['Type', 'نوع الوظيفة'],
  'careers.location': ['Location', 'المكان'],
  'careers.salary': ['Salary', 'المرتب'],

  // Job type pills — the site's TYPE_LABELS map on both careers pages.
  'careers.typeFullTime': ['Full Time', 'دوام كامل'],
  'careers.typePartTime': ['Part Time', 'دوام جزئي'],
  'careers.typeContract': ['Contract', 'عقد'],
  'careers.typeInternship': ['Internship', 'تدريب'],

  // Detail page — src/app/(public)/careers/[slug]/page.tsx
  'careers.back': ['Back to Careers', 'رجوع للوظائف'],
  'careers.notFound': ['Job not found', 'مش لاقيين الوظيفة دي'],
  'careers.requirements': ['Requirements', 'المتطلبات'],
  'careers.perMonth': ['EGP / month', 'جنيه / شهر'],

  // Apply dialog — src/components/careers/apply-button.tsx
  'careers.applyFor': ['Apply for', 'قدّم على'],
  'careers.requiredNote': ['All fields marked * are required.', 'كل الحقول اللي فيها * مطلوبة.'],
  'careers.fullName': ['Full name *', 'الاسم بالكامل *'],
  'careers.email': ['Email *', 'الإيميل *'],
  'careers.coverLetter': ['Cover letter', 'رسالة تغطية'],
  'careers.coverPlaceholder': [
    'Tell us why you’re a great fit…',
    'قولنا ليه إنت الأنسب للمكان ده…',
  ],
  'careers.submit': ['Submit application', 'ابعت الطلب'],
  'careers.successBody': [
    'Thanks — we’ve sent you a confirmation email and our team will review your CV.',
    'شكرًا — هيوصلك إيميل تأكيد، وفريقنا هيراجع الـ CV بتاعك ويبلغك.',
  ],
  'careers.nameRequired': ['Please enter your full name.', 'من فضلك اكتب اسمك بالكامل.'],
  'careers.emailInvalid': ['Please enter a valid email.', 'من فضلك اكتب إيميل صحيح.'],
});
