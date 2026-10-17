import { defineMessages } from '../define';

// "All areas with projects" directory — every city that has projects in one
// place, with its project count, linking to filtered projects. Owned by that
// feature; the Area Guide (`areas.*`) stays the services-facts screen.
export const locations = defineMessages({
  'locations.title': ['All areas', 'كل المناطق'],
  'locations.subtitle': [
    'Every area with projects in one place — pick one to see its homes',
    'كل حتة فيها مشاريع في مكان واحد — اختار المنطقة وشوف البيوت اللي فيها',
  ],
  'locations.loading': ['Loading areas…', 'بنحمّل المناطق…'],
  'locations.empty': ['No areas yet', 'لسه مفيش مناطق'],
  'locations.emptyHint': [
    'Areas show up here once projects are listed.',
    'المناطق هتظهر هنا أول ما يبقى فيه مشاريع معروضة.',
  ],
  'locations.browse': ['Browse projects', 'اتفرج على المشاريع'],
  'locations.projectsCount': ['{n} projects', '{n} مشروع'],
  'locations.startingFrom': ['Starting from', 'الأسعار بتبدأ من'],
  'locations.noPrice': ['No price info yet', 'لسه مفيش سعر معلن'],
  'locations.guideCta': [
    'Want services info too? Open the area guide',
    'عايز تعرف خدمات المنطقة كمان؟ افتح دليل المناطق',
  ],
  'locations.photoCredit': ['Landmark photos: Wikimedia Commons', 'صور المعالم: ويكيميديا كومنز'],
  'locations.regionsTitle': ['Browse by region', 'دوّر حسب المنطقة'],
  'locations.clearFilter': ['Show all cities', 'اعرض كل المدن'],
  'locations.unassigned': [
    '{n} projects outside classified areas',
    'مشروع {n} بره المناطق المصنفة',
  ],
});
