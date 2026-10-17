// Shared city imagery: one home for the landmark map so every screen that
// renders city cards imports it instead of copying URLs around.

export type FallbackCity = { name: string; nameArabic: string; slug: string };

// Same fallback row the website's ExploreLocations tops up with, so the home
// never renders an empty strip on a fresh database.
export const FALLBACK_CITIES: FallbackCity[] = [
  { name: 'New Cairo', nameArabic: 'القاهرة الجديدة', slug: 'new-cairo' },
  { name: 'Sheikh Zayed', nameArabic: 'الشيخ زايد', slug: 'sheikh-zayed' },
  { name: 'Fifth Settlement', nameArabic: 'التجمع الخامس', slug: 'fifth-settlement' },
];

// Famous-landmark photo per area (freely licensed CC BY / CC BY-SA images via
// Wikimedia Commons thumbnails, 640px). Keyed by city slug, exact match only.
// Render priority per card: api image → landmark → project cover → neutral
// block, and a dead URL removes itself via onError (see the city card below).
//
// Real-slug keys first (match the cities the API actually classifies); legacy
// aliases kept below so old slugs still resolve instead of dropping to cover.
export const LANDMARK_IMAGES: Record<string, string> = {
  // ── Real slugs ────────────────────────────────────────────────
  // العاصمة الإدارية — البرج الأيقوني
  'new-capital-city': 'https://upload.wikimedia.org/wikipedia/commons/8/81/Iconic_Tower_Egypt%2818-6-2023%29%28cropped%29.jpg',
  // 6 أكتوبر — مول العرب
  '6th-of-october-city': 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Mall_of_Arabia.jpg',
  // العلمين — مارينا العلمين
  'al-alamein': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Marina_El_Alamein%2C_Markaz_Al_Alamein%2C_Matrouh_Governorate%2C_Egypt_-_panoramio_%281%29.jpg',
  // رأس الحكمة / سيدي عبد الرحمن / سيدي حنيش / الضبعة / الحمام — ساحل شمالي
  'ras-el-hekma': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  'sidi-abdel-rahman': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  'sidi-heneish': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  'al-dabaa': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  'el-hamam': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  // زايد الجديدة — القرية الذكية
  'new-zayed': 'https://upload.wikimedia.org/wikipedia/commons/1/14/Telecom_Egypt_Smart_Village_building_2.jpg',
  // الشروق / القاهرة — الجامعة الأمريكية (التجمع)
  'el-shorouk': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/AUC_New_Campus.jpg',
  cairo: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/AUC_New_Campus.jpg',
  // البحر الأحمر (الجونة / سهل حشيش / مكادي / سوما باي) + السخنة / رأس سدر
  'el-gouna': 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  'sahl-hasheesh': 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  makadi: 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  somabay: 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  'ras-sudr': 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  // ── Legacy aliases (harmless, keep resolving) ─────────────────
  'new-capital': 'https://upload.wikimedia.org/wikipedia/commons/8/81/Iconic_Tower_Egypt%2818-6-2023%29%28cropped%29.jpg',
  'administrative-capital': 'https://upload.wikimedia.org/wikipedia/commons/8/81/Iconic_Tower_Egypt%2818-6-2023%29%28cropped%29.jpg',
  // القاهرة الجديدة / التجمع — الجامعة الأمريكية
  'new-cairo': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/AUC_New_Campus.jpg',
  'fifth-settlement': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/AUC_New_Campus.jpg',
  // الشيخ زايد — القرية الذكية
  'sheikh-zayed': 'https://upload.wikimedia.org/wikipedia/commons/1/14/Telecom_Egypt_Smart_Village_building_2.jpg',
  zayed: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Telecom_Egypt_Smart_Village_building_2.jpg',
  // الساحل الشمالي — بورتو مارينا
  'north-coast': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  sahel: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Porto_Marina_%28El_Alamein%29.jpg',
  // العلمين الجديدة — مارينا العلمين
  'new-alamein': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Marina_El_Alamein%2C_Markaz_Al_Alamein%2C_Matrouh_Governorate%2C_Egypt_-_panoramio_%281%29.jpg',
  alamein: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Marina_El_Alamein%2C_Markaz_Al_Alamein%2C_Matrouh_Governorate%2C_Egypt_-_panoramio_%281%29.jpg',
  // العين السخنة — شاطئ السخنة
  'ain-sokhna': 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  sokhna: 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  'el-sokhna': 'https://upload.wikimedia.org/wikipedia/commons/7/79/Ain_Sokhna_banner.jpg',
  // 6 أكتوبر — مول العرب
  '6th-october': 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Mall_of_Arabia.jpg',
  'sixth-october': 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Mall_of_Arabia.jpg',
  october: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Mall_of_Arabia.jpg',
};

export function slugifyCityName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  return slug || undefined;
}

export function landmarkForSlug(slug?: string | null): string | undefined {
  if (!slug) return undefined;
  return LANDMARK_IMAGES[slug.toLowerCase().trim()];
}

/** City landmark by `nameSlug` first, slugified English name second. */
export function landmarkForCity(
  city?: { nameSlug?: string | null; name?: string | null } | null
): string | undefined {
  if (!city) return undefined;
  return (
    landmarkForSlug(city.nameSlug) ??
    (city.name ? landmarkForSlug(slugifyCityName(city.name)) : undefined)
  );
}
