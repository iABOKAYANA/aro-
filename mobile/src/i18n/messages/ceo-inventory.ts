import { defineMessages } from '../define';

// CEO inventory + catalog administration: projects, units, users, pricing.
// Split from messages/ceo.ts so this surface can be worked on in parallel.
export const ceoInv = defineMessages({
  'ceoI.loading': ['Loading…', 'بنحمّل…'],
  'ceoI.failed': ['Could not load.', 'مقدرناش نحمّل.'],
  'ceoI.empty': ['Nothing here yet', 'مفيش حاجة لحد دلوقتي'],
  'ceoI.emptyHint': ['New entries will show up here.', 'الجديد هيظهر هنا.'],
  'ceoI.retry': ['Try again', 'جرّب تاني'],
  'ceoI.refresh': ['Refresh', 'حدّث'],

  // ── Users: role + status filters, role-change confirm ──
  'ceoI.roleFilter': ['Role', 'الدور'],
  'ceoI.statusFilter': ['Status', 'الحالة'],
  'ceoI.changeRoleTitle': ['Change user role?', 'نغيّر صلاحية المستخدم؟'],
  'ceoI.takesEffect': ['This change takes effect immediately.', 'التغيير ده بيطبّق فورًا.'],

  // ── Units: bathrooms + floor plan, row editing, bulk actions ──
  'ceoI.bathrooms': ['Bathrooms', 'الحمّامات'],
  'ceoI.floorPlan': ['Floor plan URL', 'رابط مخطط الوحدة'],
  'ceoI.selected': ['selected', 'محدد'],
  'ceoI.selectAll': ['Select all', 'حدد الكل'],
  'ceoI.bulkActions': ['Bulk actions', 'إجراءات جماعية'],
  'ceoI.applyStatus': ['Apply status', 'طبّق الحالة'],
  'ceoI.deleteUnits': ['Delete units', 'مسح الوحدات'],
  'ceoI.bulkDone': ['Bulk update done', 'تم التحديث الجماعي'],

  // ── Pricing: summary stats + bulk update ──
  'ceoI.avgPerSqm': ['Avg price / m²', 'متوسط سعر المتر'],
  'ceoI.totalValue': ['Total value', 'إجمالي القيمة'],
  'ceoI.bulkUpdate': ['Bulk update price', 'تحديث جماعي للسعر'],
  'ceoI.updateMode': ['Update mode', 'طريقة التحديث'],
  'ceoI.modePercentage': ['Percentage (%)', 'نسبة مئوية (%)'],
  'ceoI.modeFixed': ['Fixed amount (EGP)', 'مبلغ ثابت (جنيه)'],
  'ceoI.changeValue': ['Change value', 'قيمة التغيير'],
  'ceoI.changeHint': ['e.g. 10 or -5', 'مثال: 10 أو -5'],
  'ceoI.previewAffected': ['Units affected', 'الوحدات المتأثرة'],
  'ceoI.previewCurrent': ['Current total', 'الإجمالي الحالي'],
  'ceoI.previewNew': ['New total', 'الإجمالي الجديد'],
  'ceoI.previewDiff': ['Difference', 'الفرق'],
  'ceoI.confirmUpdate': ['Confirm update', 'تأكيد التحديث'],
  'ceoI.bulkPricesDone': ['Prices updated', 'تم تحديث الأسعار'],
  'ceoI.confirmPriceTitle': ['Confirm price change?', 'نأكّد تغيير السعر؟'],
});
