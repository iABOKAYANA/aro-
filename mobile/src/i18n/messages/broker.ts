import { defineMessages } from '../define';

/**
 * Broker portal — the mobile counterpart of the website's `/broker` page.
 * Owned by the broker-portal screen; add keys here, nowhere else.
 */
export const broker = defineMessages({
  'broker.title': ['Broker portal', 'بوابة الوسيط'],
  'broker.loading': ['Loading your portal…', 'جاري تحميل بوابتك…'],
  'broker.noProfile': ['No broker profile yet', 'مفيش ملف وسيط لسه'],
  'broker.noProfileHint': [
    'This account is signed in, but it has no broker profile attached. Ask an administrator to link one.',
    'الحساب ده مسجّل دخول بس مفيش ملف وسيط مربوط بيه. اطلب من الأدمن يربطلك واحد.',
  ],
  'broker.tab.overview': ['Overview', 'نظرة عامة'],
  'broker.tab.leads': ['Leads', 'العملاء المحتملون'],
  'broker.tab.deals': ['Deals', 'الصفقات'],
  'broker.tab.commissions': ['Commissions', 'العمولات'],
  'broker.tab.projects': ['Projects', 'المشاريع'],
  'broker.license': ['License', 'الرخصة'],
  'broker.activeLeads': ['Active leads', 'عملاء شغّالين'],
  'broker.totalLeads': ['Total leads', 'إجمالي العملاء'],
  'broker.dealsCount': ['Deals', 'الصفقات'],
  'broker.dealValue': ['Closed value', 'قيمة المسكّر'],
  'broker.yourShare': ['Your share', 'حصتك'],
  'broker.pipeline': ['Lead pipeline', 'مسار العملاء'],
  'broker.upcoming': ['Upcoming viewings', 'معاينات قادمة'],
  'broker.noUpcoming': ['Nothing booked yet', 'مفيش معاينات محجوزة'],
  'broker.noLeads': ['No leads yet', 'مفيش عملاء لسه'],
  'broker.noLeadsHint': [
    'Assigned leads show up here as soon as the platform routes one to you.',
    'العملاء المكلف بيهم هيظهروا هنا أول ما المنصة توجّهلك واحد.',
  ],
  'broker.noDeals': ['No deals yet', 'مفيش صفقات لسه'],
  'broker.noDealsHint': [
    'Report a transaction from a converted lead and it lands here.',
    'سجّل صفقة من عميل اتحول وهيظهر هنا.',
  ],
  'broker.noCommissions': ['No commissions yet', 'مفيش عمولات لسه'],
  'broker.noCommissionsHint': [
    'Your share is posted once a deal closes.',
    'حصتك بتتسجّل أول ما الصفقة تتمسكّر.',
  ],
  'broker.noProjects': ['No projects shared with you', 'مفيش مشاريع متاحة معاك'],
  'broker.noProjectsHint': [
    'Projects a developer grants you access to appear here.',
    'المشاريع اللي المطوّر بيديك صلاحية ليها بتظهر هنا.',
  ],
  'broker.projectScope': ['Access', 'الصلاحية'],
  'broker.expires': ['Expires', 'تنتهي'],
  'broker.dueDate': ['Due', 'مستحق'],
  'broker.paidDate': ['Paid', 'مدفوعة'],
  'broker.brokerShare': ['Broker share', 'حصة الوسيط'],
  'broker.suspended': ['Account paused', 'الحساب متوقف'],
  'broker.suspendedHint': [
    'This broker account is not active, so the platform may reassign your leads.',
    'حساب الوسيط ده مش شغّال، فالمنصة ممكن تعيد توزيع عملائك.',
  ],
  'broker.openLead': ['Open lead', 'افتح العميل'],
  'broker.followUp': ['Next follow-up', 'متابعة قادمة'],
  'broker.budget': ['Budget', 'الميزانية'],

  // Overview — the profile card and the KPI grid above the pipeline.
  'broker.verified': ['Verified', 'موثّق'],
  'broker.unverified': ['Not verified', 'مش موثّق'],
  'broker.reviews': ['reviews', 'تقييم'],
  'broker.commissionRate': ['Commission rate', 'نسبة العمولة'],
  'broker.recentLeads': ['Recent leads', 'أحدث العملاء'],

  // Commissions — the totals card that sits over the list.
  'broker.total': ['Total', 'الإجمالي'],
  'broker.paid': ['Paid', 'مدفوعة'],
  'broker.pending': ['Pending', 'مستحقة'],

  // Projects — what a granted row is worth and how wide the access goes.
  'broker.startPrice': ['Starting at', 'يبدأ من'],
  'broker.scopeProject': ['Project access', 'صلاحية مشروع'],
  'broker.scopeDeveloper': ['Developer access', 'صلاحية مطوّر'],

  // Account — the "Your account" panel from the website Overview.
  'broker.experience': ['Experience', 'الخبرة'],
  'broker.years': ['yrs', 'سنين'],
  'broker.dealsRecorded': ['Deals recorded', 'صفقات متسجلة'],
  'broker.status': ['Status', 'الحالة'],

  // Leads — search + status filter + inline status change (PATCH /api/broker/leads).
  'broker.searchLeads': [
    'Search name, phone, email or project…',
    'دوّر بالاسم أو الموبايل أو الإيميل أو المشروع…',
  ],
  'broker.allStatuses': ['All', 'الكل'],
  'broker.tapStatusHint': [
    'Tap a status badge to move that lead along.',
    'دوس على حالة أي عميل عشان تحرّكه للمرحلة اللي بعدها.',
  ],
  'broker.statusUpdateFailed': ['Could not update the status.', 'مقدرناش نحدّث الحالة.'],
});
