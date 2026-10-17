import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const deals = defineMessages({
  'deals.loading': ['Loading deals…', 'جاري تحميل الصفقات…'],
  'deals.searchPlaceholder': [
    'Search lead code, client or project...',
    'ابحث بكود العميل أو اسمه أو المشروع...',
  ],
  'deals.empty': ['No deals', 'مفيش صفقات'],
  'deals.emptyHint': [
    'Deals appear here once a lead converts.',
    'الصفقات بتظهر هنا أول ما العميل يتحول لصفقة.',
  ],
  'deals.deal': ['Deal', 'صفقة'],

  // Stat cards — the website's five cards over GET /api/deals
  'deals.statTotal': ['Total deals', 'إجمالي الصفقات'],
  'deals.statReservations': ['Reservations', 'حجوزات'],
  'deals.statContracts': ['Contracts', 'عقود'],
  'deals.statSoldValue': ['Sold value', 'قيمة المبيعات'],
  'deals.statCommissionPending': ['Commission pending', 'عمولات معلقة'],

  // Detail sheet — src/app/(dashboard)/dashboard/deals/page.tsx DealDetailModal
  'deals.client': ['Client', 'العميل'],
  'deals.reservationDate': ['Reservation date', 'تاريخ الحجز'],
  'deals.contractDate': ['Contract date', 'تاريخ العقد'],
  'deals.saleDate': ['Sale date', 'تاريخ البيع'],
  'deals.commission': ['Commission', 'العمولة'],
  'deals.commissionTotal': ['Total', 'الإجمالي'],
  'deals.brokerShare': ['Broker share', 'حصة الوسيط'],
  'deals.estateaiShare': ['EstateAI share', 'حصة EstateAI'],
  'deals.dueDate': ['Due date', 'موعد الاستحقاق'],
  'deals.paidDate': ['Paid date', 'تاريخ الدفع'],
  'deals.commissionNote': [
    '* Amounts are computed server-side from the configured rules.',
    '* الأرقام دي بتتحسب في السيرفر من قواعد العمولة المعتمدة.',
  ],

  // New-deal form — src/app/deal/new.tsx
  'deals.new': ['Report a deal', 'سجّل صفقة'],
  'deals.newHint': [
    'Link a converted lead to a project and the commission follows automatically.',
    'اربط عميل اتحول بمشروع والعمولة هتتسجّل أوتوماتيك.',
  ],
  'deals.create': ['Save deal', 'حفظ الصفقة'],
  'deals.created': ['Deal saved', 'الصفقة اتحفظت'],
  'deals.createFailed': ['Could not save the deal', 'مقدرناش نحفظ الصفقة'],
  'deals.pickLead': ['Lead', 'العميل'],
  'deals.pickProject': ['Project', 'المشروع'],
  'deals.unitOptional': ['Unit (optional)', 'الوحدة (اختياري)'],
  'deals.dealValue': ['Deal value', 'قيمة الصفقة'],
  'deals.stage': ['Stage', 'المرحلة'],
  'deals.leadRequired': ['Pick the lead this deal came from.', 'اختار العميل اللي جت منه الصفقة.'],
  'deals.projectRequired': ['Pick the project sold.', 'اختار المشروع المسكّر.'],
  'deals.valueRequired': ['Enter the deal value.', 'اكتب قيمة الصفقة.'],
  'deals.noLeads': ['No leads available', 'مفيش عملاء متاحين'],
  'deals.noProjects': ['No projects available', 'مفيش مشاريع متاحين'],
  'deals.searchLeads': ['Search name or code…', 'دوّر بالاسم أو الكود…'],
  'deals.selected': ['Selected', 'مختار'],
  'deals.terms': ['Deal terms', 'شروط الصفقة'],
  'deals.source': ['Source', 'المصدر'],
  'deals.sourcePlatform': ['On the platform', 'عن طريق المنصة'],
  'deals.sourceOffPlatform': ['Reported from outside', 'متسجّل من بره'],
  'deals.notesOptional': ['Notes (optional)', 'ملاحظات (اختياري)'],
  'deals.leadNoProject': [
    'This lead is not linked to a project — pick the project first.',
    'العميل ده مش مربوط بمشروع — اختار المشروع الأول.',
  ],
  'deals.createdHint': [
    'The deal is recorded and the commission follows automatically.',
    'الصفقة اتسجّلت والعمولة هتتظبط لوحدها.',
  ],
  'deals.goToDeals': ['See the deals', 'شوف الصفقات'],
});
