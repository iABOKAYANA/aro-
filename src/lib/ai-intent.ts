import type { PropertyFilterInput } from '@/lib/validations'

// ─── Intent Types ────────────────────────────────────────

export type IntentType =
  | 'search_properties'
  | 'project_info'
  | 'compare_projects'
  | 'calculate_payment'
  | 'search_units'
  | 'lead_capture'
  | 'conversation'

export interface DetectedIntent {
  type: IntentType
  confidence: number
  entities: Record<string, unknown>
}

// ─── Location Aliases ────────────────────────────────────

const LOCATION_ALIASES: Record<string, string> = {
  'new cairo': 'new-cairo', 'fifth settlement': 'new-cairo', 'tagamoa': 'new-cairo',
  'el tagamoa': 'new-cairo', 'sheikh zayed': 'sheikh-zayed', 'new capital': 'new-capital',
  'new administrative capital': 'new-capital', '6th october': '6th-october',
  '6 october': '6th-october', 'sadat city': 'sadat-city', 'mostakbal city': 'mostakbal-city',
  'north coast': 'north-coast', 'sahel': 'north-coast', 'el alamein': 'el-alamein',
  'cairo': 'cairo', 'giza': 'giza', 'alexandria': 'alexandria',
  'ain sokhna': 'ain-sokhna', 'marina': 'north-coast', 'hacienda': 'north-coast',
  'التجمع': 'new-cairo', 'التجمع الخامس': 'new-cairo', 'الشيخ زاية': 'sheikh-zayed',
  'العاصمة الإدارية': 'new-capital', 'العاصمة الجديدة': 'new-capital',
  '6 أكتوبر': '6th-october', 'اكتوبر': '6th-october',
  'مدينة نصر': 'cairo', 'المعادي': 'cairo', 'مصر الجديدة': 'cairo',
  'الزمالك': 'cairo', 'وسط البلد': 'cairo', 'الساحل الشمالي': 'north-coast',
  'الإسكندرية': 'alexandria', 'القاهرة': 'cairo', 'الجيزة': 'giza',
  'الشروق': 'shorouk', 'بدر': 'badr', 'عين سخنة': 'ain-sokhna',
}

const TYPE_ALIASES: Record<string, string> = {
  'apartment': 'APARTMENT', 'flat': 'APARTMENT', 'شقة': 'APARTMENT', 'شقه': 'APARTMENT',
  'villa': 'VILLA', 'فيلا': 'VILLA',
  'townhouse': 'TOWNHOUSE', 'تاون هاوس': 'TOWNHOUSE', 'town house': 'TOWNHOUSE',
  'penthouse': 'PENTHOUSE', 'بنتهاوس': 'PENTHOUSE',
  'duplex': 'DUPLEX', 'دوبلكس': 'DUPLEX',
  'studio': 'STUDIO', 'استوديو': 'STUDIO',
  'commercial': 'COMMERCIAL', 'تجاري': 'COMMERCIAL',
}

const DEVELOPER_ALIASES: Record<string, string> = {
  'sodic': 'SODIC', 'mountain view': 'Mountain View', 'mountainview': 'Mountain View',
  'emaar': 'Emaar', 'palm hills': 'Palm Hills', 'talaat moustafa': 'Talaat Moustafa Group',
  'tmg': 'Talaat Moustafa Group', 'reef': 'Reef Development', 'tatweer': 'Tatweer Misr',
  'city edge': 'City Edge', 'hassan allam': 'Hassan Allam', 'memaar': 'Memaar Properties',
  'crystal': 'Crystal Lagoons', 'upward': 'Upward Development', 'pioneers': 'Pioneers Properties',
  'بتس وهي': 'SODIC', 'اون هي': 'Mountain View', 'إيمر': 'Emaar',
  'بالم هيلز': 'Palm Hills', 'طلعت مoustafa': 'Talaat Moustafa Group',
}

// ─── Conversation Keywords ───────────────────────────────

const SEARCH_TRIGGERS_EN = [
  'show me', 'find me', 'search for', 'looking for', 'i want', 'i need',
  'are there any', 'do you have', 'available', 'help me find', 'can you show',
  'list', 'display', 'browse', 'search', 'look for',
]

const SEARCH_TRIGGERS_AR = [
  'وريني', 'هاتلي', 'عايز', 'أنا عايز', 'ابحث', 'فيه', 'عندكم',
  'متوفر', ' الا', 'اللي', 'اللّي', 'نوع', 'شوف', 'اعرض',
]

