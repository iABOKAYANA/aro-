import { defineMessages } from '../define';

// Filled in by the screens that own this namespace (`(tabs)/saved.tsx` and
// `compare.tsx`).
export const saved = defineMessages({
  // Saved tab
  'saved.loading': ['Loading your saves…', 'جاري تحميل محفوظاتك…'],
  'saved.cantUpdateAlerts': ['Could not update alerts', 'مقدرتش أحدّث التنبيهات'],
  'saved.cantDelete': ['Could not delete', 'مقدرتش أحذف'],
  'saved.cantRemove': ['Could not remove', 'مقدرتش أشيل'],

  'saved.searches': ['Searches', 'عمليات البحث'],
  'saved.searchesHint': ['Your old filters — open one to see its homes again', 'الفلاتر القديمة بتاعتك — افتح واحدة عشان تشوف بيوتها تاني'],
  'saved.projects': ['Projects', 'المشاريع'],
  'saved.projectsHint': ['Projects you saved on this phone — tap to open', 'المشاريع اللي حفظتها على الموبايل ده — دوس عشان تفتحها'],
  'saved.favorites': ['Favorites', 'المفضلة'],
  'saved.favoritesHint': ['Single homes you hearted — tap to open', 'الشقق اللي علمت عليها قلب — دوس عشان تفتحها'],
  'saved.watching': ['Watching', 'اللي بتابعه'],
  'saved.watchingHint': ['Homes you watch — we tell you when the price changes', 'البيوت اللي بتراقبها — هنقولّك لما السعر يتغير'],
  'saved.compareProjects': ['Compare projects', 'قارن المشاريع'],

  // "View results" — re-runs a saved search in the Explore tab
  'saved.viewResults': ['Show matching homes', 'شوف البيوت المطابقة'],

  'saved.noSearches': ['No saved searches', 'مفيش عمليات بحث محفوظة'],
  'saved.noSearchesHint': [
    'Save a search from Explore and we will watch the market for you — you can get alerted when a new project matches.',
    'احفظ بحث من صفحة الاستكشاف وإحنا هنراقبلك السوق — وتوصلك تنبيه أول ما يظهر مشروع جديد يطابق بحثك.',
  ],
  'saved.savedSearches': ['Saved searches', 'عمليات البحث المحفوظة'],
  'saved.matches': ['matching homes', 'بيوت مطابقة'],
  'saved.alertNew': ['Tell me when a matching home appears', 'قولّي أول ما يظهر بيت مطابق'],

  'saved.noProjects': ['No saved projects', 'مفيش مشروعات محفوظة'],
  'saved.noProjectsHint': [
    'Open any project and tap “Save this project”. The list is kept on this device, so it is there when you come back.',
    'افتح أي مشروع واضغط “احفظ المشروع”. القائمة متحفظة على الموبايل، فتلاقيها موجودة لما ترجع تاني.',
  ],
  'saved.exploreProjects': ['Explore projects', 'استكشف المشاريع'],
  'saved.savedProjects': ['Saved projects', 'المشاريع المحفوظة'],

  'saved.noFavorites': ['No favorites yet', 'مفيش مفضلة لسه'],
  'saved.noFavoritesHint': [
    'Units you favourite while browsing will collect here.',
    'الوحدات اللي بتحطها في المفضلة وهي بتتصفح هتتجمع هنا.',
  ],

  // Watching tab (`GET /api/watch`)
  'saved.noWatching': ['Nothing watched yet', 'مفيش حاجة بتتابعها لسه'],
  'saved.noWatchingHint': [
    'Tap “Watch for price changes” on any unit and it lands here — we will tell you the moment its price or availability changes.',
    'اضغط “تابع تغييرات السعر” على أي وحدة وهي هتتجمع هنا — وإحنا هنقولك أول ما السعر أو التوفر يتغيّر.',
  ],
  'saved.alertsOn': ['Alerts on', 'التنبيهات شغالة'],
  'saved.muted': ['Muted', 'موقوفة'],
  'saved.noLongerListed': ['No longer listed', 'مش معروض تاني'],
  'saved.lastAlert': ['Last alert', 'آخر تنبيه'],

  // City follows (`POST /api/watch { targetType: 'CITY', targetId: slug }`) —
  // one row per followed city in the Watching tab.
  'saved.city': ['City', 'المدينة'],
  'saved.cityHint': ['New projects landing in this city', 'المشاريع الجديدة اللي نازلة في المدينة دي'],
  'saved.newProjects': ['new projects here', 'مشاريع جديدة هنا'],
  'saved.viewCity': ['Show city projects', 'شوف مشاريع المدينة'],
  'saved.unfollowCity': ['Unfollow city', 'بطل تتابع المدينة'],
  'saved.followedAt': ['Following since', 'بتتابعها من'],

  // Filter chip labels (`describeFilters`) — one chip per stored filter,
  // the same list the website prints under each saved search.
  'saved.filterKeyword': ['Keyword', 'الكلمة المفتاحية'],
  'saved.filterGovernorate': ['Governorate', 'المحافظة'],
  'saved.filterCity': ['City', 'المدينة'],
  'saved.filterDistrict': ['District', 'الحي'],
  'saved.filterType': ['Type', 'النوع'],
  'saved.filterListing': ['Listing', 'نوع العرض'],
  'saved.filterMinPrice': ['Min price', 'أقل سعر'],
  'saved.filterMaxPrice': ['Max price', 'أعلى سعر'],
  'saved.filterBedrooms': ['Bedrooms', 'غرف النوم'],
  'saved.filterBathrooms': ['Bathrooms', 'دورات المياه'],
  'saved.filterMinArea': ['Min area', 'أقل مساحة'],
  'saved.filterMaxArea': ['Max area', 'أكبر مساحة'],

  // Filter chip summary (`describeFilters`)
  'saved.filters': ['filters', 'فلاتر'],
  'saved.all': ['all', 'الكل'],

  // Compare screen
  'saved.compare': ['Compare', 'قارن'],
  'saved.building': ['Building comparison…', 'جاري تجهيز المقارنة…'],
  'saved.remove': ['Remove', 'إزالة'],
  'saved.nothingToCompare': ['Nothing to compare yet', 'مفيش حاجة تقارنها لسه'],
  'saved.pickUpTo': ['Pick up to', 'اختار لحد'],
  'saved.pickUpToRest': [
    'projects — search below, or add them from any project page.',
    'مشروعات — دوّر تحت أو ضيفهم من أي صفحة مشروع.',
  ],
  'saved.searchToAdd': ['Search a project to add…', 'دوّر على مشروع تضيفه…'],
  'saved.comparisonFull': ['Comparison is full', 'المقارنة مليانة'],
  'saved.tapToAdd': ['Tap to add', 'اضغط عشان تضيف'],
  'saved.full': ['Full', 'ممتلئ'],

  'saved.attribute': ['Attribute', 'البيان'],
  'saved.to': ['To', 'إلى'],
  'saved.perSqm': ['Per m²', 'للمتر المربع'],
  'saved.downPayment': ['Down payment', 'المقدم'],
  'saved.installments': ['Installments', 'أقساط'],
  'saved.yrs': ['yrs', 'سنة'],
  'saved.compound': ['Compound', 'الكمباوند'],
  'saved.location': ['Location', 'الموقع'],

  'saved.cantLoad': ['Could not load those projects', 'مقدرتش أحمّل المشروعات دي'],
  'saved.cantLoadHint': [
    'Try removing one and adding it again.',
    'جرب تشيل واحدة وتضيفها تاني.',
  ],
  'saved.exploreMore': ['Explore more projects', 'استكشف مشروعات تانية'],
});
