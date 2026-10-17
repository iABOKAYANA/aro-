import { defineMessages } from '../define';

/**
 * Strings shared by the UI kit (`src/components/ui.tsx`) and the tab bar —
 * the chrome every screen renders, so it lives in one namespace instead of
 * being duplicated into each screen's table.
 *
 * Egyptian colloquial, matching the tone of the website's Arabic copy
 * (`'common.noResults': 'مفيش نتائج'`), not formal MSA.
 */
export const common = defineMessages({
  'common.appName': ['GHAYA', 'غيّا'],
  'common.retry': ['Try again', 'جرب تاني'],
  'common.cancel': ['Cancel', 'إلغاء'],
  'common.save': ['Save', 'حفظ'],
  'common.delete': ['Delete', 'حذف'],
  'common.close': ['Close', 'إغلاق'],
  'common.confirm': ['Confirm', 'تأكيد'],
  'common.apply': ['Apply', 'تطبيق'],
  'common.clear': ['Clear', 'مسح'],
  'common.clearAll': ['Clear all', 'مسح الكل'],
  'common.search': ['Search…', 'دوّر…'],
  'common.loading': ['Loading…', 'جاري التحميل…'],
  'common.error': ['Something went wrong.', 'حاجة مش مظبوطة.'],
  'common.noResults': ['No results found', 'مفيش نتائج'],
  'common.saving': ['Saving…', 'جاري الحفظ…'],
  'common.status': ['Status', 'الحالة'],
  'common.type': ['Type', 'النوع'],
  'common.date': ['Date', 'التاريخ'],
  'common.all': ['All', 'الكل'],
  'common.none': ['None', 'لا يوجد'],
  'common.yes': ['Yes', 'أيوه'],
  'common.no': ['No', 'لأ'],
  'common.back': ['Back', 'رجوع'],
  'common.more': ['More', 'المزيد'],
  'common.open': ['Open', 'فتح'],
  'common.actions': ['Actions', 'إجراءات'],
  'common.notes': ['Notes', 'ملاحظات'],
  'common.phone': ['Phone', 'التليفون'],
  'common.email': ['Email', 'البريد الإلكتروني'],
  'common.name': ['Name', 'الاسم'],
  'common.project': ['Project', 'مشروع'],
  'common.unit': ['Unit', 'وحدة'],
  'common.broker': ['Broker', 'وسيط'],
  'common.developer': ['Developer', 'مطوّر'],
  'common.price': ['Price', 'السعر'],
  'common.area': ['Area', 'المساحة'],
  'common.created': ['Received', 'تاريخ الاستلام'],
  'common.updated': ['Updated', 'آخر تحديث'],
  'common.showingFirst': ['showing first', 'عرض أول'],
  'common.of': ['of', 'من'],
  'common.prev': ['‹ Prev', '‹ السابق'],
  'common.next': ['Next ›', 'التالي ›'],

  // Theme switcher — labels mirror the website's theme menu in the navbar
  'common.theme': ['Theme', 'المظهر'],
  'common.themeLight': ['Light', 'فاتح'],
  'common.themeDark': ['Dark', 'غامق'],
  'common.themeSystem': ['System', 'النظام'],

  // Tab bar
  'tab.home': ['Home', 'الرئيسية'],
  'tab.explore': ['Explore', 'استكشف'],
  'tab.leads': ['Leads', 'العملاء المحتملون'],
  'tab.deals': ['Deals', 'الصفقات'],
  'tab.saved': ['Saved', 'المحفوظات'],
  'tab.tools': ['Tools', 'أدوات'],
  'tab.manage': ['Manage', 'الإدارة'],

  // Shared verbs used across list screens
  'action.add': ['Add', 'إضافة'],
  'action.edit': ['Edit', 'تعديل'],
  'action.send': ['Send', 'إرسال'],
  'action.markRead': ['Mark as read', 'تحديد كمقروء'],

  // Global WhatsApp FAB — accessibility fallback when the server sends no label.
  'common.whatsappChat': ['Chat on WhatsApp', 'كلّمنا واتساب'],
});
