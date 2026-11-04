/*
 * add-gardens.cjs — إضافة مشروع Gardens (العاصمة الإدارية — R8) إلى قاعدة بيانات الموقع.
 * المصدر الوحيد للبيانات: كيت البيع الرسمي (Gardens sales kit — sales version, Nov 2026).
 * لا يوجد أي رقم مخترع — لا وحدات (الاسم الوحيد المسجل بأسعار "من").
 * المطوّر: مودن مصر — Modon Egypt («مدن مصر للتطوير العقاري») — تأكيد المالك، Nov 2026.
 * Idempotent: تشغيله مرارًا بأمان (upsert).
 *
 * التشغيل على السيرفر:
 *   cd /opt/ghaya && DATABASE_URL="file:/opt/ghaya/prisma/prod.db" node scripts/add-gardens.cjs
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

/* ─── ثوابت من الكيت ─── */
const KIT_SOURCE = 'Gardens sales kit (sales version) — Nov 2026'
const SLUG = 'gardens-new-capital'
/* المطوّر: مودن مصر — Modon Egypt («مدن مصر للتطوير العقاري») — تأكيد المالك، نوفمبر 2026.
   ملاحظة صريحة: اسم المطوّر غير مذكور داخل الكيت نفسه — تأكد منه المالك.
   الأسعار/الخطط/أنواع الوحدات تظل مصدرها الكيت فقط. */
const DEVELOPER_VARIANTS = ['Modon Egypt', 'Modon Developments'] // نبدأ بالبروفيل الموجود في prod
const DEV_CREATE = { companyName: 'Modon Egypt', companyNameArabic: 'مدن مصر للتطوير العقاري', slug: 'modon-egypt' }

const IMG = (f) => `/images/projects/gardens-${f}.jpg`

const AR_DESC =
  'في قلب الحي السكني R8 بالعاصمة الإدارية الجديدة، وعلى مساحة تمتد إلى 232 فدانًا، يقدّم Gardens تجربة سكنية استثنائية، حيث تلتقي الخصوصية بجمال الطبيعة وتتكامل تفاصيل الحياة العصرية. صُمّم المشروع ليجعل المساحات المفتوحة والطبيعة حضورًا أساسيًا في كل تفاصيله: من الحدائق الخضراء الممتدة والبحيرات الهادئة إلى الإطلالات المميزة التي تتمتع بها الوحدات السكنية، لتصبح المساحات الخضراء والمسطحات المائية جزءًا من المشهد اليومي لكل منزل. ويضم Gardens مجموعة متنوعة من الوحدات السكنية، تتصدرها التاون هاوس و G-Villas والشقق المكونة من غرفتين وثلاث غرف نوم، في تخطيط عمراني يوازن بين الخصوصية والمساحات المفتوحة — مع إطلالات بانورامية على البرج الأيقوني وقاعة المؤتمرات، وموقع قريب من AUC ومدينتي وأوبرا مول المدينة.'

const EN_DESC =
  'An exceptional residential experience in the heart of the R8 residential district of the New Administrative Capital, on a sprawling 232-feddan footprint: town houses, G-villas and 2- and 3-bedroom apartments, where privacy meets the beauty of nature. Extended landscaped gardens, calm lakes and water surfaces are built into every detail of the master plan, giving all homes elevated views, with a location close to AUC, Madinaty, the Opera, the Conference Centre and the Iconic Tower.'

