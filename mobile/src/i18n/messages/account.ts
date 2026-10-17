import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const account = defineMessages({
  // src/app/+not-found.tsx
  'account.notFound': ['Not found', 'مش موجودة'],
  'account.notFoundTitle': ['This screen does not exist', 'الصفحة دي مش موجودة'],
  'account.notFoundMessage': [
    'The link you followed may be out of date, or the page may have moved.',
    'يمكن اللينك اللي دوست عليه قديم، أو الصفحة اتنقلت لمكان تاني.',
  ],
  'account.goHome': ['Go to home', 'روح للرئيسية'],
  'account.exploreProjects': ['Explore projects', 'استكشف المشاريع'],

  // src/app/login.tsx
  'account.brandTag': ['REAL ESTATE', 'عقاري'],
  'account.welcomeBack': ['Welcome back', 'أهلاً بيك تاني'],
  'account.signInSubtitle': [
    'Sign in with the same account you use on the website.',
    'ادخل بنفس الحساب اللي بتستخدمه على الموقع.',
  ],
  'account.password': ['Password', 'كلمة السر'],
  'account.emailPlaceholder': ['you@example.com', 'you@example.com'],
  'account.passwordPlaceholder': ['••••••••', '••••••••'],
  'account.signIn': ['Sign In', 'تسجيل الدخول'],
  'account.required': ['Email and password are required.', 'لازم تكتب البريد وكلمة السر.'],
  'account.signInFailed': ['Could not sign in.', 'مقدرناش نسجّل دخولك.'],
  'account.showPassword': ['Show password', 'إظهار كلمة السر'],
  'account.hidePassword': ['Hide password', 'إخفاء كلمة السر'],
  'account.registered': [
    'Account created successfully! Please sign in.',
    'الحساب اتعمل بنجاح! سجّل الدخول بقى.',
  ],
  'account.noAccount': ["Don't have an account?", 'معندكش حساب؟'],
  'account.requestAccess': ['Request access', 'اطلب دعوة'],
  'account.contactUs': ['Contact us', 'تواصل معانا'],
  'account.accessClosedTitle': ['Access requests are closed', 'طلبات الدخول مقفولة'],
  'account.accessClosedBody': [
    'Account creation is by invitation from the administration — contact us and we will help you.',
    'إنشاء الحسابات بالدعوة من الإدارة — تواصل معانا وهنساعدك.',
  ],
  'account.demoAccounts': [
    'Demo accounts — tap one to fill the form',
    'حسابات للتجربة — دوس على واحد عشان يملا البيانات',
  ],
  'account.demoPasswordNote': [
    'The password for all of them is password123',
    'كلمة السر بتاعتهم كلهم هي password123',
  ],
  'account.demoAdmin': ['Admin', 'أدمن'],
  'account.demoBroker': ['Broker', 'بروكر'],
  'account.demoDeveloper': ['Developer', 'مطوّر'],
  'account.demoUser': ['User', 'مستخدم'],

  // src/components/auth-gate.tsx — the sign-in prompt a screen that needs an
  // account shows a signed-out visitor instead of letting a 401 paint itself.
  'account.signInRequired': ['Sign in to continue', 'سجّل دخول عشان تكمل'],
  'account.signInRequiredHint': [
    'This page needs an account — browse the rest of the app while you decide.',
    'الصفحة دي محتاجة حساب — اتفرج على باقي التطبيق وإنت بتقرر.',
  ],
  'account.browseWithout': ['Browse without signing in', 'اتفرج من غير تسجيل دخول'],

  // src/app/auth/error.tsx — mirrors src/app/auth/error/page.tsx.
  'account.authErrorTitle': ['Authentication Error', 'خطأ في تسجيل الدخول'],
  'account.authErrorMessage': [
    'Something went wrong during authentication. Please try again.',
    'حصلت مشكلة أثناء تسجيل الدخول. حاول تاني.',
  ],
  'account.backToLogin': ['Back to Login', 'ارجع لتسجيل الدخول'],
});