const PROJECT_INFO_TRIGGERS_EN = [
  'tell me about', 'what is', 'what about', 'describe', 'explain',
  'give me info', 'details about', 'overview of', 'know more about',
]

const PROJECT_INFO_TRIGGERS_AR = [
  'عرفني على', 'احكيلي عن', 'إيه هو', 'قولي عن', 'اعرف عن',
  'تفاصيل', 'معلومات', 'عن المشروع', 'المشروع ده',
]

const COMPARE_TRIGGERS_EN = [
  'compare', 'difference between', 'vs', 'versus', 'which is better',
  'what\'s the difference', 'how does', 'stack up',
]

const COMPARE_TRIGGERS_AR = [
  'قارن', 'فرق', 'أيه الفرق', 'أحسن', 'أفضل', 'بمقارنة',
  'iangen', 'مقارنة بين', 'التاريخ',
]

const CALC_TRIGGERS_EN = [
  'calculate', 'how much', 'payment', 'installment', 'down payment',
  'monthly payment', 'emi', 'afford', 'budget', 'cost', 'price per',
  'what\'s the monthly', 'quarterly',
]

const CALC_TRIGGERS_AR = [
  'احسب', 'هاكون', 'قسط', 'مقدم', 'القسط', 'EMPLATE',
  'الشهري', 'الربع سنوي', 'الاسبوعي', 'التكلفة', 'سعر المتر',
  'هدفع', 'ادفع', 'أدفع',
]

const LEAD_TRIGGERS_EN = [
  'contact me', 'call me', 'schedule', 'book', 'inquiry', 'inquire',
  'talk to', 'speak with', 'broker', 'agent', 'someone contact',
  'i want to buy', 'i\'m interested', 'help me buy', 'want to purchase',
  'schedule a viewing', 'visit', 'i want this',
]

const LEAD_TRIGGERS_AR = [
  'كلمني', 'اتصل', 'حجز', 'موعد', 'استفسار', 'عايز أشتري',
  'مهتم', 'عايز حد يكلمني', 'عايز شراء', 'عايز زيارة', 'عايز الحتة دي',
]

const GREETING_TRIGGERS = [
  'hello', 'hi', 'hey', 'مرحبا', 'أهلا', 'هاي', 'السلام عليكم',
  'good morning', 'good evening', 'good afternoon',
]

const GENERAL_QA_TRIGGERS = [
  'what is', 'what are', 'how do', 'how does', 'can you explain',
  'do you know', 'tell me', 'what\'s the difference between',
  'down payment', 'installment', 'compound', 'compound area',
  'قسط', 'مقدم', 'مشروع', 'كمت',
]

// ─── Helper Functions ────────────────────────────────────

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

function extractLocations(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const [alias, slug] of Object.entries(LOCATION_ALIASES)) {
    if (lower.includes(alias)) {
      if (!found.includes(slug)) found.push(slug)
    }
  }
  return found
}

function extractPropertyType(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const [alias, type] of Object.entries(TYPE_ALIASES)) {
    if (lower.includes(alias)) return type
  }
  return undefined
}

function extractBedrooms(text: string): number | undefined {
  const lower = text.toLowerCase()
  const enMatch = text.match(/(\d+)\s*(?:bedroom|bed|room|br|bd)/i)
  if (enMatch) return parseInt(enMatch[1])

  const arMatch = text.match(/(\d+)\s*(?:غرف|غرفة|نوم)/i)
  if (arMatch) return parseInt(arMatch[1])

  const spelled: Record<string, number> = {
    'واحد': 1, 'اتنين': 2, 'اثنين': 2, 'ثلاث': 3, 'اربعة': 4, 'خمسة': 5,
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  }
  for (const [word, num] of Object.entries(spelled)) {
    if (lower.includes(word)) return num
  }

  return undefined
}

function extractPrice(text: string): { minPrice?: number; maxPrice?: number } {
  const result: { minPrice?: number; maxPrice?: number } = {}

  const betweenMatch = text.match(/(?:between|from|من)\s*([\d,.]+)\s*(?:to|and|-\s*|لـ|الى|إلى|حتى)\s*([\d,.]+)\s*(?:million|m|مليون|جنيه|egp)?/i)
  if (betweenMatch) {
    result.minPrice = parseNumber(betweenMatch[1]) * 1_000_000
    result.maxPrice = parseNumber(betweenMatch[2]) * 1_000_000
    return result
  }

  const underMatch = text.match(/(?:under|below|less than|أقل من|تحت|עד)\s*([\d,.]+)\s*(?:million|m|مليون|جنيه|egp)?/i)
  if (underMatch) {
    result.maxPrice = parseNumber(underMatch[1]) * 1_000_000
    return result
  }

  const overMatch = text.match(/(?:over|above|more than|أكثر من|فوق|starting from|ابتداء من)\s*([\d,.]+)\s*(?:million|m|مليون|جنيه|egp)?/i)
  if (overMatch) {
    result.minPrice = parseNumber(overMatch[1]) * 1_000_000
    return result
  }

  const singleMatch = text.match(/(?:معايا|عندي|ميزانيتي|بـ|Budget)?\s*([\d,.]+)\s*(?:million|m|مليون)/i)
  if (singleMatch && !result.minPrice && !result.maxPrice) {
    result.maxPrice = parseNumber(singleMatch[1]) * 1_000_000
  }

  return result
}

