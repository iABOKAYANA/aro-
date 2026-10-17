import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const notifications = defineMessages({
  'notifications.title': ['Notifications', 'الإشعارات'],
  'notifications.loading': ['Loading notifications…', 'جاري تحميل الإشعارات…'],
  'notifications.markReadFailed': ['Could not mark as read', 'مقدرناش نحددها كمقروءة'],
  'notifications.markNRead': ['Mark {n} read', 'حدد {n} كمقروءة'],
  'notifications.unreadCount': ['{n} unread', '{n} غير مقروءة'],
  'notifications.allCaughtUp': ['All caught up', 'خلصنا، مفيش جديد'],
  'notifications.empty': ['No notifications', 'مفيش إشعارات'],
  'notifications.emptyHint': [
    'New leads, approvals and messages will appear here as they happen.',
    'العملاء الجدد والموافقات والرسايل هتظهر هنا أول ما توصل.',
  ],
  'notifications.new': ['New', 'جديد'],
  'notifications.unmapped': ['No app screen for this link yet', 'مفيش صفحة في التطبيق للينك ده لسه'],
  'notifications.markAll': ['Mark everything as read', 'حدد الكل كمقروء'],
});
