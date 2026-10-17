import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const home = defineMessages({
  'home.loading': ['Loading your dashboard…', 'جاري تحميل لوحة التحكم…'],
  'home.hello': ['Hello', 'أهلاً'],
  'home.helloName': ['Hello, {name}', 'أهلاً، {name}'],

  // CEO / ADMIN platform card
  'home.platform': ['Platform numbers', 'أرقام المنصة'],
  'home.platformHint': ['How the whole platform is doing', 'المنصة كلها ماشية إزاي'],
  'home.users': ['Users', 'المستخدمين'],
  'home.brokers': ['Brokers', 'الوكلاء'],
  'home.developers': ['Developers', 'المطوّرين'],
  'home.newWeek': ['New this week', 'جديد الأسبوع ده'],
  'home.openManagement': ['Open management tools', 'افتح أدوات الإدارة'],

  // Staff pipeline
  'home.pipeline': ['Customer steps', 'مراحل العملاء'],
  'home.pipelineHint': ['Where each customer stands right now', 'كل عميل واقف فين دلوقتي'],
  'home.recentLeads': ['Recent leads', 'أحدث العملاء'],
  'home.recentLeadsHint': ['Newest people who asked — tap a name to follow up', 'أجدد ناس سألت — دوس على أي اسم عشان تتابعه'],
  'home.seeAll': ['See all', 'شوف الكل'],
  'home.lead': ['Lead', 'عميل محتمل'],

  // Shortcuts
  'home.shortcuts': ['Shortcuts', 'اختصارات'],
  'home.shortcutsHint': ['Your quick doors to the tools you use most', 'أسرع سكة للأدوات اللي بتستعملها'],
  'home.askAssistant': ['Ask Ayn anything', 'اسأل عين على أي حاجة'],
  'home.savedSearches': ['Saved homes & searches', 'البيوت والعمليات المحفوظة'],
  'home.signOut': ['Sign out', 'تسجيل الخروج'],
  // Shown on the identity card when there is no session — the app browses
  // anonymously, so the home screen has to say so instead of rendering blanks.
  'home.browseHint': ['Browsing as a guest', 'بتتفرج كضيف'],

  // Buyer home — mirrors src/app/home-page.tsx section by section.
  'home.askTitle': ['Ask Ayn', 'اسأل عين'],
  'home.askHint': ['Ask in your own words — we find prices, plans, and matching homes', 'اسأل بكلامك انت — هنجيبلك الأسعار وخطط الدفع والبيوت المناسبة'],
  'home.askPlaceholder': ['e.g. 3 bedrooms in New Cairo under 8M', 'مثال: ٣ أوض في التجمع تحت ٨ مليون'],
  'home.askGo': ['Ask Ayn', 'اسأل عين'],
  'home.statsHint': ['Quick numbers about the market', 'أرقام سريعة عن السوق'],
  'home.properties': ['Properties', 'عقار'],
  'home.cities': ['Cities', 'مدن'],
  'home.featuredProjects': ['Featured projects', 'مشاريع مميزة'],
  'home.featuredSubtitle': [
    'Not sure where to start? These {n} are worth a look — tap one.',
    'محتار تبدأ منين؟ بص على الـ {n} دول — دوس على واحد فيهم.',
  ],
  'home.viewAll': ['View all', 'شوف الكل'],
  'home.newLaunches': ['New launches', 'إطلاقات جديدة'],
  'home.newLaunchesHint': ['Fresh projects — tap one to see its details', 'مشاريع لسه نازلة — دوس على أي واحد عشان تشوف تفاصيله'],
  'home.newBadge': ['New', 'جديد'],
  'home.startingAt': ['Starting at', 'يبدأ من'],
  'home.exploreLocations': ['Explore locations', 'استكشف المناطق'],
  'home.exploreSubtitle': ['Pick an area to see its homes', 'اختار منطقة عشان تشوف البيوت اللي فيها'],
  'home.projectsCount': ['{n} projects', '{n} مشروع'],
  'home.trustedDevelopers': ['Trusted developers', 'مطوّرين موثوقين'],
  'home.trustedHint': ['Tap a name to search its projects', 'دوس على اسم عشان تدوّر على مشاريعه'],
  'home.photoCredit': ['Landmark photos: Wikimedia Commons', 'صور المعالم: ويكيميديا كومنز'],
  'home.readyCTA': ['Ready to find your home?', 'جاهز تلاقي بيتك؟'],
  'home.readySubtitle': ['Talk to Ayn or browse the market — it takes a minute.', 'كلّم عين أو اتفرج على السوق — مش هتاخد دقيقة.'],
  'home.tryAiTools': ['Try AI tools', 'جرّب أدوات الذكاء'],
  'home.contactUs': ['Contact us', 'كلمنا'],

  // Staff quick actions — the website dashboard's Browse / Inquiries / AI row.
  'home.quickActions': ['What to do next', 'تعمل إيه دلوقتي'],
  'home.quickActionsHint': ['Three shortcuts your team uses daily', '٣ سكك فريقك بيستعملها كل يوم'],
  'home.browseProjects': ['Browse projects', 'اتفرج على المشاريع'],
  'home.viewInquiries': ['See customer messages', 'شوف رسايل العملاء'],
  'home.aiTools': ['AI tools', 'أدوات الذكاء'],

  // Recently-viewed rail — jump back into projects the visitor just opened.
  'home.recentTitle': ['Pick up where you left off', 'كمّل من حيث وقفت'],
  'home.recentHint': ['Jump back into the homes you just opened', 'ارجع بسرعة للبيوت اللي لسه فاتحها'],
  'home.agoNow': ['Just now', 'دلوقتي'],
  'home.agoMinutes': ['{n} min ago', 'من {n} دقيقة'],
  'home.agoHours': ['{n} h ago', 'من {n} ساعة'],
  'home.agoDays': ['{n} days ago', 'من {n} يوم'],
  'home.recentBook': ['Book', 'احجز'],

  // City-card follow toggle — fire-and-forget, state unknown client-side.
  'home.followCity': ['Follow', 'تابع'],
  'home.followingCity': ['Following ✓', 'بتتابعها ✓'],
  'home.followCityFailed': ["Couldn't follow — try again", 'معرفناش نتابعها — جرّب تاني'],
});
