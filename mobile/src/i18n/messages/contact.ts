import { defineMessages } from '../define';

// Owned by src/app/contact.tsx and src/app/request-access.tsx
//
// Copy mirrors the website pages that are the source of truth:
//  - src/app/(public)/contact/page.tsx        → `contact.*`
//  - src/app/auth/request-access/page.tsx     → `request.*`
//    plus the fields POST /api/auth/request-access accepts.
export const contact = defineMessages({
  'contact.title': ['Contact Us', 'تواصل معانا'],
  'contact.subtitle': [
    'Get in touch with our team for any inquiries',
    'تواصل مع فريقنا لأي استفسار',
  ],
  'contact.formTitle': ['Send Us a Message', 'ابعتلنا رسالة'],
  'contact.name': ['Full name', 'الاسم بالكامل'],
  'contact.email': ['Email', 'البريد الإلكتروني'],
  'contact.phone': ['Phone', 'رقم التليفون'],
  'contact.address': ['Address', 'العنوان'],
  'contact.subject': ['Subject', 'الموضوع'],
  'contact.message': ['Message', 'الرسالة'],
  'contact.send': ['Send Message', 'ابعت الرسالة'],
  'contact.sending': ['Sending…', 'بنبعت…'],
  'contact.sent': ['Message sent — we will reply soon.', 'الرسالة اتبعتت — هنرد عليك بسرعة.'],
  'contact.sentTitle': ['Message Sent!', 'الرسالة اتبعتت!'],
  'contact.sentBody': [
    'We’ll get back to you within 24 hours.',
    'هنرد عليك خلال ٢٤ ساعة.',
  ],
  'contact.sendAnother': ['Send Another Message', 'ابعت رسالة تانية'],
  'contact.failed': ['Could not send your message.', 'مقدرناش نبعت رسالتك.'],
  'contact.required': ['Fill in your name, email and message.', 'لازم تكتب اسمك وبريدك ورسالتك.'],

  // Office block — src/app/(public)/contact/page.tsx, same content
  'contact.offices': ['Our offices', 'مكاتبنا'],
  'contact.hours': ['Working Hours', 'مواعيد العمل'],
  'contact.officePhone': ['+20 2 1234 5678', '+20 2 1234 5678'],
  'contact.officeEmail': ['info@estateai.eg', 'info@estateai.eg'],
  'contact.officeAddress': ['New Cairo, Cairo, Egypt', 'القاهرة الجديدة، القاهرة، مصر'],
  'contact.officeHours': ['Sun - Thu: 9AM - 6PM', 'الأحد - الخميس: ٩ صباحًا - ٦ مساءً'],
  'contact.whatsapp': ['Chat on WhatsApp', 'كلّمنا واتساب'],
  // Floating call CTA (ContactFabs) — hidden until the CEO sets `cta.phone`.
  'contact.call': ['Call us now', 'اتصل بينا دلوقتي'],

  // Placeholders
  'contact.namePlaceholder': ['Your name', 'اسمك'],
  'contact.phonePlaceholder': ['+20 1XX XXX XXXX', '+20 1XX XXX XXXX'],
  'contact.emailPlaceholder': ['your@email.com', 'your@email.com'],
  'contact.messagePlaceholder': [
    'Tell us about your requirements...',
    'قولنا إيه احتياجاتك...',
  ],

  // Client-side validation — the rules of `inquirySchema` (src/lib/validations)
  // plus the name / email / message the API itself refuses to drop.
  'contact.nameRequired': [
    'Name must be at least 2 characters.',
    'الاسم لازم يكون حرفين على الأقل.',
  ],
  'contact.emailRequired': ['Email address is required.', 'لازم تكتب البريد الإلكتروني.'],
  'contact.emailInvalid': ['Enter a valid email address.', 'اكتب بريد إلكتروني صحيح.'],
  'contact.phoneRequired': [
    'Enter a valid phone number (at least 10 characters).',
    'اكتب رقم تليفون صحيح (١٠ خانات على الأقل).',
  ],
  'contact.messageRequired': ['Write a message.', 'اكتب رسالتك.'],

  // Inquiry type — the `<select>` of the website contact form
  'contact.inquiryType': ['Inquiry Type', 'نوع الاستفسار'],
  'contact.typeGeneral': ['General Inquiry', 'استفسار عام'],
  'contact.typeVisit': ['Schedule a Visit', 'احجز زيارة'],
  'contact.typePrice': ['Price Inquiry', 'استفسار عن السعر'],
  'contact.typeAvailability': ['Availability Check', 'استفسار عن التوفر'],
  'contact.typePaymentPlan': ['Payment Plan Info', 'معلومات خطط السداد'],
  'contact.typeCallback': ['Request a Callback', 'اطلب مكالمة'],

  // ── /request-access ────────────────────────────────────────────────────
  'request.title': ['Access by invitation', 'الدخول بدعوة'],
  'request.subtitle': [
    'Tell us who you are and we will create your account.',
    'قولنا إنت مين وهنعملك حساب.',
  ],
  'request.invitationOnly': ['Invitation Only', 'الدخول بالدعوة بس'],
  'request.blurb': [
    'GHAYA REAL ESTATE is a private platform. Registration is by invitation only.',
    'غيّا ريل إستيت منصة خاصة. التسجيل بالدعوة بس.',
  ],
  'request.howTo': ['How to get access:', 'إزاي تحصل على الصلاحية:'],
  'request.step1': [
    'Contact an existing member or administrator to receive an invitation link',
    'كلّم عضو موجود أو أدمن عشان يبعتلك رابط دعوة',
  ],
  'request.step2': [
    'Once invited, you’ll receive an email with a unique registration link',
    'بعد ما تتدعوة هيصلك إيميل فيه رابط تسجيل مخصوص بيك',
  ],
  'request.name': ['Full name', 'الاسم بالكامل'],
  'request.email': ['Email', 'البريد الإلكتروني'],
  'request.phone': ['Phone', 'رقم التليفون'],
  'request.company': ['Company', 'الشركة'],
  'request.role': ['Role', 'الصفة'],
  'request.roleBuyer': ['Buyer', 'عميل'],
  'request.roleBroker': ['Broker', 'وسيط'],
  'request.roleDeveloper': ['Developer', 'مطوّر'],
  'request.roleSeller': ['Seller', 'بائع'],
  'request.message': ['Message', 'الرسالة'],
  'request.namePlaceholder': ['Your name', 'اسمك'],
  'request.emailPlaceholder': ['you@example.com', 'you@example.com'],
  'request.phonePlaceholder': ['+20 1XX XXX XXXX', '+20 1XX XXX XXXX'],
  'request.companyPlaceholder': ['Your company', 'شركةك'],
  'request.messagePlaceholder': [
    'Tell us a bit about what you are looking for…',
    'قولنا شوية عن إيه اللي بتدور عليه…',
  ],
  'request.submit': ['Send Request', 'ابعت الطلب'],
  'request.nameRequired': ['Name is required.', 'لازم تكتب اسمك.'],
  'request.emailRequired': ['Email address is required.', 'لازم تكتب البريد الإلكتروني.'],
  'request.emailInvalid': ['Enter a valid email address.', 'اكتب بريد إلكتروني صحيح.'],
  'request.sent': ['Request received — we will contact you.', 'استلمنا طلبك — هنكلّمك.'],
  'request.failed': ['Could not send your request.', 'مقدرناش نبعت طلبك.'],
  'request.signIn': ['Sign In', 'تسجيل الدخول'],
  'request.hasToken': ['Already have an invite token?', 'عندك توكن دعوة؟'],
  'request.goRegister': ['Create account', 'اعمل حساب'],
});

/**
 * Every key this namespace owns — `contact.*` and `request.*` alike, since
 * both screens share the table.
 *
 * `MessageKey` in ../index.tsx (lead-owned) does not list this namespace yet,
 * so the two screens widen their local `t` to this type instead of editing
 * that file. Typo safety is preserved either way: the union is derived from
 * the table above, so `t('contact.nope')` is still a compile error.
 */
export type ContactMessageKey = keyof typeof contact;
