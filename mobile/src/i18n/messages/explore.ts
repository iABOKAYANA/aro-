import { defineMessages } from '../define';

export const explore = defineMessages({
  'explore.projects': ['Projects', 'المشاريع'],
  'explore.units': ['Units', 'الوحدات'],
  'explore.searchProjects': ['Search projects, areas, developers…', 'دوّر في المشاريع والمناطق والمطورين…'],
  'explore.searchUnits': ['Search units, types, numbers…', 'دوّر في الوحدات والأنواع والأرقام…'],
  'explore.searchHint': ['Type a place or project — the list below updates itself', 'اكتب مكان أو مشروع — القايمة اللي تحت هتتحدث لوحدها'],
  'explore.suggestEmpty': ['No matches — tap to see all results', 'مفيش حاجة مطابقة — دوس عشان تشوف كل النتائج'],
  'explore.filters': ['Filters', 'الفلاتر'],
  'explore.filtersActive': ['Filters', 'فلاتر'],
  'explore.filtersHint': ['These buttons narrow the list below — mix and match', 'الزراير دي بتصغّر القايمة اللي تحت — جرّب كذا واحد'],
  'explore.sort': ['Sort', 'الترتيب'],
  'explore.sortHint': ['Pick how the list below is ordered', 'اختار القايمة اللي تحت تترتب إزاي'],
  'explore.sortNewest': ['Newest', 'الأحدث'],
  'explore.sortPopular': ['Most viewed', 'الأكتر مشاهدة'],
  'explore.sortPriceAsc': ['Price ↑', 'السعر ↑'],
  'explore.sortPriceDesc': ['Price ↓', 'السعر ↓'],
  'explore.sortAreaAsc': ['Area ↑', 'المساحة ↑'],
  'explore.sortAreaDesc': ['Area ↓', 'المساحة ↓'],

  'explore.type': ['Home type', 'نوع البيت'],
  'explore.anyType': ['Any type', 'أي نوع'],
  'explore.bedrooms': ['Bedrooms', 'غرف النوم'],
  'explore.anyBedrooms': ['Any', 'أي عدد'],
  'explore.city': ['City', 'المدينة'],
  'explore.anyCity': ['All cities', 'كل المدن'],
  'explore.price': ['Price range', 'نطاق السعر'],
  'explore.anyPrice': ['Any price', 'أي سعر'],
  'explore.areaRange': ['Area (m²)', 'المساحة (م²)'],
  'explore.min': ['Min', 'من'],
  'explore.max': ['Max', 'إلى'],
  'explore.listing': ['Buy or rent', 'بيع ولا إيجار'],
  'explore.anyListing': ['Any', 'أي'],

  'explore.results': ['results', 'نتيجة'],
  'explore.noMatch': ['Nothing matched', 'مفيش نتائج'],
  'explore.noMatchHint': [
    'Nothing fits all of these together. Remove the price or bedroom filter first — or clear everything below.',
    'مفيش حاجة تناسب كل ده مع بعض. شيّل فلتر السعر أو عدد الأوض الأول — أو امسح كله من تحت.',
  ],
  'explore.clearAndShowAll': ['Clear everything & show all', 'امسح كله وشوف كل حاجة'],
  'explore.noProjectsYet': ['No projects to show yet.', 'مفيش مشاريع لعرضها لسه.'],
  'explore.from': ['from', 'ابتداءً من'],

  // "Save this search" — `POST /api/saved-searches`, same as the site's button
  'explore.saveSearch': ['Save these filters & get alerts', 'احفظ الفلاتر دي وهيوصلك تنبيه'],
  'explore.saveSearchHint': [
    'We watch the market and tell you when a matching home appears.',
    'هنراقب السوق ونقولّك أول ما يظهر بيت مناسب.',
  ],
  'explore.searchSaved': ['Saved — alerts on', 'اتحفظ — التنبيهات شغالة'],
  'explore.saveSearchNote': [
    'Saved — we will alert you about new matches.',
    'اتحفظ — وهننبّيك أول ما يظهر مشروع جديد يطابق بحثك.',
  ],
  'explore.saveSearchFailed': ['Could not save this search', 'مقدرتش أحفظ البحث ده'],
  'explore.manageAlerts': ['See my saved searches', 'شوف عمليات البحث المحفوظة'],

  // Free-form price inputs (the site's advanced filters take raw numbers)
  'explore.minPrice': ['Min price (EGP)', 'أقل سعر (ج.م)'],
  'explore.maxPrice': ['Max price (EGP)', 'أعلى سعر (ج.م)'],
  'explore.removeFilter': ['Remove this filter', 'شيل الفلتر ده'],

  // Fogg — inline compare nudge when the result set is small (2–6 items).
  'explore.compareNudge': [
    'Comparing clears up the differences —',
    'المقارنة هتوضح الفروق —',
  ],

  // Hick — the filter panel stays collapsed by default; Masri toggle label.
  'explore.moreFilters': ['More filters — narrow it down', 'فلاتر زيادة — ضيّقها على مزاجك'],

  // Project card — scan-and-compare data from src/components/projects/project-card.tsx
  'explore.new': ['New', 'جديد'],
  'explore.verified': ['Verified developer', 'مطوّر موثّق'],
  'explore.construction': ['Construction', 'الإنشاء'],
  'explore.compare': ['Compare', 'قارن'],
  'explore.added': ['Added', 'مضاف'],
  'explore.views': ['Views', 'مشاهدات'],
  'explore.favsCount': ['Saves', 'محفوظات'],

  // List/Map toggle — the map shows project pins with prices, tap → project page
  'explore.list': ['List', 'قايمة'],
  'explore.map': ['Map', 'خريطة'],
  'explore.mapHint': ['Tap a pin to open its project page', 'دوس على أي علامة عشان تفتح صفحة المشروع'],
  'explore.mapEmpty': ['No pins on the map', 'مفيش علامات على الخريطة'],
  'explore.mapEmptyHint': [
    'Nothing here has a location yet. Clear the filters and try again.',
    'مفيش حاجة ليها موقع هنا لسه. امسح الفلاتر وجرّب تاني.',
  ],
  'explore.exactPin': ['Exact project location', 'مكان المشروع بالظبط'],
  'explore.cityPin': ['Area location (approx.)', 'مكان تقريبي للمنطقة'],

  // Property / listing values (from the Prisma enums the API filters on)
  'prop.APARTMENT': ['Apartment', 'شقة'],
  'prop.VILLA': ['Villa', 'فيلا'],
  'prop.TOWNHOUSE': ['Townhouse', 'تاون هاوس'],
  'prop.PENTHOUSE': ['Penthouse', 'بنتهاوس'],
  'prop.STUDIO': ['Studio', 'استوديو'],
  'prop.DUPLEX': ['Duplex', 'دوبلكس'],
  'prop.CHALET': ['Chalet', 'شاليه'],
  'prop.LAND': ['Land', 'أرض'],
  'prop.COMMERCIAL': ['Commercial', 'تجاري'],
  'prop.ADMINISTRATIVE': ['Administrative', 'إداري'],
  'prop.MEDICAL': ['Medical', 'طبي'],

  'list.SALE': ['For sale', 'للبيع'],
  'list.RENT': ['For rent', 'للإيجار'],
  'list.RESALE': ['Resale', 'إعادة بيع'],
  'list.INSTALLMENT': ['Installment', 'بالتقسيط'],
});