/* المرافق كما بالكيت — أسماء قاعدة المرافق الموجودة + 3 مرافق جديدة (بحيرات / بوتيك هوتل / بادل) */
const AMENITY_MAP = [
  // [name en (master key), nameArabic, icon, category, premium]
  ['Landscaped Gardens', 'حدائق منسقة', 'trees', 'LANDSCAPE', true],
  ['Swimming Pool', 'حمام سباحة', 'waves', 'LIFESTYLE', false],
  ['Gym', 'صالة رياضية', 'dumbbell', 'SPORTS', false],
  ['Club House', 'كلوب هاوس', 'building', 'LIFESTYLE', true],
  ['Retail Area', 'منطقة تجارية', 'shopping-bag', 'CONVENIENCE', false],
  ['Jogging Track', 'مسار جري', 'footprints', 'SPORTS', false],
  ['Tennis Court', 'ملعب تنس', 'circle-dot', 'SPORTS', false],
  ["Children's Play Area", 'منطقة ألعاب الأطفال', 'baby', 'LIFESTYLE', false],
  ['24/7 Security', 'أمن 24 ساعة', 'shield', 'SECURITY', false],
  ['CCTV', 'كاميرات مراقبة', 'camera', 'SECURITY', false],
  ['Lakes', 'بحيرات ومسطحات مائية', 'waves', 'LANDSCAPE', true],
  ['Boutique Hotel', 'بوتيك هوتل', 'building', 'LIFESTYLE', false],
  ['Padel Court', 'ملعب بادل', 'circle-dot', 'SPORTS', false],
]

