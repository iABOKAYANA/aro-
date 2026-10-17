import { defineMessages } from '../define';

// Static website pages: about, privacy, terms, cookies.
// Owned by src/app/{about,privacy,terms,cookies}.tsx
export const content = defineMessages({
  'content.aboutTitle': ['About us', 'عنّا'],
  'content.privacyTitle': ['Privacy policy', 'سياسة الخصوصية'],
  'content.termsTitle': ['Terms of service', 'شروط الاستخدام'],
  'content.cookiesTitle': ['Cookie policy', 'سياسة الكوكيز'],
  'content.requestAccess': ['Request access', 'اطلب صلاحية'],
  'content.backToHome': ['Back to home', 'ارجع للرئيسية'],

  // Shared by privacy, terms and cookies — the site repeats it verbatim.
  'content.legal.updated': ['Last updated: January 2026', 'آخر تحديث: يناير 2026'],

  // ── /about — src/app/(public)/about/page.tsx ────────────────────────────
  'content.about.h1': ['About GHAYA REAL ESTATE', 'عن GHAYA REAL ESTATE'],
  'content.about.tagline': [
    "Egypt's leading AI-powered real estate platform",
    'منصّة العقارات المدعومة بالذكاء الاصطناعي رقم واحد في مصر',
  ],
  'content.about.missionTitle': ['Our Mission', 'هدفنا'],
  'content.about.missionBody': [
    'GHAYA REAL ESTATE is on a mission to transform the Egyptian real estate market by combining cutting-edge artificial intelligence with deep local market expertise. We believe that finding the perfect property should be simple, transparent, and accessible to everyone.',
    'GHAYA REAL ESTATE عندها مهمة إنها تحوّل سوق العقارات المصري، بإنها تجمع بين أحدث تقنيات الذكاء الاصطناعي وبين خبرة محلية عميقة في السوق. إحنا مؤمنين إن إني ألاقي العقار المناسب المفروض يكون حاجة سهلة وواضحة ومتاحة للكل.',
  ],
  'content.about.offerTitle': ['What We Offer', 'إيه اللي بنقدّمه'],
  'content.about.offer1Title': ['AI-Powered Search', 'بحث بالذكاء الاصطناعي'],
  'content.about.offer1Desc': [
    'Natural language search to find properties matching your exact needs.',
    'ابحث بطريقتك زي ما بتحكي، وتلاقي عقارات مطابقة لطلبك بالظبط.',
  ],
  'content.about.offer2Title': ['Verified Listings', 'إعلانات موثّقة'],
  'content.about.offer2Desc': [
    'Every property and developer is thoroughly verified.',
    'كل عقار وكل مطوّر بنتأكد منه بعناية.',
  ],
  'content.about.offer3Title': ['Market Insights', 'تحليلات السوق'],
  'content.about.offer3Desc': [
    'Real-time data and trends to make informed decisions.',
    'بيانات وتريندات لحظية علشان تاخد قرار مظبوط.',
  ],
  'content.about.offer4Title': ['Expert Brokers', 'وسطاء متخصصين'],
  'content.about.offer4Desc': [
    'Connect with licensed, experienced real estate professionals.',
    'تواصل مع وسطاء عقارات مرخّسين ومجربين.',
  ],
  'content.about.offer5Title': ['Smart Matching', 'توصيات ذكية'],
  'content.about.offer5Desc': [
    'AI recommends properties based on your preferences and behavior.',
    'الذكاء الاصطناعي بيرشحلك عقارات حسب ذوقك وطريقة تصفحك.',
  ],
  'content.about.offer6Title': ['Virtual Tours', 'جولات افتراضية'],
  'content.about.offer6Desc': [
    'Explore properties from the comfort of your home.',
    'اكتشف العقارات وإنت قاعد في بيتك.',
  ],
  'content.about.whyEgyptTitle': ['Why Egypt?', 'ليه مصر؟'],
  'content.about.whyEgyptBody': [
    "Egypt's real estate market is one of the fastest-growing in the MENA region. With mega-projects like the New Administrative Capital, new cities, and infrastructure developments, there has never been a better time to invest in Egyptian real estate. GHAYA REAL ESTATE is here to help you navigate this exciting market with confidence.",
    'سوق العقارات في مصر من أسرع الأسواق نموًّا في منطقة الشرق الأوسط وشمال أفريقيا. مع المشاريع الضخمة زي العاصمة الإدارية الجديدة والمدن الجديدة ومشروعات البنية التحتية، مفيش وقت أحسن من دلوقتي إنك تستثمر في العقارات المصرية. GHAYA REAL ESTATE موجودة علشان تساعدك تتعامل مع السوق المليان ده بثقة.',
  ],

  // ── /privacy — src/app/(public)/privacy/page.tsx ────────────────────────
  'content.privacy.h1': ['Privacy Policy', 'سياسة الخصوصية'],
  'content.privacy.s1Title': ['1. Information We Collect', '1. إيه المعلومات اللي بنتجمّعها'],
  'content.privacy.s1Body': [
    'When you use GHAYA REAL ESTATE, we may collect personal information including your name, email address, phone number, and property preferences. We also collect usage data such as search queries, browsing patterns, and device information to improve our services.',
    'لما تستخدم GHAYA REAL ESTATE، ممكن نجمّع معلومات شخصية زي اسمك وإيميلك ورقم تليفونك وتفضيلاتك في العقارات. وكمان بنتجمّع بيانات استخدام زي عمليات البحث وطريقة تصفحك ومعلومات الجهاز، علشان نطوّر خدماتنا.',
  ],
  'content.privacy.s2Title': ['2. How We Use Your Information', '2. إزاي بنستخدم معلوماتك'],
  'content.privacy.s2Body': [
    'We use your information to provide personalized property recommendations, connect you with developers and brokers, process inquiries, and send relevant market updates. Our AI systems analyze your preferences to deliver tailored search results and investment insights.',
    'بنستخدم معلوماتك علشان نرشحلك عقارات على مزاجك، ونوصلك بالمطوّرين والوسطاء، ونعالج استفساراتك، ونبعتلك تحديثات مهمة عن السوق. أنظمة الذكاء الاصطناعي بتحلّل تفضيلاتك علشان تدّيك نتائج بحث وتحليلات استثمارية على مقاسك.',
  ],
  'content.privacy.s3Title': ['3. Data Sharing', '3. مشاركة البيانات'],
  'content.privacy.s3Body': [
    'We may share your information with verified developers, brokers, and service providers to fulfill your property inquiries. We do not sell your personal data to third parties. All partners are bound by strict data protection agreements.',
    'ممكن نشارك معلوماتك مع مطوّرين ووسطاء ومزوّدين خدمات موثوقين علشان ننفذ استفساراتك العقارية. إحنا مش بنبيع بياناتك الشخصية لأي طرف تالت. وكل الشركاء مربوطين باتفاقيات صارمة لحماية البيانات.',
  ],
  'content.privacy.s4Title': ['4. Data Security', '4. أمان البيانات'],
  'content.privacy.s4Body': [
    'We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and regular security audits. However, no method of transmission over the internet is 100% secure.',
    'بنطبّق إجراءات أمان معتمدة في السوق علشان نحمي معلوماتك الشخصية، زي التشفير والسيرفرات الآمنة وتدقيق أمني دوري. بس مفيش طريقة نقل عبر الإنترنت مضمونة 100%.',
  ],
  'content.privacy.s5Title': ['5. Your Rights', '5. حقوقك'],
  'content.privacy.s5Body': [
    'You have the right to access, correct, or delete your personal data. You can also opt out of marketing communications at any time. To exercise these rights, contact us at privacy@estateai.eg.',
    'عندك حق إنك تشوف بياناتك الشخصية وتعدّلها أو تمسحها. وكمان تقدر تقف الرسائل التسويقية في أي وقت. علشان تستخدم حقوقك دي، كلمنا على privacy@estateai.eg.',
  ],
  'content.privacy.s6Title': ['6. Contact Us', '6. تواصل معانا'],
  'content.privacy.s6Body': [
    'For questions about this privacy policy, contact us at privacy@estateai.eg or through our contact page.',
    'لو عندك أي أسئلة عن سياسة الخصوصية دي، كلمنا على privacy@estateai.eg أو من صفحة التواصل بتاعتنا.',
  ],

  // ── /terms — src/app/(public)/terms/page.tsx ────────────────────────────
  'content.terms.h1': ['Terms of Service', 'شروط الاستخدام'],
  'content.terms.s1Title': ['1. Acceptance of Terms', '1. الموافقة على الشروط'],
  'content.terms.s1Body': [
    'By accessing or using GHAYA REAL ESTATE, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use our platform.',
    'بإنك تدخل أو تستخدم GHAYA REAL ESTATE، يبقى أنت موافق على شروط الاستخدام دي. ولو مش موافق على أي جزء منها، من فضلك متستخدمش منصتنا.',
  ],
  'content.terms.s2Title': ['2. Use of the Platform', '2. استخدام المنصة'],
  'content.terms.s2Body': [
    'GHAYA REAL ESTATE provides an AI-powered real estate platform for browsing, searching, and inquiring about properties in Egypt. You may use the platform for lawful purposes only and must provide accurate information when creating an account or submitting inquiries.',
    'GHAYA REAL ESTATE منصة عقارات مدعومة بالذكاء الاصطناعي للتصفح والبحث والاستفسار عن عقارات في مصر. تقدر تستخدم المنصة لأغراض قانونية بس، ولازم تدّي معلومات صحيحة لما تفتح حساب أو تبعت استفسار.',
  ],
  'content.terms.s3Title': ['3. AI-Powered Recommendations', '3. توصيات بالذكاء الاصطناعي'],
  'content.terms.s3Body': [
    'Our AI tools provide property recommendations, price estimates, and market insights based on available data. These recommendations are for informational purposes only and should not be considered as professional financial or legal advice.',
    'أدوات الذكاء الاصطناعي بتقدملك ترشيحات عقارات وتقديرات أسعار وتحليلات للسوق بناءً على البيانات المتاحة. الترشيحات دي للاستعلام بس، ومتأخذهاش كنصيحة مالية أو قانونية متخصصة.',
  ],
  'content.terms.s4Title': ['4. User Accounts', '4. حسابات المستخدمين'],
  'content.terms.s4Body': [
    'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use.',
    'أنت المسؤول عن سرية بيانات دخول حسابك وعلى كل اللي بيحصل من حسابك. ولازم تبلغنا فورًا لو حصل أي استخدام غير مصرح بيه.',
  ],
  'content.terms.s5Title': ['5. Limitation of Liability', '5. حدود المسؤولية'],
  'content.terms.s5Body': [
    'GHAYA REAL ESTATE shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. Property information is provided by developers and third parties, and we do not guarantee its accuracy.',
    'GHAYA REAL ESTATE مش هتتحمّل مسؤولية أي أضرار غير مباشرة أو عرضية أو ناتجة عن استخدامك للمنصة. معلومات العقارات بتيجي من المطوّرين وأطراف تالتة، وإحنا مش بنضمن دقّتها.',
  ],
  'content.terms.s6Title': ['6. Changes to Terms', '6. تعديلات الشروط'],
  'content.terms.s6Body': [
    'We reserve the right to modify these terms at any time. Changes will be effective upon posting. Continued use of the platform constitutes acceptance of the modified terms.',
    'إحنا بنحتفظ بحقنا نعدّل الشروط دي في أي وقت. والتعديلات بتبقى سارية من أول ما تتنشر. واستمرارك في استخدام المنصة معناها إنك موافق على الشروط المعدّلة.',
  ],
  'content.terms.s7Title': ['7. Contact', '7. تواصل معانا'],
  'content.terms.s7Body': [
    'For questions about these terms, contact us at legal@estateai.eg.',
    'لو عندك أي أسئلة عن الشروط دي، كلمنا على legal@estateai.eg.',
  ],

  // ── /cookies — src/app/(public)/cookies/page.tsx ────────────────────────
  'content.cookies.h1': ['Cookie Policy', 'سياسة الكوكيز'],
  'content.cookies.s1Title': ['1. What Are Cookies', '1. إيه الكوكيز'],
  'content.cookies.s1Body': [
    'Cookies are small text files stored on your device when you visit our website. They help us provide a better browsing experience by remembering your preferences and settings.',
    'الكوكيز ملفات نص صغيرة بتتخزن على جهازك لما تزور موقعنا. بتساعدنا نقدّملك تجربة تصفح أحسن عن طريق إنها بتفتكر تفضيلاتك وإعداداتك.',
  ],
  'content.cookies.s2Title': ['2. Types of Cookies We Use', '2. أنواع الكوكيز اللي بنستخدمها'],
  'content.cookies.essentialLabel': ['Essential Cookies:', 'الكوكيز الضرورية:'],
  'content.cookies.essentialBody': [
    'Required for the platform to function properly, including authentication, session management, and security features.',
    'ضرورية علشان المنصة تشتغل صح، زي تسجيل الدخول وإدارة الجلسات وميزات الأمان.',
  ],
  'content.cookies.preferenceLabel': ['Preference Cookies:', 'كوكيز التفضيلات:'],
  'content.cookies.preferenceBody': [
    'Remember your language preference (Arabic/English), theme settings (dark/light), and search filters.',
    'بتفتكر لغتك (عربي/إنجليزي) وإعدادات الثيم (غامق/فاتح) وفلاتر البحث.',
  ],
  'content.cookies.analyticsLabel': ['Analytics Cookies:', 'كوكيز التحليلات:'],
  'content.cookies.analyticsBody': [
    'Help us understand how visitors interact with our platform, allowing us to improve the user experience.',
    'بتساعدنا نفهم الزوار بيتعاملوا مع منصتنا إزاي، علشان نحسّن تجربة المستخدم.',
  ],
  'content.cookies.s3Title': ['3. Managing Cookies', '3. التحكم في الكوكيز'],
  'content.cookies.s3Body': [
    'You can control cookie settings through your browser preferences. You may choose to block all cookies, accept all cookies, or notify you when a cookie is set. Note that disabling certain cookies may affect platform functionality.',
    'تقدر تتحكم في إعدادات الكوكيز من إعدادات المتصفح بتاعك. تقدر تختار تحظر كل الكوكيز، أو تقبلها كلها، أو ننبهك أول مرة يتعمل كوكيز. بس خد بالك إن تعطيل بعض الكوكيز ممكن يأثر على شغل المنصة.',
  ],
  'content.cookies.s4Title': ['4. Third-Party Cookies', '4. كوكيز أطراف تالتة'],
  'content.cookies.s4Body': [
    'Some cookies are placed by third-party services that appear on our pages, such as map providers and analytics services. We do not control these third-party cookies.',
    'في كوكيز بتتحط من خدمات تالتة بتظهر في صفحاتنا، زي خرائط وخدمات تحليلات. إحنا مش بنتحكم في الكوكيز دي.',
  ],
  'content.cookies.s5Title': ['5. Updates', '5. التحديثات'],
  'content.cookies.s5Body': [
    'We may update this cookie policy from time to time. Any changes will be posted on this page with an updated revision date.',
    'ممكن نحدّث سياسة الكوكيز دي من وقت لوقت. وأي تعديل هيتنشر في الصفحة دي مع تاريخ تحديثه.',
  ],
  'content.cookies.s6Title': ['6. Contact', '6. تواصل معانا'],
  'content.cookies.s6Body': [
    'For questions about our cookie policy, contact us at privacy@estateai.eg.',
    'لو عندك أي أسئلة عن سياسة الكوكيز بتاعتنا، كلمنا على privacy@estateai.eg.',
  ],
});
