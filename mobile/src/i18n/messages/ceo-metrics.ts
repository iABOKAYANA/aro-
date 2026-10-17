import { defineMessages } from '../define';

// CEO Analytics + Overview: platform-level decision metrics.
// Split out of messages/ceo.ts so the metrics surface can be worked on in
// parallel with the rest of the console.
export const ceoMetrics = defineMessages({
  'ceoM.loading': ['Loading…', 'بنحمّل…'],
  'ceoM.failed': ['Could not load the metrics.', 'مقدرناش نحمّل البيانات.'],
  'ceoM.empty': ['No data yet', 'مفيش بيانات لحد دلوقتي'],
  'ceoM.retry': ['Try again', 'جرّب تاني'],

  'ceoM.summary': ['Summary overview', 'ملخص عام'],
  'ceoM.totalUsers': ['Total users', 'إجمالي المستخدمين'],
  'ceoM.totalBrokers': ['Total brokers', 'إجمالي الوسطاء'],
  'ceoM.brokers': ['Brokers', 'الوسطاء'],
  'ceoM.activeProjects': ['Active projects', 'المشاريع النشطة'],
  'ceoM.totalProjects': ['Total projects', 'إجمالي المشاريع'],
  'ceoM.totalLeads': ['Total leads', 'إجمالي العملاء'],
  'ceoM.totalInquiries': ['Total inquiries', 'إجمالي الاستفسارات'],
  'ceoM.totalFavorites': ['Total favorites', 'إجمالي المفضلة'],
  'ceoM.conversionRate': ['Conversion rate', 'معدل التحويل'],
  'ceoM.newLeads': ['New leads', 'عملاء جدد'],
  'ceoM.convertedLeads': ['Converted leads', 'العملاء اللي اتحولوا'],
  'ceoM.lostLeads': ['Lost leads', 'العملاء اللي ضاعوا'],
  'ceoM.totalViewings': ['Total viewings', 'إجمالي المعاينات'],

  'ceoM.funnel': ['Conversion funnel', 'مسار التحويل'],
  'ceoM.usersByRole': ['Users by role', 'المستخدمين حسب الدور'],
  'ceoM.registrationTrends': ['Registration trends (6 months)', 'اتجاه التسجيل (٦ شهور)'],
  'ceoM.propertyTypeDemand': ['Property type demand', 'الطلب على نوع الوحدة'],
  'ceoM.avgPriceByType': ['Average price by type', 'متوسط السعر حسب النوع'],
  'ceoM.inquiryTrends': ['Inquiry trends', 'اتجاه الاستفسارات'],
  'ceoM.inquiryStatus': ['Inquiry status breakdown', 'حالات الاستفسارات'],
  'ceoM.meetingRequests': ['Meeting requests', 'طلبات الاجتماعات'],

  // Chart group headings — the website's `SectionTitle` bands.
  'ceoM.leadAnalytics': ['Lead analytics', 'تحليلات العملاء'],
  'ceoM.userAnalytics': ['User analytics', 'تحليلات المستخدمين'],
  'ceoM.propertyAnalytics': ['Property analytics', 'تحليلات العقارات'],
  'ceoM.projectAnalytics': ['Project analytics', 'تحليلات المشاريع'],
  'ceoM.inquiryAnalytics': ['Inquiry analytics', 'تحليلات الاستفسارات'],

  // Individual chart cards.
  'ceoM.leadStatusBreakdown': ['Lead status breakdown', 'توزيع حالات العملاء'],
  'ceoM.leadTrends': ['Lead trends (6 months)', 'حركة العملاء (٦ شهور)'],
  'ceoM.leadsOverTime': ['Leads over time', 'العملاء عبر الزمن'],
  'ceoM.userRegistrations': ['User registrations', 'تسجيلات المستخدمين'],
  'ceoM.inquiriesOverTime': ['Inquiries over time', 'الاستفسارات عبر الزمن'],
  'ceoM.topProjectsInquiries': ['Top projects by inquiries', 'أعلى المشاريع بالاستفسارات'],
  'ceoM.topProjectsViews': ['Top projects by views & favorites', 'أعلى المشاريع بالمشاهدات والمفضلة'],
  'ceoM.topLocationsByProjects': ['Top locations by projects', 'أعلى المناطق بعدد المشاريع'],
  'ceoM.views': ['Views', 'المشاهدات'],
  'ceoM.favorites': ['Favorites', 'المفضلة'],

  // Broker performance table (leads / deals / rating columns).
  'ceoM.leadsLabel': ['{n} leads', '{n} عميل'],
  'ceoM.dealsLabel': ['{n} deals', '{n} صفقة'],

  // Overview: pending meeting requests card.
  'ceoM.meetingPending': ['{n} pending — booked from the website', '{n} مستنيين — اتحجزوا من الموقع'],
  'ceoM.meetingEmpty': ['No pending meeting requests right now', 'مفيش طلبات اجتماعات مستنية دلوقتي'],
  'ceoM.meetingHint': [
    'New bookings will appear here automatically',
    'الحجوزات الجديدة هتظهر هنا أوتوماتيك',
  ],
  'ceoM.meetingMore': ['+ {n} more', 'و {n} كمان'],
  'ceoM.viewAll': ['View all', 'شوف الكل'],
  'ceoM.joinMeeting': ['Join meeting', 'انضم للاجتماع'],

  // Overview: lead counters.
  'ceoM.todayBadge': ['+{n} today', '+{n} النهارده'],
  'ceoM.newLeadsWeek': ['{n} new leads', '{n} عملاء جدد'],

  'ceoM.perRole': ['{n} users', '{n} مستخدم'],
  'ceoM.perRoleOne': ['1 user', 'مستخدم واحد'],

  // ── Broker targets — GET/POST /api/ceo/targets ──
  'ceoM.targets.title': ['Monthly targets', 'تارجت الشهر'],
  'ceoM.targets.hint': ['Set what each broker should close this month, then watch it land.', 'حدّد كل وسيط المفروض يقفّل إيه الشهر ده، وتابع التنفيذ.'],
  'ceoM.targets.month': ['Month (YYYY-MM)', 'الشهر (سنة-شهر)'],
  'ceoM.targets.badMonth': ['Month must look like 2026-11.', 'الشهر لازم يبقى زي 2026-11.'],
  'ceoM.targets.deals': ['deals', 'صفقات'],
  'ceoM.targets.value': ['value', 'القيمة'],
  'ceoM.targets.noTarget': ['No target set', 'مفيش تارجت متحدد'],
  'ceoM.targets.set': ['Set target', 'حدّد التارجت'],
  'ceoM.targets.edit': ['Edit target', 'عدّل التارجت'],
  'ceoM.targets.targetDeals': ['Target deals', 'التارجت صفقات'],
  'ceoM.targets.targetValue': ['Target value (EGP)', 'التارجت قيمة (جنيه)'],
  'ceoM.targets.saved': ['Target saved', 'اتحفظ التارجت'],
  'ceoM.targets.hasTarget': ['Has target', 'عنده تارجت'],

  // ── Leaderboard — GET /api/ceo/leaderboard ──
  'ceoM.board.title': ['Leaderboard', 'ترتيب الوسطاء'],
  'ceoM.board.hint': ['Ranked by closed value, then deals. Awards follow this order.', 'مترتبين حسب القيمة المقفولة وبعدين الصفقات. المكافآت بتمشي على الترتيب ده.'],
  'ceoM.board.deals': ['deals', 'صفقات'],
  'ceoM.board.value': ['value', 'القيمة'],
  'ceoM.board.commission': ['commission', 'العمولة'],
  'ceoM.board.leads': ['leads', 'عملاء'],
  'ceoM.board.conversion': ['conversion', 'التحويل'],
  'ceoM.board.none': ['No brokers ranked yet', 'مفيش وسطاء مترتبين لسه'],
  'ceoM.board.noneHint': ['Closings this month will show up here.', 'التقفيلات بتاعة الشهر ده هتظهر هنا.'],
});
