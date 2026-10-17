import { defineMessages } from '../define';

// Filled in by the screen that owns this namespace.
export const project = defineMessages({
  'project.title': ['Project', 'المشروع'],
  'project.loading': ['Loading project…', 'جاري تحميل المشروع…'],
  'project.notFound': ['Project not found', 'المشروع مش موجود'],

  // Hero
  'project.verifiedDeveloper': ['Verified developer', 'مطوّر معتمد'],

  // Headline numbers
  'project.from': ['From', 'ابتداءً من'],
  'project.units': ['Units', 'الوحدات'],
  'project.unitsListed': ['Units listed', 'الوحدات المعروضة'],
  'project.projectSize': ['Project size', 'حجم المشروع'],
  'project.completion': ['Completion', 'نسبة الإنجاز'],

  // Actions
  'project.bookViewing': ['Book a viewing', 'احجز معاينة'],
  'project.save': ['Save this project', 'احفظ المشروع'],
  'project.savedRemove': ['Saved ✓  ·  Tap to remove', 'محفوظ ✓  ·  اضغط عشان تشيله'],
  'project.myAppointments': ['My appointments', 'مواعيدي'],
  'project.share': ['Share', 'شارك'],
  'project.shared': ['Shared ✓', 'اتشارك ✓'],
  'project.video': ['Project video', 'فيديو المشروع'],

  // Watch (price & availability alerts)
  'project.watch': ['Watch for price changes', 'تابع تغيّرات السعر'],
  'project.watching': ['Watching — alerts on', 'متابع — التنبيهات شغّالة'],
  'project.signInWatch': [
    'Sign in to get price & availability alerts',
    'سجّل دخول عشان توصلك تنبيهات السعر والتوفر',
  ],

  // Compare-in-place
  'project.compare': ['Compare', 'قارن'],
  'project.compareAdded': ['Added', 'اتضاف'],
  'project.compareFull': ['Comparison is full', 'المقارنة مليانة'],
  'project.compareHint': ['Add to comparison (up to 4)', 'ضيفه للمقارنة (لحد 4)'],

  // Contact developer
  'project.contactDeveloper': ['Contact Developer', 'كلّم المطوّر'],
  'project.hideContact': ['Hide contact details', 'إخفاء بيانات التواصل'],
  'project.sendInquiry': ['Send inquiry', 'ابعت استفسار'],
  'project.noContact': [
    'No direct contact yet — send an inquiry and the team will get back to you.',
    'مفيش تواصل مباشر لسه — ابعت استفسار والفريق هيكلمك تاني.',
  ],

  // Tabs
  'project.tabOverview': ['Overview', 'نظرة عامة'],
  'project.tabMasterPlan': ['Master plan', 'المخطط العام'],
  'project.masterPlanHint': [
    'Site layout of the project — buildings, unit distribution, and amenities. Tap an image to enlarge.',
    'مخطط الموقع بتاع المشروع — المباني وتوزيع الوحدات والمرافق. اضغط على أي صورة عشان تكبّرها.',
  ],
  'project.tabLocation': ['Location', 'الموقع'],
  'project.tabTimeline': ['Timeline', 'الخط الزمني'],

  // Developer + about
  'project.verified': ['Verified', 'موثّق'],
  'project.notVerified': ['Not verified', 'مش موثّق'],
  'project.about': ['About', 'عن المشروع'],
  'project.propertyTypes': ['Available property types', 'أنواع الوحدات المتاحة'],
  'project.expectedDelivery': ['Expected delivery', 'التسليم المتوقع'],

  // Overview tab cards — mirrors the website's three overview cards.
  'project.overviewAbout': ['About {name}', 'عن {name}'],
  'project.overviewFeatures': ['Features & amenities', 'المميزات والمرافق'],
  'project.overviewLocation': ['Location', 'المكان فين'],

  // Data transparency (GET /api/trust?projectId=)
  'project.trust': ['Data transparency', 'شفافية البيانات'],
  'project.trustHint': [
    'Verification status of key information. Unverified data is never presented as verified.',
    'حالة توثيق المعلومات المهمة. إحنا عمرنا ما بنقدّم معلومات مش موثقة على إنها موثقة.',
  ],
  'project.trustEmpty': [
    'No verification records yet for this project. Source and verification status will appear here as the data gets reviewed.',
    'مفيش سجلات توثيق للمشروع ده لسه. المصدر وحالة التوثيق هيظهروا هنا أول ما البيانات تتراجع.',
  ],
  'project.trustFreshness': ['Freshness window', 'مدة صلاحية البيانات'],
  'project.days': ['days', 'يوم'],
  'project.fieldPrice': ['Pricing', 'الأسعار'],
  'project.fieldPaymentPlan': ['Payment plan', 'خطة السداد'],
  'project.fieldDelivery': ['Delivery date', 'تاريخ التسليم'],
  'project.fieldLocation': ['Location', 'الموقع'],
  'project.fieldAmenities': ['Amenities', 'المرافق'],
  'project.fieldArea': ['Area', 'المساحة'],
  'project.fieldAvailability': ['Availability', 'التوفر'],
  'project.trustDeveloper': ['Developer provided', 'المطوّر هوّ المصدر'],
  'project.trustReviewed': ['EstateAI reviewed', 'راجعتها EstateAI'],
  'project.trustPending': ['Pending review', 'مستني مراجعة'],
  'project.trustStale': ['May require verification', 'محتاج يتجدد'],

  // Payment
  'project.paymentPlans': ['Payment plans', 'خطط السداد'],
  'project.plan': ['Plan', 'خطة'],
  'project.down': ['down', 'مقدم'],
  'project.years': ['years', 'سنوات'],
  'project.milestones': ['milestones', 'مراحل'],
  'project.payment': ['Payment', 'السداد'],
  'project.downPayment': ['down payment', 'مقدم'],
  'project.installments': ['year installments', 'سنة تقسيط'],
  'project.downPaymentLabel': ['Down payment', 'المقدم'],
  'project.planInstallments': ['Installments', 'عدد الأقساط'],
  'project.cashDiscount': ['Cash discount', 'خصم كاش'],
  'project.maintenance': ['Maintenance', 'الصيانة'],
  'project.defaultBadge': ['Default', 'الافتراضي'],
  'project.paymentMilestones': ['Payment milestones', 'مراحل السداد'],
  'project.month': ['Month', 'شهر'],
  'project.noPlans': ['No payment plans available yet.', 'مفيش خطط سداد لسه.'],

  // Monthly installment estimator
  'project.estimator': ['Monthly installment estimator', 'تقدير القسط الشهري'],
  'project.perMonth': ['per month', 'في الشهر'],
  'project.over': ['over', 'على مدار'],
  'project.duration': ['Duration', 'المدة'],
  'project.perSqm': ['per m²', 'للمتر المربع'],
  'project.estimatorNote': [
    'Indicative estimate without interest — actual terms follow the project’s payment plan.',
    'تقدير تقريبي من غير فوائد — الشروط الفعلية حسب خطة السداد بتاعة المشروع.',
  ],

  // Plan-driven estimator — baseline from the selected REAL plan
  // (`downPaymentPct` / `installmentYears` / `cashDiscount`); the
  // down/years chips are a secondary manual override.
  'project.estimatorPlan': ['Payment plan', 'خطة السداد'],
  'project.estimatorFromPlan': ['Based on {plan}', 'حسب خطة {plan}'],
  'project.estimatorCustomized': [
    'Tweaked by you — was {plan}',
    'انت ظبّطتها بنفسك — كانت {plan}',
  ],
  'project.estimatorTotal': ['Total payable', 'الإجمالي'],
  'project.cashPrice': ['Cash price', 'سعر الكاش'],
  'project.estimatorSave': ['Save {s} paying cash', 'هتوفر {s} لو دفعت كاش'],
  'project.estimatorTweak': ['Or tweak it yourself', 'أو ظبّطها بنفسك'],
  'project.estimatorNoPlans': [
    'No payment plans published yet — this estimate uses the project’s headline terms.',
    'المطوّر لسه منزلش خطط سداد — التقدير ده مبني على الشروط العامة للمشروع.',
  ],

  // Timeline (GET /api/milestones?projectId=)
  'project.timelineTitle': ['Project timeline', 'الخط الزمني للمشروع'],
  'project.timelineHint': [
    'Milestones reported by the developer and approved by EstateAI.',
    'مراحل بلّغ عنها المطوّر واعتمدها EstateAI.',
  ],
  'project.timelineEmpty': [
    'No timeline milestones published yet for this project.',
    'مفيش مراحل منشورة للمشروع ده لسه.',
  ],
  'project.timelineUpdated': ['Last updated', 'آخر تحديث'],
  'project.progress': ['complete', 'منجز'],
  'project.typeLaunch': ['Launch', 'الإطلاق'],
  'project.typeConstruction': ['Construction', 'البناء'],
  'project.typeProgress': ['Progress', 'التنفيذ'],
  'project.typeDelivery': ['Delivery', 'التسليم'],
  'project.typeHandover': ['Handover', 'التسليم النهائي'],
  'project.typeCustom': ['Custom', 'مخصص'],
  'project.statusPlanned': ['Planned', 'مخطط'],
  'project.statusInProgress': ['In progress', 'جاري التنفيذ'],
  'project.statusCompleted': ['Completed', 'منجَز'],
  'project.statusDelayed': ['Delayed', 'متأخر'],

  // Location
  'project.viewOnMaps': ['View on Google Maps', 'افتح على خرائط جوجل'],
  'project.drive': ['min drive', 'دقيقة بالسيارة'],

  // Amenities / units / nearby
  'project.amenities': ['Amenities', 'المرافق'],
  'project.noAmenities': ['Amenities info coming soon.', 'بيانات المرافق هتتضاف قريب.'],
  'project.noUnits': ['No units listed yet.', 'مفيش وحدات لسه.'],
  'project.bed': ['bed', 'غرفة'],
  'project.nearby': ['Nearby', 'أماكن قريبة'],
  'project.km': ['km', 'كم'],

  // Showcase model units — REAL owner-uploaded content only, illustrative,
  // inquiry CTA only, never bookable. Hidden when zero samples.
  'project.models': ['Model units', 'نماذج الوحدات'],
  'project.modelsHint': [
    'Illustrative model units from the developer — for reference only, not bookable. Send an inquiry if you like one.',
    'وحدات نموذجية استرشادية من المطوّر — للفرجة بس، مش للحجز. لو عجبتك حاجة ابعت استفسار.',
  ],
  'project.sampleBadge': ['Showcase', 'استرشادي'],
  'project.floorPlan': ['Floor plan', 'المخطط'],
  'project.sendInquiryModel': ['Send inquiry', 'ابعت استفسار'],

  // Social proof — approved ratings from completed viewings (GET /api/reviews).
  // No saves count exists on the project payload, so none is shown.
  'project.socialProof': ['★ {avg} from {n} post-viewing ratings', '★ {avg} من {n} تقييم بعد معاينة'],
  'project.socialProofEmpty': [
    'No post-viewing ratings yet — rate it first after your visit.',
    'لسه مفيش تقييمات بعد معاينة — قيّم انت الأول بعد زيارتك.',
  ],

  // Honest scarcity — computed from the listed (non-sample) units only.
  'project.unitsAvailable': ['Available ({a} of {n})', 'المتاحة ({a} من {n})'],
  'project.scarcityDelivery': ['Delivery {d}', 'التسليم {d}'],
  'project.scarcityCompletion': ['{p} complete', 'الإنجاز {p}'],
  'project.soldOutNudge': [
    'All units are taken for now — send an inquiry and we will tell you when one opens up.',
    'الوحدات كلها محجوزة دلوقتي — ابعت استفسار وهنقولك أول ما حاجة تفضى.',
  ],

  // Per-type buyable-inventory summary (`unitsByType` on GET
  // /api/projects/[slug]) — rendered only when the backend supplies it.
  'project.availableByType': ['Available by type', 'المتاح حسب النوع'],
  'project.oneUnit': ['1 unit', 'وحدة واحدة'],
  'project.twoUnits': ['2 units', 'وحدتين'],
  'project.manyUnits': ['{n} units', '{n} وحدات'],
  'project.startingFrom': ['Starting from {p}', 'يبدأ من {p}'],
  'project.areaIs': ['Area: {a}', 'المساحة: {a}'],

  // Headline discount across the plan set from the top-level
  // `maxDiscount` — hidden when null.
  'project.upToDiscount': ['Up to {p}% discount', 'خصم لحد {p}%'],
});
