import { defineMessages } from '../define';

// 360° virtual tours. Owned by the panorama feature.
export const pano = defineMessages({
  'pano.title': ['Virtual tour', 'جولة افتراضية'],
  'pano.empty': ['No panorama to show', 'مفيش بانوراما تتعرض'],
  'pano.emptyHint': [
    'This tour has no 360° image attached yet.',
    'الجولة دي مفيهاش صورة 360° لسه.',
  ],
  'pano.failed': ['Could not load the 360° image', 'مقدرناش نحمّل صورة الـ360°'],
  'pano.failedHint': [
    'Check your connection or try another panorama.',
    'اتأكد من النت أو جرّب بانوراما تانية.',
  ],
  'pano.hint': ['Drag to look around · pinch to zoom', 'اسحب عشان تبص حواليك · قرّب بصوابعك'],
  'pano.loading': ['Loading 360° tour…', 'بنحمّل جولة الـ360°…'],
  'pano.openImage': ['Open image', 'افتح الصورة'],
  'pano.openBrowser': ['Open in browser', 'افتح في المتصفح'],
  'pano.invalid': ['Panorama link is not valid', 'لينك البانوراما مش سليم'],
  'pano.invalidHint': [
    'This tour link looks broken. Ask for a fresh link that starts with https://.',
    'شكل لينك الجولة دي بايظ. اطلب لينك جديد بيبدأ بـ https://.',
  ],
  'pano.staticHint': ['Static preview — pinch to zoom', 'معاينة ثابتة — قرّب بصوابعك'],
  'pano.expoGoNote': [
    'The interactive 360° viewer needs a dev build — showing the panorama as a photo here.',
    'عارض الـ360° التفاعلي محتاج نسخة dev — عارضين البانوراما كصورة هنا.',
  ],
  'pano.gaveUpNote': [
    'The interactive viewer kept failing — showing the panorama as a photo instead.',
    'عارض الـ360° عطل أكتر من مرة — عارضين البانوراما كصورة بدلها.',
  ],
  'pano.viewTour': ['Take the 360° virtual tour', 'اتفرج على جولة الـ360°'],
  'pano.viewTourHint': ['Drag to look around the project', 'لف وبص على المشروع من كل حتة'],
});
