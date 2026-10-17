import { defineMessages } from '../define';

/**
 * Account settings + invitation-only registration.
 * Owned by the settings and register screens; add keys here, nowhere else.
 */
export const settings = defineMessages({
  'settings.title': ['Settings', 'الإعدادات'],
  'settings.loading': ['Loading settings…', 'جاري تحميل الإعدادات…'],

  'settings.account': ['Account', 'الحساب'],
  'settings.profile': ['Profile', 'الملف الشخصي'],
  'settings.role': ['Role', 'الدور'],
  'settings.language': ['Language', 'اللغة'],
  'settings.languageHelp': [
    'Arabic switches the whole app to right-to-left.',
    'العربي بيدوّر التطبيق كله من اليمين للشمال.',
  ],
  'settings.english': ['English', 'إنجليزي'],
  'settings.arabic': ['Arabic', 'عربي'],
  'settings.appearance': ['Appearance', 'المظهر'],
  'settings.appearanceHelp': [
    'Light, dark, or follow your phone.',
    'فاتح، غامق، أو زي موبايلك.',
  ],
  'settings.displayCurrency': ['Display currency', 'عملة العرض'],
  'settings.displayCurrencyHelp': [
    'Prices are converted for display only — listings are priced in EGP.',
    'الأسعار بتتحوّل للعرض بس — الأسعار الأساسية بالجنيه.',
  ],

  'settings.notifications': ['Notifications', 'الإشعارات'],
  'settings.notificationsHelp': [
    'Choose what the platform is allowed to push to this phone.',
    'اختار إيه اللي المنصة تقدر تبعته للموبايل ده.',
  ],
  'settings.pushLeads': ['New leads and assignments', 'عملاء جدد وتوزيع'],
  'settings.pushInquiries': ['Incoming inquiries', 'الاستفسارات الواردة'],
  'settings.pushViewings': ['Viewing reminders', 'تذكيرات المعاينات'],
  'settings.pushPayments': ['Commission and payments', 'العمولات والمدفوعات'],
  'settings.pushWatch': ['Price and availability alerts', 'تنبيهات الأسعار والتوفر'],
  'settings.pushFailed': ['Could not update notifications', 'مقدرناش نحدّث الإشعارات'],
  'settings.pushSaved': ['Preferences saved', 'اتحفظت التفضيلات'],

  // The 12 booleans PATCH /api/preferences accepts, grouped for scanning
  'settings.groupPush': ['Push to this phone', 'إشعارات على الموبايل ده'],
  'settings.groupEmail': ['Email', 'البريد'],
  'settings.groupMessaging': ['SMS & WhatsApp', 'رسايل وواتساب'],
  'settings.on': ['On', 'شغّال'],
  'settings.off': ['Off', 'مقفول'],
  'settings.emailInquiries': ['New inquiries', 'الاستفسارات الجديدة'],
  'settings.emailLeads': ['New leads', 'العملاء الجدد'],
  'settings.emailPayments': ['Payments and commissions', 'المدفوعات والعمولات'],
  'settings.emailViewings': ['Viewings', 'المعاينات'],
  'settings.emailMarketing': ['News and offers', 'الأخبار والعروض'],
  'settings.smsNotifications': ['SMS alerts', 'تنبيهات الرسايل'],
  'settings.whatsappNotifications': ['WhatsApp alerts', 'تنبيهات واتساب'],

  'settings.preferences': ['Property preferences', 'تفضيلات العقار'],
  'settings.preferencesHelp': [
    'What Ayn should keep in mind when recommending to you.',
    'إيه اللي عين ياخدو في باله وهو بيقترح عليك.',
  ],
  'settings.budget': ['Budget range', 'نطاق الميزانية'],
  'settings.bedrooms': ['Bedrooms', 'غرف النوم'],
  'settings.areas': ['Preferred areas', 'المناطق المفضلة'],
  'settings.propertyType': ['Property type', 'نوع العقار'],
  'settings.prefsSaved': ['Preferences saved', 'اتحفظت التفضيلات'],
  'settings.prefsFailed': ['Could not save preferences', 'مقدرناش نحفظ التفضيلات'],
  'settings.budgetMin': ['Minimum (EGP)', 'الحد الأدنى (جنيه)'],
  'settings.budgetMax': ['Maximum (EGP)', 'الحد الأعلى (جنيه)'],
  'settings.numbersInvalid': [
    'Check the numbers — positive values, and the minimum not above the maximum.',
    'راجع الأرقام — لازم تكون موجبة والحد الأدنى مش أعلى من الأعلى.',
  ],
  'settings.areasHint': [
    'Separate areas with commas — New Cairo, Sheikh Zayed…',
    'افصل بين المناطق بفواصل — القاهرة الجديدة، الشيخ زايد…',
  ],
  'settings.intent': ['Looking to', 'عايز'],
  'settings.intentLiving': ['Live in', 'أسكن فيها'],
  'settings.intentInvestment': ['Invest in', 'أستثمر فيها'],
  'settings.urgency': ['How fast', 'قد إيه مستعجل'],
  'settings.urgencyLow': ['No rush', 'مفيش استعجال'],
  'settings.urgencyMedium': ['Soon', 'قريب'],
  'settings.urgencyHigh': ['ASAP', 'على طول'],
  'settings.dnaDisabled': [
    'Property preferences are switched off on the platform right now.',
    'تفضيلات العقار مقفولة على المنصة دلوقتي.',
  ],

  'settings.security': ['Security', 'الأمان'],
  'settings.changePassword': ['Change password', 'غيّر كلمة السر'],
  'settings.currentPassword': ['Current password', 'كلمة السر الحالية'],
  'settings.newPassword': ['New password', 'كلمة السر الجديدة'],
  'settings.confirmPassword': ['Confirm new password', 'أكّد كلمة السر الجديدة'],
  'settings.passwordMismatch': ['The two passwords do not match.', 'كلمتين السر مش متطابقين.'],
  'settings.passwordTooShort': [
    'Use at least 10 characters.',
    'اكتب 10 حروف على الأقل.',
  ],
  'settings.passwordChanged': ['Password changed', 'اتغيّرت كلمة السر'],
  'settings.passwordFailed': ['Could not change the password', 'مقدرناش نغيّر كلمة السر'],
  'settings.passwordRequired': ['All three password fields are required.', 'لازم تكتب تلات كلمات السر.'],
  'settings.securityHelp': [
    'Your current password is checked before the new one is saved.',
    'كلمة السر الحالية بتتتأكد منها قبل ما نحفظ الجديدة.',
  ],
  'settings.appLock': ['Lock with biometrics', 'اقفل بالبصمة'],
  'settings.appLockHelp': [
    'Ask for your fingerprint, face, or this phone\u2019s PIN before your signed-in account opens on this device.',
    'اطلب البصمة أو الوش أو PIN الموبايل ده قبل ما حسابك المفتوح يتفتح على الجهاز ده.',
  ],
  'settings.appLockPrompt': ['Unlock GHAYA', 'افتح غيّا'],
  'settings.appLockTitle': ['GHAYA is locked', 'غيّا مقفولة'],
  'settings.appLockMessage': [
    'Unlock with your fingerprint, face, or phone PIN to continue.',
    'افتح بالبصمة أو الوش أو PIN الموبايل عشان تكمّل.',
  ],
  'settings.appLockRetry': ['Try again', 'حاول تاني'],
  'settings.appLockSignOut': ['Sign out instead', 'اخرج من الحساب بدل كده'],
  'settings.appLockFailed': ['Could not verify you — try again.', 'مقدرناش نتأكد منك — حاول تاني.'],
  'settings.appLockEnableFailed': [
    'Could not turn the lock on — unlock your device first, then try again.',
    'مقدرناش نشغّل القفل — افتح قفل جهازك الأول وبعدين حاول تاني.',
  ],

  'settings.about': ['About', 'عن التطبيق'],
  // Mirrors the website footer's `company` and `legal` link groups —
  // src/components/layout/footer.tsx.
  'settings.company': ['Company', 'عن الشركة'],
  'settings.legal': ['Legal', 'قانوني'],
  'settings.version': ['Version', 'الإصدار'],
  'settings.apiHost': ['API', 'الـ API'],
  'settings.savedSearches': ['Saved searches', 'البحث المحفوظ'],
  'settings.savedSearchesHint': [
    'Open the Saved tab to review your searches and favourites.',
    'افتح تبويب المحفوظات عشان تشوف بحثك ومفضلاتك.',
  ],

  // Invitation-only registration — src/app/register.tsx
  'register.title': ['Create account', 'إنشاء حساب'],
  'register.subtitle': [
    'Registration is invitation-only. Paste the token you were sent.',
    'التسجيل بالدعوة بس. الصق التوكن اللي بعتولك.',
  ],
  'register.token': ['Invitation token', 'توكن الدعوة'],
  'register.tokenHint': [
    'No token? Ask an administrator to invite you.',
    'م عندك توكن؟ اطلب من الأدمن يدعيك.',
  ],
  'register.name': ['Full name', 'الاسم بالكامل'],
  'register.nameRequired': ['Your name is required.', 'لازم تكتب اسمك.'],
  'register.email': ['Email', 'البريد الإلكتروني'],
  'register.emailPlaceholder': ['you@example.com', 'you@example.com'],
  'register.phone': ['Phone (optional)', 'التليفون (اختياري)'],
  'register.password': ['Password', 'كلمة السر'],
  'register.passwordPlaceholder': ['••••••••', '••••••••'],
  'register.confirmPassword': ['Confirm password', 'أكّد كلمة السر'],
  'register.confirmPlaceholder': ['••••••••', '••••••••'],
  'register.submit': ['Create account', 'اعمل حساب'],
  'register.submitting': ['Creating…', 'جاري الإنشاء…'],
  'register.haveAccount': ['Already have an account? Sign in', 'عندك حساب؟ ادخل'],
  'register.failed': ['Could not create the account', 'مقدرناش نعمل الحساب'],
  'register.tokenRequired': ['An invitation token is required.', 'لازم توكن الدعوة.'],
  'register.emailRequired': ['Email and password are required.', 'لازم البريد وكلمة السر.'],
  'register.done': ['Account created — sign in to continue', 'الحساب اتعمل — ادخل عشان تكمّل'],

  // Global WhatsApp CTA — mobile/src/app/ceo/settings.tsx. Mirrors the
  // website's `cta` section (POST /api/settings { section: 'cta', ... }).
  'ceo.settings.whatsapp': ['WhatsApp button', 'زر الواتساب'],
  'ceo.settings.whatsappHint': [
    'A floating chat button across the whole app and website.',
    'زر شات عايم في الأبليكيشن والموقع كله.',
  ],
  'ceo.settings.whatsappEnabled': ['Show the WhatsApp button', 'إظهار زر الواتساب'],
  'ceo.settings.whatsappEnabledHint': [
    'Turn it off to hide the button everywhere.',
    'اقفله عشان الزر يختفي من كل حتة.',
  ],
  'ceo.settings.whatsappNumber': ['WhatsApp number', 'رقم الواتساب'],
  'ceo.settings.whatsappNumberHint': [
    'Digits only, with the country code — e.g. 2010…. Empty hides the button.',
    'أرقام بس بكود الدولة — مثلا 2010…. لو فاضي الزر بيختفي.',
  ],
  'ceo.settings.whatsappMessageEn': ['Prefilled message (English)', 'الرسالة الجاهزة (إنجليزي)'],
  'ceo.settings.whatsappMessageAr': ['Prefilled message (Arabic)', 'الرسالة الجاهزة (عربي)'],
  'ceo.settings.whatsappLabelEn': ['Button label (English)', 'اسم الزر (إنجليزي)'],
  'ceo.settings.whatsappLabelAr': ['Button label (Arabic)', 'اسم الزر (عربي)'],
});