async function main() {
  const now = new Date()
  const nowIso = now.toISOString()

  /* 1) مالك بروفايل المطوّر: مستخدم الإدارة (CEO) الموجود */
  const owner =
    (await db.user.findUnique({ where: { id: 'cmv86a0l600002skymmeejoi0' } })) ||
    (await db.user.findFirst({ where: { role: 'CEO' }, orderBy: { createdAt: 'asc' } }))
  if (!owner) throw new Error('No CEO/ADMIN user found to own the developer profile')

  /* 2) بروفايل المطوّر: «Modon Egypt / مدن مصر للتطوير العقاري» — موجود مسبقًا في prod
     فنستخدمه كما هو. fallback: 'Modon Developments' ثم إنشاء بسيط بملكية مستخدم CEO حر
     (حقل userId في البروفايلات unique — لا يملك مستخدم واحد أكثر من بروفايل). */
  let dev = await db.developerProfile.findFirst({ where: { companyName: DEVELOPER_VARIANTS[0] } })
  if (!dev) dev = await db.developerProfile.findFirst({ where: { companyName: DEVELOPER_VARIANTS[1] } })
  if (!dev) {
    const usedIds = (await db.developerProfile.findMany({ select: { userId: true } })).map((r) => r.userId)
    const freeUser = await db.user.findFirst({
      where: { role: { in: ['CEO', 'ADMIN'] }, id: { notIn: usedIds } },
      orderBy: { createdAt: 'asc' },
    })
    if (!freeUser) throw new Error('No free CEO/ADMIN user to own a new developer profile')
    dev = await db.developerProfile.create({ data: { userId: freeUser.id, ...DEV_CREATE } })
    console.log('CREATED developer profile: ' + DEV_CREATE.companyName + ' (owner: ' + freeUser.name + ')')
  }

  /* 3) التوطين: المحافظة / المدينة / الحي R8 (موجودون مسبقًا في prod) */
  const gov = await db.governorate.findFirst({ where: { name: 'Cairo' } })
  const city = await db.city.findFirst({ where: { name: 'New Capital City' } })
  let district = city
    ? await db.district.findFirst({ where: { cityId: city.id, name: { startsWith: 'R8' } } })
    : null
  if (!district) district = await db.district.findFirst({ where: { name: { startsWith: 'R8' } } })
  if (!city || !district) throw new Error('New Capital City / R8 district missing in prod DB')

  /* 4) بيانات أسعار كل حقل بمصدر الكيت (honest trust: DEVELOPER_PROVIDED — ليس VERIFIED) */
  const trust = {}
  const trustNotes = {
    price: 'أسعار البدء لكل نوع وحدة كما في كيت المبيعات الرسمي: تاون هاوس 10,900,000 · G-Villa 4,800,000 · شقة 3 غرف 3,900,000 · شقة غرفتين 3,100,000 ج.م',
    paymentPlan: 'مقدم 5% وأقساط حتى 8 سنوات — أو مقدم 10% وأقساط حتى 10 سنوات',
    delivery: 'مواعيد وشروط الاستلام غير مذكورة في الكيت — بانتظار بيانات رسمية',
    location: 'الحي السكني R8، العاصمة الإدارية الجديدة (كيت المبيعات) — لا إحداثيات منشورة في الموقع',
    amenities: 'المرافق والإطلالات كما في كيت المبيعات الرسمي',
  }
  for (const f of ['price', 'paymentPlan', 'delivery', 'location', 'amenities']) {
    trust[f] = { status: 'DEVELOPER_PROVIDED', source: KIT_SOURCE, note: trustNotes[f], updatedAt: nowIso }
  }

  /* 5) المشروع نفسه */
  const gallery = ['/images/projects/gardens-cover.jpg', '/images/projects/gardens-lakes.jpg', '/images/projects/gardens-masterplan.jpg', '/images/projects/gardens-townhouse.jpg', '/images/projects/gardens-gvilla.jpg', '/images/projects/gardens-apartments.jpg']

  const project = await db.project.upsert({
    where: { slug: SLUG },
    update: {
      developerId: dev.id,
      name: 'Gardens',
      nameArabic: 'جاردنز',
      tagline: 'Exceptional living in the heart of New Capital R8',
      taglineArabic: 'تجربة سكنية استثنائية في قلب R8 بالعاصمة الإدارية الجديدة',
      description: EN_DESC,
      descriptionArabic: AR_DESC,
      coverImage: IMG('cover'),
      gallery: JSON.stringify(gallery),
      governorateId: gov ? gov.id : null,
      cityId: city.id,
      districtId: district.id,
      address: 'R8 — الحي السكّني، العاصمة الإدارية الجديدة',
      propertyTypes: JSON.stringify(['APARTMENT', 'TOWNHOUSE', 'VILLA']),
      listingTypes: JSON.stringify(['SALE', 'INSTALLMENT']),
      status: 'UNDER_CONSTRUCTION',
      approvalStatus: 'PUBLISHED',
      startPrice: 3100000,
      endPrice: 10900000,
      downPaymentMin: 5,
      installmentYears: 10,
      metaTitle: 'كمبوند جاردنز Gardens | العاصمة الإدارية الجديدة R8 — الأسعار وخطط السداد',
      metaDescription: 'أسعار Gardens بالعاصمة الإدارية تبدأ من 3.1 مليون جنيه: شقق غرفتين وشقق 3 غرف وG-Villa وتاون هاوس في الحي السكني R8 — مقدم 5% حتى 8 سنوات أو مقدم 10% حتى 10 سنوات.',
      keywords: JSON.stringify(['Gardens', 'جاردنز', 'Gardens New Capital', 'جاردنز العاصمة الإدارية', 'كمبوند R8', 'جاردنز العاصمة الإدارية الجديدة']),
      dataTrust: JSON.stringify(trust),
      isActive: true,
      isVerified: false,
      publishedAt: now,
    },
    create: {
      developerId: dev.id,
      name: 'Gardens',
      nameArabic: 'جاردنز',
      slug: SLUG,
      tagline: 'Exceptional living in the heart of New Capital R8',
      taglineArabic: 'تجربة سكنية استثنائية في قلب R8 بالعاصمة الإدارية الجديدة',
      description: EN_DESC,
      descriptionArabic: AR_DESC,
      coverImage: IMG('cover'),
      gallery: JSON.stringify(gallery),
      governorateId: gov ? gov.id : null,
      cityId: city.id,
      districtId: district.id,
      address: 'R8 — الحي السكّني، العاصمة الإدارية الجديدة',
      propertyTypes: JSON.stringify(['APARTMENT', 'TOWNHOUSE', 'VILLA']),
      listingTypes: JSON.stringify(['SALE', 'INSTALLMENT']),
      status: 'UNDER_CONSTRUCTION',
      approvalStatus: 'PUBLISHED',
      publishedAt: now,
      startPrice: 3100000,
      endPrice: 10900000,
      downPaymentMin: 5,
      installmentYears: 10,
      metaTitle: 'كمبوند جاردنز Gardens | العاصمة الإدارية الجديدة R8 — الأسعار وخطط السداد',
      metaDescription: 'أسعار Gardens بالعاصمة الإدارية تبدأ من 3.1 مليون جنيه: شقق غرفتين وشقق 3 غرف وG-Villa وتاون هاوس في الحي السكني R8 — مقدم 5% حتى 8 سنوات أو مقدم 10% حتى 10 سنوات.',
      keywords: JSON.stringify(['Gardens', 'جاردنز', 'Gardens New Capital', 'جاردنز العاصمة الإدارية', 'كمبوند R8', 'جاردنز العاصمة الإدارية الجديدة']),
      dataTrust: JSON.stringify(trust),
      isActive: true,
      isVerified: false,
      isParent: false,
    },
  })

  /* 6) خطط السداد — كما بالكيت حرفيًا (لا حملات مبتكرة) */
  const EOI_DESC = '⚠️ حجز مبدئي EOI بدءًا من 8/11/2026: 100,000 ج.م للفاون هاوس وG-Villa، و50,000 ج.م للشقق (كيت المبيعات)'
  const plans = [
    { name: '5% down · 8 years', nameArabic: 'مقدم 5% — تقسيط حتى 8 سنوات', description: EOI_DESC, downPaymentPct: 5, installmentYears: 8, isDefault: true, sortOrder: 1 },
    { name: '10% down · 10 years', nameArabic: 'مقدم 10% — تقسيط حتى 10 سنوات', description: EOI_DESC, downPaymentPct: 10, installmentYears: 10, isDefault: false, sortOrder: 2 },
  ]
  for (const p of plans) {
    const ex = await db.paymentPlan.findFirst({ where: { projectId: project.id, name: p.name } })
    if (ex) {
      await db.paymentPlan.update({ where: { id: ex.id }, data: { ...p, isActive: true } })
    } else {
      await db.paymentPlan.create({ data: { ...p, projectId: project.id, isActive: true } })
    }
  }

  /* 7) المرافق: صفوف ماستر جديدة فقط إن ناقصة + إعادة ربط المشروع */
  const linkRows = []
  for (const [name, arabic, icon, category, premium] of AMENITY_MAP) {
    let amenity = await db.amenity.findUnique({ where: { name } })
    if (!amenity) {
      amenity = await db.amenity.create({ data: { name, nameArabic: arabic, icon, category, isActive: true, sortOrder: 500 } })
    }
    linkRows.push({ projectId: project.id, amenityId: amenity.id, isPremium: !!premium, notes: KIT_SOURCE })
  }
  await db.projectAmenity.deleteMany({ where: { projectId: project.id } })
  await db.projectAmenity.createMany({ data: linkRows })

  /* 8) تنظيف بروفايل "غير معلن (TBA)" المؤقت — يُحذف فقط إذا بقى من غير مشاريع/ليدز/صفقات */
  const tba = await db.developerProfile.findFirst({
    where: { companyName: 'Undisclosed Developer (TBA)' },
    include: {
      projects: { select: { id: true } },
      leads: { select: { id: true } },
      deals: { select: { id: true } },
    },
  })
  if (tba && tba.projects.length === 0 && tba.leads.length === 0 && tba.deals.length === 0) {
    await db.developerProfile.delete({ where: { id: tba.id } })
    console.log('CLEANUP: removed unused TBA developer profile')
  }

  const planCount = await db.paymentPlan.count({ where: { projectId: project.id } })
  const amenityCount = await db.projectAmenity.count({ where: { projectId: project.id } })
  console.log(
    `OK: Gardens → project id=${project.id} slug=${SLUG} price=${project.startPrice}-${project.endPrice} | plans=${planCount} | amenities=${amenityCount} | dev=${dev.companyName}`
  )
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
