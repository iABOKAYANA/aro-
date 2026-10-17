import { defineMessages } from '../define';

// The comparison screen — split out of messages/saved.ts so the browse surface
// and the compare screen can be worked on without touching one shared file.
export const compare = defineMessages({
  'compare.title': ['Compare', 'قارن'],
  'compare.subtitle': ['Put projects side by side before you decide.', 'قارن المشاريع بجنب بعض قبل ما تقرر.'],
  'compare.loading': ['Loading…', 'بنحمّل…'],
  'compare.failed': ['Could not load the comparison.', 'مقدرناش نحمّل المقارنة.'],
  'compare.empty': ['Nothing to compare yet', 'مفيش حاجة للمقارنة لحد دلوقتي'],
  'compare.emptyHint': [
    'Add two or more projects and their specs will line up here.',
    'ضيف مشروعين أو أكتر وهتلاقي بياناتهم متراصّة جنب بعض هنا.',
  ],
  'compare.addProject': ['Add a project', 'ضيف مشروع'],
  'compare.searchPlaceholder': ['Search projects…', 'دوّر على مشروع…'],
  'compare.remove': ['Remove', 'شيل'],
  'compare.amenities': ['Amenities', 'المرافق'],
  'compare.noAmenities': ['No amenities listed', 'مفيش مرافق مكتوبة'],
  'compare.lowest': ['Lowest price', 'أقل سعر'],
  'compare.best': ['Best', 'أحسن'],
  'compare.rating': ['Rating', 'التقييم'],
  'compare.reviews': ['reviews', 'تقييم'],
  'compare.delivery': ['Delivery', 'التسليم'],
  'compare.propertyTypes': ['Property types', 'أنواع الوحدات'],
  'compare.paymentPlan': ['Payment plan', 'خطة السداد'],
  'compare.downPayment': ['Down payment', 'المقدم'],
  'compare.years': ['years', 'سنوات'],
  'compare.views': ['Views', 'المشاهدات'],
  'compare.price': ['Price', 'السعر'],
  'compare.units': ['Units', 'الوحدات'],
  'compare.location': ['Location', 'الموقع'],
  'compare.developer': ['Developer', 'المطور'],
  'compare.viewProject': ['View project', 'شوف المشروع'],

  // Empty-state picker — browses GET /api/projects?limit=40 for one-tap adds
  'compare.browse': ['Projects to add', 'مشروعات تضيفها'],
  'compare.browseHint': ['Tap a project to add it to the comparison.', 'اضغط على أي مشروع عشان تضيفه للمقارنة.'],
  'compare.loadingProjects': ['Loading projects…', 'بنحمّل المشروعات…'],
  'compare.searchDevelopers': ['Search projects or developers…', 'دوّر على مشروع أو مطوّر…'],

  // Comparison-table extras the website prints and the first pass missed
  'compare.highest': ['Highest price', 'أعلى سعر'],
  'compare.perSqm': ['Price / m²', 'السعر للمتر المربع'],
  'compare.installments': ['Installments', 'أقساط'],
  'compare.yrs': ['yrs', 'سنة'],
  'compare.downShort': ['down', 'مقدم'],
  'compare.lowestFlag': ['Lowest price shown', 'أقل سعر معروض'],
  'compare.bestFlag': ['BEST', 'الأفضل'],
  'compare.included': ['included', 'متاح'],
  'compare.disclaimer': [
    'Prices are stored in EGP. Your active display currency applies automatically.',
    'الأسعار متخزنة بالجنيه المصري، وعملتك المختارة بتظهر تلقائياً.',
  ],

  // Shareable comparison links — POST /api/compare/share, opened via ?token=
  'compare.share': ['Share', 'شيّر'],
  'compare.sharing': ['Creating link…', 'بنعمل اللينك…'],
  'compare.shareMessage': [
    'Look at this project comparison on GHAYA:',
    'بص على مقارنة المشاريع دي على غاية:',
  ],
  'compare.linkReady': [
    'Link ready — send it to family and get their take.',
    'اللينك جاهز — ابعتها لأهلك وخد رأيهم.',
  ],
  'compare.shareFailed': ['Could not make the link. Try again.', 'معرفناش نعمل اللينك. جرّب تاني.'],
  'compare.badLink': ['This shared link does not work', 'لينك المشاركة ده مش شغال'],
  'compare.badLinkHint': [
    'It may have been deleted. Pick projects below and keep comparing — nothing else broke.',
    'يمكن اتمسح. اختار مشاريع من تحت وكمّل مقارنة عادي — مفيش حاجة تانية بايظة.',
  ],
  'compare.sharedLoading': ['Loading the shared comparison…', 'بنحمّل المقارنة اللي اتبعتتلك…'],
});