function extractDeveloper(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const [alias, name] of Object.entries(DEVELOPER_ALIASES)) {
    if (lower.includes(alias)) return name
  }
  return undefined
}

function extractProjectNames(text: string): string[] {
  const names: string[] = []
  const knownProjects = [
    'mountain view icity', 'mountain view', 'sodic westown', 'sodic',
    'emaar misr', 'emaar', 'palm hills', 'talaat moustafa',
    'city edge', 'hassan allam', 'reef development', 'tatweer misr',
    'memaar properties', 'crystal lagoons', 'upward development',
    'pioneers properties', 'rozen homes', 'delta homes',
    'cairo festival city', 'cfc', 'eastown', 'westown',
    'i city', 'icity', 'october plaza', 'hexa',
    'rozen', 'delta', 'besix', 'bena residential',
  ]
  const lower = text.toLowerCase()
  for (const name of knownProjects) {
    if (lower.includes(name)) names.push(name)
  }
  return names
}

function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ''))
}

// ─── Intent Detection ────────────────────────────────────

export function detectIntent(
  message: string,
  conversationContext?: Array<{ role: string; content: string }>
): DetectedIntent {
  const lower = message.toLowerCase().trim()
  const locations = extractLocations(message)
  const propertyType = extractPropertyType(message)
  const bedrooms = extractBedrooms(message)
  const price = extractPrice(message)
  const developer = extractDeveloper(message)
  const projectNames = extractProjectNames(message)

  // Check for comparison intent
  if (hasAny(lower, COMPARE_TRIGGERS_EN) || hasAny(lower, COMPARE_TRIGGERS_AR)) {
    if (projectNames.length >= 2) {
      return {
        type: 'compare_projects',
        confidence: 0.9,
        entities: { projectNames: projectNames.slice(0, 2) },
      }
    }
    // Check if comparing two things mentioned in the message
    const vsMatch = lower.match(/(\w[\w\s]+?)\s*(?:vs|versus|compare|قارن|أيه الفرق|against)\s*(\w[\w\s]+)/)
    if (vsMatch) {
      return {
        type: 'compare_projects',
        confidence: 0.8,
        entities: { projectNames: [vsMatch[1].trim(), vsMatch[2].trim()] },
      }
    }
  }

  // Check for lead/call-to-action intent
  if (hasAny(lower, LEAD_TRIGGERS_EN) || hasAny(lower, LEAD_TRIGGERS_AR)) {
    return {
      type: 'lead_capture',
      confidence: 0.85,
      entities: { message },
    }
  }

  // Check for project info intent (before general Q&A to avoid false positives)
  if (hasAny(lower, PROJECT_INFO_TRIGGERS_EN) || hasAny(lower, PROJECT_INFO_TRIGGERS_AR)) {
    const devName = developer
    if (devName) {
      return {
        type: 'project_info',
        confidence: 0.85,
        entities: { developerName: devName },
      }
    }
    if (projectNames.length > 0) {
      return {
        type: 'project_info',
        confidence: 0.9,
        entities: { projectName: projectNames[0] },
      }
    }
    // If triggered by "tell me about" but no project found, still try developer
    if (developer) {
      return {
        type: 'project_info',
        confidence: 0.8,
        entities: { developerName: developer },
      }
    }
  }

  // Check for general Q&A (must be before calculation check)
  const isQuestion = /^what\s+(is|are|does|do)|^how\s+(does|do|is)|^can\s+you|^explain|^tell\s+me\s+about|^define/i.test(lower)
  const hasQuestionWord = lower.includes('?') || isQuestion
  if (hasQuestionWord && (hasAny(lower, GENERAL_QA_TRIGGERS) || isQuestion)) {
    return {
      type: 'conversation',
      confidence: 0.85,
      entities: { subtype: 'question', message },
    }
  }

  // Check for calculation intent
  if (hasAny(lower, CALC_TRIGGERS_EN) || hasAny(lower, CALC_TRIGGERS_AR)) {
    const calcEntities: Record<string, unknown> = {}
    if (price.maxPrice) calcEntities.unitPrice = price.maxPrice
    if (price.minPrice) calcEntities.unitPrice = price.minPrice

    // Extract down payment percentage
    const dpMatch = lower.match(/(?:down payment|مقدم)\s*(?:of|بـ|is)?\s*(\d+)\s*%?/i)
    if (dpMatch) calcEntities.downPaymentPct = parseInt(dpMatch[1])

    // Extract years
    const yearMatch = lower.match(/(\d+)\s*(?:year|سنين|سنة|سنه)/i)
    if (yearMatch) calcEntities.installmentYears = parseInt(yearMatch[1])

    // Extract area for price per sqm
    const areaMatch = lower.match(/(\d+)\s*(?:m2|sqm|متر|م2)/i)
    if (areaMatch) calcEntities.area = parseInt(areaMatch[1])

    // Check for a specific unit reference
    if (lower.includes('the unit') || lower.includes('الوحدة') || lower.includes('this unit')) {
      calcEntities.fromConversation = true
    }

    return {
      type: 'calculate_payment',
      confidence: 0.85,
      entities: calcEntities,
    }
  }

  // Check if asking about a specific project by name (without explicit "tell me about")
  if (projectNames.length === 1 && !hasAny(lower, SEARCH_TRIGGERS_EN) && !hasAny(lower, SEARCH_TRIGGERS_AR)) {
    return {
      type: 'project_info',
      confidence: 0.7,
      entities: { projectName: projectNames[0] },
    }
  }

  // Check for developer info by name
  if (developer && !hasAny(lower, SEARCH_TRIGGERS_EN) && !hasAny(lower, SEARCH_TRIGGERS_AR)) {
    return {
      type: 'project_info',
      confidence: 0.75,
      entities: { developerName: developer },
    }
  }

  // Check for search intent
  if (
    hasAny(lower, SEARCH_TRIGGERS_EN) ||
    hasAny(lower, SEARCH_TRIGGERS_AR) ||
    locations.length > 0 ||
    propertyType ||
    bedrooms ||
    price.maxPrice ||
    price.minPrice
  ) {
    const searchFilters: Record<string, unknown> = {}
    if (locations.length > 0) searchFilters.city = locations[0]
    if (propertyType) searchFilters.propertyType = propertyType
    if (bedrooms) searchFilters.bedrooms = bedrooms
    if (price.minPrice) searchFilters.minPrice = price.minPrice
    if (price.maxPrice) searchFilters.maxPrice = price.maxPrice

    const hasExplicitSearchTrigger = hasAny(lower, SEARCH_TRIGGERS_EN) || hasAny(lower, SEARCH_TRIGGERS_AR)

    return {
      type: 'search_properties',
      confidence: hasExplicitSearchTrigger ? 0.9 : 0.75,
      entities: searchFilters,
    }
  }

  // Check for greeting
  if (hasAny(lower, GREETING_TRIGGERS)) {
    return {
      type: 'conversation',
      confidence: 0.95,
      entities: { subtype: 'greeting' },
    }
  }

  // Check for general Q&A
  if (hasAny(lower, GENERAL_QA_TRIGGERS)) {
    return {
      type: 'conversation',
      confidence: 0.8,
      entities: { subtype: 'question' },
    }
  }

  // Context-aware detection: if conversation has active filters, a short message
  // like "3 غرف" or "under 10 million" is likely a search refinement
  if (conversationContext && conversationContext.length > 2) {
    const recentFilters = conversationContext.some(m =>
      m.role === 'assistant' && (m.content.includes('filter') || m.content.includes('filter') || m.content.includes('_criteria'))
    )
    if (recentFilters && (bedrooms || price.maxPrice || price.minPrice || locations.length > 0 || propertyType)) {
      const refinementFilters: Record<string, unknown> = {}
      if (locations.length > 0) refinementFilters.city = locations[0]
      if (propertyType) refinementFilters.propertyType = propertyType
      if (bedrooms) refinementFilters.bedrooms = bedrooms
      if (price.minPrice) refinementFilters.minPrice = price.minPrice
      if (price.maxPrice) refinementFilters.maxPrice = price.maxPrice

      return {
        type: 'search_properties',
        confidence: 0.85,
        entities: refinementFilters,
      }
    }
  }

  // Default: conversation
  return {
    type: 'conversation',
    confidence: 0.5,
    entities: { message },
  }
}
