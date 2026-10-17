import { defineMessages } from '../define';

// Client ratings of brokers. Owned by that feature.
export const brate = defineMessages({
  'brate.title': ['Broker rating', 'تقييم الوسيط'],
  'brate.rateBroker': ['Rate your broker', 'قيّم الوسيط بتاعك'],
  'brate.rateHint': [
    'Sold! Tell us how your broker did on this deal.',
    'مبروك الصفقة! قولّنا الوسيط كان عامل إزاي معاك في البيعة دي.',
  ],
  'brate.pickStars': ['Pick a star rating', 'اختار عدد النجوم'],
  'brate.commentHint': [
    'Tell us about working with them (optional)…',
    'احكيلنا عن تعاملك معاه (اختياري)…',
  ],
  'brate.send': ['Send the rating', 'ابعت التقييم'],
  'brate.sending': ['Sending…', 'بيتبعت…'],
  'brate.sent': [
    'Thanks! Your rating was sent and will show after review.',
    'شكراً! تقييمك اتبعت وهيظهر بعد المراجعة.',
  ],
  'brate.sendFailed': ['Could not send your rating.', 'مقدرناش نبعت تقييمك.'],
  'brate.alreadyRated': [
    'This deal was already rated.',
    'الصفقة دي اتقيّمت قبل كده.',
  ],
  'brate.notEligible': [
    'Only the client of a sold deal can rate its broker.',
    'العميل بتاع الصفقة المباعة بس هو اللي يقدر يقيّم الوسيط.',
  ],
  'brate.myRating': ['My rating', 'تقييمي'],
  'brate.noReviews': ['No visible ratings yet', 'مفيش تقييمات ظاهرة لسه'],
  'brate.noReviewsHint': [
    'Approved client ratings will show here.',
    'تقييمات العملاء المقبولة هتظهر هنا.',
  ],
  'brate.from5': ['out of 5', 'من 5'],
  'brate.ratings': ['ratings', 'تقييمات'],
  'brate.client': ['Client', 'العميل'],
  'brate.moderationTitle': ['Broker ratings', 'تقييمات الوسطاء'],
  'brate.moderationHint': [
    'Client ratings waiting for review.',
    'تقييمات العملاء اللي مستنية المراجعة.',
  ],
  'brate.pending': ['Pending', 'مستني'],
  'brate.approved': ['Approved', 'مقبول'],
  'brate.rejected': ['Rejected', 'مرفوض'],
  'brate.approve': ['Approve', 'اقبل'],
  'brate.reject': ['Reject', 'ارفض'],
  'brate.nonePending': ['Nothing waiting', 'مفيش حاجة مستنية'],
  'brate.nonePendingHint': [
    'New client ratings will land here.',
    'تقييمات العملاء الجديدة هتوصل هنا.',
  ],
});
