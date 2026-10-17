import { defineMessages } from '../define';

// Visitor reviews (project ratings from completed viewings).
// Owned by the reviews feature.
export const reviews = defineMessages({
  'rev.ceoTitle': ['Reviews moderation', 'مراجعة التقييمات'],
  // Project page section — mobile/src/app/project/[slug].tsx
  'rev.title': ['Visitor reviews', 'تقييمات الزوار'],
  'rev.empty': ['No visible reviews yet.', 'مفيش تقييمات ظاهرة دلوقتي.'],
  'rev.emptyHint': [
    'Be the first to rate after your visit.',
    'كن أول اللي يقيّم بعد الزيارة.',
  ],
  'rev.from5': ['out of 5', 'من 5'],
  'rev.rating': ['rating', 'تقييم'],
  'rev.ratings': ['ratings', 'تقييمات'],
  'rev.rateVisit': ['Rate your visit', 'قيّم زيارتك'],
  'rev.closeForm': ['Close the form', 'اقفل التقييم'],
  'rev.pickVisit': ['Pick the visit', 'اختار الزيارة'],
  'rev.pickOne': ['Pick…', 'اختار…'],
  'rev.commentHint': ['Tell us about the visit (optional)…', 'احكيلنا عن الزيارة (اختياري)…'],
  'rev.send': ['Send the rating', 'ابعت التقييم'],
  'rev.sending': ['Sending…', 'بيتبعت…'],
  'rev.sent': [
    'Thanks! Your rating was sent and will show after review.',
    'شكراً! تقييمك اتبعت وهيظهر بعد المراجعة.',
  ],
  'rev.sendFailed': ['Could not send your rating.', 'مقدرناش نبعت تقييمك.'],
  'rev.pickVisitFirst': ['Pick a visit and a star rating first.', 'اختار الزيارة وعدد النجوم الأول.'],
  'rev.signInHint': [
    'Sign in and complete a viewing to rate this project.',
    'سجّل دخول وخلّص معاينة عشان تقيّم المشروع ده.',
  ],
  // Viewings list — mobile/src/app/viewings.tsx
  'rev.rate': ['Rate', 'قيّم'],
  // CEO moderation — mobile/src/app/ceo/reviews.tsx
  'rev.pending': ['Pending', 'مستني'],
  'rev.approved': ['Approved', 'مقبول'],
  'rev.rejected': ['Rejected', 'مرفوض'],
  'rev.all': ['All', 'الكل'],
  'rev.none': ['No reviews here', 'مفيش تقييمات هنا'],
  'rev.noneHint': ['Nothing is waiting for moderation.', 'مفيش حاجة مستنية المراجعة.'],
  'rev.approve': ['Approve', 'اقبل'],
  'rev.reject': ['Reject', 'ارفض'],
  'rev.visitor': ['Visitor', 'زائر'],
});
