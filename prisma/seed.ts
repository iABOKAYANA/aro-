import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Clean existing data in reverse order of foreign keys
  const tables = [
    'MarketingConsent', 'NotificationPreference', 'Notification',
    'AuditLog', 'UserDocument', 'SystemSetting', 'RegionSetting',
    'AIMessage', 'AIInsight', 'AISearchHistory', 'AIConversation',
    'LeadActivity', 'Lead', 'InquiryResponse', 'Inquiry',
    'Favorite', 'SavedSearch', 'Appointment', 'Viewing',
    'PriceHistory', 'UnitFeature', 'Unit',
    'PaymentMilestone', 'PaymentPlan', 'ProjectPhase',
    'ProjectBrochure', 'MasterPlanImage', 'NearbyPlace',
    'ProjectAmenity', 'Amenity',
    'Project', 'District', 'City', 'Governorate',
    'BrokerClient', 'BrokerProfile', 'DeveloperProfile', 'UserProfile',
    'Session', 'Account', 'VerificationToken', 'User',
  ]
  for (const table of tables) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`) } catch {}
  }

  const passwordHash = await bcrypt.hash('password123', 12)

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@estateai.eg',
      name: 'Admin',
      nameArabic: 'المدير',
      passwordHash,
      role: 'ADMIN',
      isVerified: true,
    },
  })

  // Create demo users
  const broker = await prisma.user.create({
    data: {
      email: 'broker@estateai.eg',
      name: 'Ahmed Hassan',
      nameArabic: 'أحمد حسن',
      passwordHash,
      role: 'BROKER',
      isVerified: true,
      brokerProfile: {
        create: {
          licenseNumber: 'BR-2024-001',
          agencyName: 'Cairo Premier Realty',
          agencyNameArabic: 'كايرو بريمير ريalty',
          specialization: JSON.stringify(['RESIDENTIAL', 'COMMERCIAL']),
          yearsExperience: 8,
          totalDeals: 145,
          rating: 4.8,
          reviewCount: 89,
          serviceAreas: JSON.stringify(['New Cairo', 'Sheikh Zayed', 'New Capital']),
        },
      },
    },
  })

  const developer = await prisma.user.create({
    data: {
      email: 'developer@estateai.eg',
      name: 'Sodic Development',
      nameArabic: 'سوديك للتطوير',
      passwordHash,
      role: 'DEVELOPER',
      isVerified: true,
      developerProfile: {
        create: {
          companyName: 'Sodic Development',
          companyNameArabic: 'سوديك للتطوير',
          foundedYear: 1998,
          totalProjects: 15,
          totalUnitsSold: 5000,
          rating: 4.7,
          reviewCount: 320,
          isVerified: true,
          description: "One of Egypt's leading real estate developers with over 25 years of experience.",
        },
      },
    },
  })

  const regularUser = await prisma.user.create({
    data: {
      email: 'user@estateai.eg',
      name: 'Sara Mohamed',
      nameArabic: 'سارة محمد',
      passwordHash,
      role: 'BUYER',
      isVerified: true,
    },
  })

  console.log('✅ Users created')

  // Create Governorates
  const cairo = await prisma.governorate.create({
    data: { name: 'Cairo', nameArabic: 'القاهرة', nameSlug: 'cairo' },
  })
  const giza = await prisma.governorate.create({
    data: { name: 'Giza', nameArabic: 'الجيزة', nameSlug: 'giza' },
  })
  const newCairo = await prisma.governorate.create({
    data: { name: 'New Cairo', nameArabic: 'القاهرة الجديدة', nameSlug: 'new-cairo' },
  })

  // Create Cities
  const newCairoCity = await prisma.city.create({
    data: { name: 'New Cairo', nameArabic: 'القاهرة الجديدة', nameSlug: 'new-cairo', governorateId: newCairo.id },
  })
  const sheikhZayed = await prisma.city.create({
    data: { name: 'Sheikh Zayed', nameArabic: 'الشيخ زايد', nameSlug: 'sheikh-zayed', governorateId: giza.id },
  })

  // Create Districts
  const fifthSettlement = await prisma.district.create({
    data: { name: 'Fifth Settlement', nameArabic: 'التجمع الخامس', nameSlug: 'fifth-settlement', cityId: newCairoCity.id },
  })
  const fourthSettlement = await prisma.district.create({
    data: { name: 'Fourth Settlement', nameArabic: 'التجمع الرابع', nameSlug: 'fourth-settlement', cityId: newCairoCity.id },
  })

  console.log('✅ Locations created')

  // Create Amenities
  const amenityData = [
    { name: 'Swimming Pool', nameArabic: 'حمام سباحة', icon: 'waves', category: 'LIFESTYLE' },
    { name: 'Gym', nameArabic: 'صالة رياضية', icon: 'dumbbell', category: 'SPORTS' },
    { name: 'Club House', nameArabic: 'كلاب هاوس', icon: 'building', category: 'LIFESTYLE' },
    { name: 'Landscaped Gardens', nameArabic: 'حدائق منسقة', icon: 'trees', category: 'LANDSCAPE' },
    { name: '24/7 Security', nameArabic: 'أمن 24 ساعة', icon: 'shield', category: 'SECURITY' },
    { name: 'CCTV', nameArabic: 'كاميرات مراقبة', icon: 'camera', category: 'SECURITY' },
    { name: 'Kids Playground', nameArabic: 'ملعب أطفال', icon: 'baby', category: 'LIFESTYLE' },
    { name: 'Retail Area', nameArabic: 'منطقة تجارية', icon: 'shopping-bag', category: 'CONVENIENCE' },
    { name: 'Jogging Track', nameArabic: 'مسار جري', icon: 'footprints', category: 'SPORTS' },
    { name: 'Tennis Court', nameArabic: 'ملعب تنس', icon: 'circle-dot', category: 'SPORTS' },
    { name: 'Mosque', nameArabic: 'مسجد', icon: 'landmark', category: 'INFRASTRUCTURE' },
    { name: 'Medical Center', nameArabic: 'مركز طبي', icon: 'heart-pulse', category: 'HEALTH' },
    { name: 'School', nameArabic: 'مدرسة', icon: 'graduation-cap', category: 'EDUCATION' },
    { name: 'Underground Parking', nameArabic: 'جراج تحت الأرض', icon: 'car', category: 'INFRASTRUCTURE' },
    { name: 'Concierge', nameArabic: 'كونسيرج', icon: 'bell-concierge', category: 'LIFESTYLE' },
  ]

  const amenities = []
  for (const data of amenityData) {
    amenities.push(await prisma.amenity.create({ data }))
  }
  console.log('✅ Amenities created')

  // Create Projects
  const devProfile = await prisma.developerProfile.findFirst({ where: { userId: developer.id } })

  const project1 = await prisma.project.create({
    data: {
      developerId: devProfile!.id,
      name: 'SODIC Eastown',
      nameArabic: 'سوديك إستاون',
      slug: 'sodic-eastown',
      tagline: 'Live the Difference',
      taglineArabic: 'عايش الفرق',
      description: 'Eastown is a fully integrated mixed-use development in the heart of New Cairo, offering a unique blend of residential, commercial, and retail spaces.',
      coverImage: '/images/projects/eastown-cover.jpg',
      gallery: JSON.stringify(['/images/projects/eastown-1.jpg', '/images/projects/eastown-2.jpg']),
      governorateId: newCairo.id,
      cityId: newCairoCity.id,
      districtId: fifthSettlement.id,
      latitude: 30.0256,
      longitude: 31.4685,
      propertyTypes: JSON.stringify(['APARTMENT', 'VILLA', 'TOWNHOUSE']),
      listingTypes: JSON.stringify(['SALE', 'INSTALLMENT']),
      status: 'AVAILABLE',
      totalUnits: 800,
      totalArea: 250000,
      completionPercent: 75,
      deliveryDate: new Date('2025-12-31'),
      startPrice: 5000000,
      endPrice: 25000000,
      pricePerSqm: 45000,
      downPaymentMin: 10,
      installmentYears: 7,
      isFeatured: true,
      isVerified: true,
      viewCount: 15420,
      favoriteCount: 320,
      publishedAt: new Date(),
      metaTitle: 'SODIC Eastown | Premium Compound in New Cairo',
      metaDescription: 'Discover Eastown by SODIC, a premium compound in New Cairo with apartments, villas, and townhouses.',
    },
  })

  const project2 = await prisma.project.create({
    data: {
      developerId: devProfile!.id,
      name: 'Mountain View iCity',
      nameArabic: 'ماونتن فيو آي سيتي',
      slug: 'mountain-view-icity',
      tagline: 'Where Life Comes Together',
      taglineArabic: 'حيث تتجمع الحياة',
      description: 'Mountain View iCity is an innovative smart community in New Cairo, designed with cutting-edge technology and sustainable living.',
      coverImage: '/images/projects/icity-cover.jpg',
      governorateId: newCairo.id,
      cityId: newCairoCity.id,
      districtId: fourthSettlement.id,
      latitude: 30.0134,
      longitude: 31.4900,
      propertyTypes: JSON.stringify(['APARTMENT', 'TOWNHOUSE', 'DUPLEX']),
      listingTypes: JSON.stringify(['SALE', 'INSTALLMENT']),
      status: 'UNDER_CONSTRUCTION',
      totalUnits: 1200,
      totalArea: 400000,
      completionPercent: 60,
      deliveryDate: new Date('2026-06-30'),
      startPrice: 8000000,
      endPrice: 35000000,
      pricePerSqm: 55000,
      downPaymentMin: 15,
      installmentYears: 8,
      isFeatured: true,
      isVerified: true,
      viewCount: 12800,
      favoriteCount: 280,
      publishedAt: new Date(),
    },
  })

  console.log('✅ Projects created')

  // Create Units for Project 1
  const unitTypes1 = [
    { unitType: 'APARTMENT', bedrooms: 2, bathrooms: 2, area: 130, price: 5500000, finishingType: 'Semi-Finished', floor: 3, unitNumber: 'A-301' },
    { unitType: 'APARTMENT', bedrooms: 3, bathrooms: 3, area: 180, price: 7500000, finishingType: 'Finished', floor: 5, unitNumber: 'A-502' },
    { unitType: 'APARTMENT', bedrooms: 3, bathrooms: 3, area: 200, price: 9000000, finishingType: 'Fully Finished', floor: 8, unitNumber: 'A-801', view: 'Garden' },
    { unitType: 'VILLA', bedrooms: 4, bathrooms: 4, area: 350, price: 18000000, finishingType: 'Semi-Finished', view: 'Garden' },
    { unitType: 'TOWNHOUSE', bedrooms: 3, bathrooms: 3, area: 250, price: 12000000, finishingType: 'Semi-Finished', hasBalcony: true },
  ]

  for (const [i, unit] of unitTypes1.entries()) {
    await prisma.unit.create({
      data: {
        projectId: project1.id,
        name: `${unit.unitType} ${unit.bedrooms}BR`,
        unitNumber: unit.unitNumber || `U-${i}`,
        floor: unit.floor,
        unitType: unit.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        area: unit.area,
        price: unit.price,
        pricePerSqm: unit.price / unit.area,
        finishingType: unit.finishingType,
        view: unit.view,
        hasBalcony: unit.hasBalcony || false,
        slug: `sodic-eastown-${(unit.unitNumber || `unit-${i}`).toLowerCase().replace('-', '')}`,
        isFeatured: i < 2,
      },
    })
  }

  // Create Units for Project 2
  const unitTypes2 = [
    { unitType: 'APARTMENT', bedrooms: 1, bathrooms: 1, area: 90, price: 8000000, finishingType: 'Fully Finished', floor: 2, unitNumber: 'M-201' },
    { unitType: 'APARTMENT', bedrooms: 2, bathrooms: 2, area: 140, price: 12000000, finishingType: 'Fully Finished', floor: 6, unitNumber: 'M-601', view: 'Pool' },
    { unitType: 'TOWNHOUSE', bedrooms: 4, bathrooms: 4, area: 280, price: 22000000, finishingType: 'Fully Finished', view: 'Garden' },
    { unitType: 'DUPLEX', bedrooms: 4, bathrooms: 5, area: 320, price: 28000000, finishingType: 'Fully Finished', floor: 10, unitNumber: 'D-1001', hasBalcony: true },
  ]

  for (const [i, unit] of unitTypes2.entries()) {
    await prisma.unit.create({
      data: {
        projectId: project2.id,
        name: `${unit.unitType} ${unit.bedrooms}BR`,
        unitNumber: unit.unitNumber || `U-${i}`,
        floor: unit.floor,
        unitType: unit.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        area: unit.area,
        price: unit.price,
        pricePerSqm: unit.price / unit.area,
        finishingType: unit.finishingType,
        view: unit.view,
        hasBalcony: unit.hasBalcony || false,
        slug: `mv-icity-${(unit.unitNumber || `unit-${i}`).toLowerCase().replace('-', '')}`,
        isFeatured: i < 2,
      },
    })
  }

  console.log('✅ Units created')

  // Create Payment Plans
  const plan1 = await prisma.paymentPlan.create({
    data: {
      projectId: project1.id,
      name: 'Standard Plan',
      nameArabic: 'الخطة المعيارية',
      downPaymentPct: 10,
      installmentYears: 7,
      maintenanceFeePct: 8,
      semiAnnualPct: 5,
      deliveryPaymentPct: 10,
      isDefault: true,
    },
  })

  await prisma.paymentMilestone.createMany({
    data: [
      { paymentPlanId: plan1.id, name: 'Down Payment', percentage: 10, monthNumber: 0, sortOrder: 0 },
      { paymentPlanId: plan1.id, name: 'During Construction', percentage: 45, monthNumber: 1, sortOrder: 1 },
      { paymentPlanId: plan1.id, name: 'Semi-Annual Payment', percentage: 15, monthNumber: 6, sortOrder: 2 },
      { paymentPlanId: plan1.id, name: 'On Delivery', percentage: 10, monthNumber: 36, sortOrder: 3 },
      { paymentPlanId: plan1.id, name: 'Post Delivery', percentage: 20, monthNumber: 42, sortOrder: 4 },
    ],
  })

  const plan2 = await prisma.paymentPlan.create({
    data: {
      projectId: project1.id,
      name: 'Cash Discount Plan',
      nameArabic: 'خطة الخصم النقدي',
      downPaymentPct: 50,
      installmentYears: 3,
      cashDiscount: 15,
    },
  })

  await prisma.paymentMilestone.createMany({
    data: [
      { paymentPlanId: plan2.id, name: 'Down Payment', percentage: 50, monthNumber: 0, sortOrder: 0 },
      { paymentPlanId: plan2.id, name: '3-Year Installments', percentage: 35, monthNumber: 1, sortOrder: 1 },
      { paymentPlanId: plan2.id, name: 'On Delivery', percentage: 15, monthNumber: 30, sortOrder: 2 },
    ],
  })

  // Attach amenities to projects
  for (const amenity of amenities.slice(0, 10)) {
    await prisma.projectAmenity.create({
      data: { projectId: project1.id, amenityId: amenity.id },
    })
  }
  for (const amenity of amenities.slice(3, 13)) {
    await prisma.projectAmenity.create({
      data: { projectId: project2.id, amenityId: amenity.id },
    })
  }

  // Add nearby places
  await prisma.nearbyPlace.createMany({
    data: [
      { projectId: project1.id, name: 'Cairo Festival City Mall', type: 'mall', distance: 5, driveTime: 10 },
      { projectId: project1.id, name: 'American University in Cairo', type: 'school', distance: 3, driveTime: 8 },
      { projectId: project1.id, name: 'Al Salam Hospital', type: 'hospital', distance: 4, driveTime: 12 },
      { projectId: project1.id, name: 'Cairo Ring Road', type: 'highway', distance: 2, driveTime: 5 },
    ],
  })

  console.log('✅ Payment plans & amenities attached')

  // Create sample inquiry
  await prisma.inquiry.create({
    data: {
      name: 'Omar Khalil',
      phone: '+201012345678',
      email: 'omar@example.com',
      message: 'I am interested in the 3-bedroom apartments in Eastown. Can I schedule a visit?',
      type: 'VISIT_REQUEST',
      status: 'NEW',
      source: 'WEBSITE',
      userId: regularUser.id,
    },
  })

  // Create sample lead
  const brokerProfile = await prisma.brokerProfile.findFirst({ where: { userId: broker.id } })
  if (brokerProfile) {
    await prisma.lead.create({
      data: {
        brokerId: brokerProfile.id,
        name: 'Mona Ali',
        phone: '+201098765432',
        email: 'mona@example.com',
        source: 'WEBSITE',
        status: 'CONTACTED',
        budgetMin: 5000000,
        budgetMax: 15000000,
        preferredPropertyTypes: JSON.stringify(['APARTMENT', 'TOWNHOUSE']),
        preferredAreas: JSON.stringify(['New Cairo', 'Sheikh Zayed']),
        notes: 'Looking for a family home, prefers garden view.',
        score: 75,
        tags: JSON.stringify(['family', 'high-budget', 'garden-view']),
      },
    })
  }

  // System Settings
  await prisma.systemSetting.createMany({
    data: [
      { key: 'site_name', value: JSON.stringify({ en: 'GHAYA REAL ESTATE', ar: 'GHAYA REAL ESTATE' }), category: 'general' },
      { key: 'site_tagline', value: JSON.stringify({ en: 'Smart Real Estate Solutions', ar: 'حلول عقارية ذكية' }), category: 'general' },
      { key: 'default_currency', value: JSON.stringify('EGP'), category: 'general' },
      { key: 'ai_enabled', value: JSON.stringify(true), category: 'ai' },
      { key: 'ai_model', value: JSON.stringify('gpt-4'), category: 'ai' },
    ],
  })

  console.log('✅ System settings created')
  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
