import { defineMessages } from '../define';

/**
 * Natural-language ("Ayn") search — the mobile counterpart of the website's
 * `/ai-tools/search`, backed by `POST /api/ai/search`.
 * Owned by the ai-search screen; add keys here, nowhere else.
 */
export const aiSearch = defineMessages({
  'aiSearch.title': ['AI search', 'بحث بالذكاء الاصطناعي'],
  'aiSearch.subtitle': [
    'Describe what you are looking for and let Ayn find it.',
    'وصف اللي بتدور عليه وسيبي عين تلاقيه.',
  ],
  'aiSearch.understandsHint': [
    'Write normally — Ayn understands budget, place, rooms and type in Arabic or English.',
    'اكتب عادي — عين بيفهم الميزانية والمكان والأوض والنوع بالعربي أو الإنجليزي.',
  ],
  'aiSearch.saveHint': [
    'Save keeps these filters and alerts you when new matches arrive.',
    'الحفظ بيحتفظ بالشروط دي وبينبهك لما تنزل حاجات جديدة مناسبة.',
  ],
  'aiSearch.placeholder': [
    'A 3-bedroom villa in New Cairo under 8 million…',
    'فيلا 3 غرف في القاهرة الجديدة أقل من 8 مليون…',
  ],
  'aiSearch.submit': ['Search', 'دوّر'],
  'aiSearch.searching': ['Looking through the listings…', 'جاري البحث في العروض…'],
  'aiSearch.examples': ['Try one of these', 'جرب واحدة من دول'],
  'aiSearch.example1': [
    'Apartments in Sheikh Zayed up to 3 million',
    'شقق في الشيخ زايد حتى 3 مليون',
  ],
  'aiSearch.example2': [
    'Compounds delivering in 2026',
    'كمباوندات تسليم 2026',
  ],
  'aiSearch.example3': [
    'Penthouses with a sea view',
    'بنتهاوس بإطلالة بحرية',
  ],
  'aiSearch.understood': ['I understood this as', 'فهمت المطلوب إنه'],
  'aiSearch.confidence': ['Confidence', 'درجة الثقة'],
  'aiSearch.warnings': ['Worth knowing', 'محتاج تعرف'],
  'aiSearch.results': ['Results', 'النتائج'],
  'aiSearch.noResults': ['Nothing matched that', 'مفيش حاجة مطابقة'],
  'aiSearch.noResultsHint': [
    'Try loosening the budget or the location — Ayn only shows real listings.',
    'جرّب توسّع في الميزانية أو المنطقة — عين بيعرض حاجات حقيقية بس.',
  ],
  'aiSearch.empty': ['What are you looking for?', 'إيه اللي بتدور عليه؟'],
  'aiSearch.emptyHint': [
    'Write it in your own words. Ayn reads the real catalogue and never invents a property.',
    'اكتبها براحتك. عين بيقرأ الكتالوج الحقيقي ومش بيخترع عقارات.',
  ],
  'aiSearch.unavailable': ['Search is unavailable right now', 'البحث مش متاح دلوقتي'],
  'aiSearch.unavailableHint': [
    'The assistant could not reach the server. Pull down to try again.',
    'المساعد مش قدر يتواصل مع السيرفر. اسحب لتحت عشان تجرب تاني.',
  ],
  'aiSearch.openProject': ['Open project', 'افتح المشروع'],
  'aiSearch.followUp': ['Ask about these', 'اسأل عن دول'],
  'aiSearch.saveSearch': ['Save this search', 'احفظ البحث ده'],
  'aiSearch.saved': ['Saved — we will alert you on new matches', 'اتحفظ — هننبهك على نتايج جديدة'],
  'aiSearch.saveFailed': ['Could not save this search', 'مقدرناش نحفظ البحث'],

  // "I understood this as" — labels around `explanation` / `extractedFilters`
  'aiSearch.filterBudget': ['Budget', 'الميزانية'],
  'aiSearch.filterLocation': ['Location', 'الموقع'],
  'aiSearch.filterBedrooms': ['Bedrooms', 'غرف النوم'],
  'aiSearch.filterType': ['Property type', 'نوع العقار'],
  'aiSearch.filterListing': ['Listing', 'نوع العرض'],
  'aiSearch.filterDelivery': ['Delivery', 'التسليم'],
  'aiSearch.upTo': ['up to', 'حتى'],
  'aiSearch.fromPrice': ['From', 'تبدأ من'],
  'aiSearch.beds': ['beds', 'غرف نوم'],
  'aiSearch.amenities': ['Amenities', 'المرافق'],

  // Result sections
  'aiSearch.projects': ['Matching projects', 'مشاريع مطابقة'],
  'aiSearch.units': ['Matching units', 'وحدات مطابقة'],

  // Vocabulary the extractor hands back — every value it can produce, so the
  // chip reads in the user's language instead of echoing a database enum.
  'aiSearch.type.APARTMENT': ['Apartment', 'شقة'],
  'aiSearch.type.VILLA': ['Villa', 'فيلا'],
  'aiSearch.type.TOWNHOUSE': ['Townhouse', 'تاون هاوس'],
  'aiSearch.type.PENTHOUSE': ['Penthouse', 'بنتهاوس'],
  'aiSearch.type.STUDIO': ['Studio', 'استوديو'],
  'aiSearch.type.DUPLEX': ['Duplex', 'دوبلكس'],
  'aiSearch.type.CHALET': ['Chalet', 'شاليه'],
  'aiSearch.type.COMMERCIAL': ['Commercial', 'تجاري'],

  'aiSearch.list.SALE': ['For sale', 'للبيع'],
  'aiSearch.list.RENT': ['For rent', 'للإيجار'],
  'aiSearch.list.RESALE': ['Resale', 'إعادة بيع'],
  'aiSearch.list.INSTALLMENT': ['Installments', 'بالتقسيط'],

  'aiSearch.delivery.delivered': ['Delivered', 'تم التسليم'],
  'aiSearch.delivery.underConstruction': ['Under construction', 'تحت الإنشاء'],
});
