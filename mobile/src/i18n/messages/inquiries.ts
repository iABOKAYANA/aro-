import { defineMessages } from '../define';

/**
 * Buyer-facing inquiry tracking — `GET /api/inquiries`, scoped to the caller
 * by the server. Owned by the inquiries screen; add keys here, nowhere else.
 */
export const inquiries = defineMessages({
  'inquiries.title': ['My inquiries', 'استفساراتي'],
  'inquiries.loading': ['Loading your inquiries…', 'جاري تحميل استفساراتك…'],
  'inquiries.empty': ['No inquiries yet', 'مفيش استفسارات لسه'],
  'inquiries.emptyHint': [
    'Ask about a property and the conversation starts here.',
    'اسأل عن عقار والمحادثة هتبدأ من هنا.',
  ],
  'inquiries.countOne': ['inquiry', 'استفسار'],
  'inquiries.countMany': ['inquiries', 'استفسار'],
  'inquiries.sent': ['Sent', 'اتبعت'],
  'inquiries.aboutProject': ['About', 'عن'],
  'inquiries.message': ['Message', 'الرسالة'],
  'inquiries.reply': ['Reply', 'رد'],
  'inquiries.noReply': ['No reply yet', 'مفيش رد لسه'],
  'inquiries.newInquiry': ['Ask about this property', 'اسأل عن العقار ده'],
  'inquiries.failed': ['Could not send your inquiry', 'مقدرناش نبعت الاستفسار'],
  'inquiries.openProject': ['Open property', 'افتح العقار'],
  'inquiries.browse': ['Ask about a property', 'اسأل عن عقار'],
  'inquiries.search': ['Search inquiries…', 'دوّر في الاستفسارات…'],
  'inquiries.call': ['Call', 'اتصل'],
  'inquiries.email': ['Email', 'إيميل'],
  'inquiries.regarding': ['Regarding', 'بخصوص'],
  'inquiries.source': ['Source', 'المصدر'],
});
