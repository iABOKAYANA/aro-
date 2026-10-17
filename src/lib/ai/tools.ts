import type { OllamaTool } from '@/lib/ai/ollama'

export const AI_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description: 'Search for real estate projects in the database. Use when the user wants to see projects/compounds matching specific criteria (location, budget, bedrooms, property type, etc). Returns project summaries with key details.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City SLUG, never a display name. Use "new-cairo" (New Cairo / التجمع), "sheikh-zayed", "new-zayed", "new-capital-city", "6th-of-october-city", "ain-sokhna", "al-alamein", "ras-el-hekma", "el-gouna", "cairo". For the whole North Coast / Sahel pass "matrouh" as governorate instead (there is no north-coast city).' },
          governorate: { type: 'string', description: 'Region slug for coast-level searches: "matrouh" (North Coast / الساحل), "red-sea" (Hurghada / الغردقة), "giza", "suez", "cairo". Prefer city when the user names a city.' },
          propertyType: { type: 'string', description: 'UPPERCASE enum only: "APARTMENT", "VILLA", "TOWNHOUSE", "DUPLEX", "PENTHOUSE", "STUDIO", "CHALET", "COMMERCIAL", "ADMINISTRATIVE", "MEDICAL", "LAND". Never lowercase.' },
          listingType: { type: 'string', description: 'UPPERCASE enum only: "SALE", "RENT", "RESALE", "INSTALLMENT".' },
          bedrooms: { type: 'number', description: 'Number of bedrooms' },
          minPrice: { type: 'number', description: 'Minimum price in EGP' },
          maxPrice: { type: 'number', description: 'Maximum price in EGP' },
          developerName: { type: 'string', description: 'Filter by developer name' },
          sortBy: { type: 'string', description: '"price_asc", "price_desc", "newest"' },
          limit: { type: 'number', description: 'Max results (default 6)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_units',
      description: 'Search for individual units (apartments, villas, etc). Returns unit details with prices.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City SLUG, never a display name (e.g. "new-cairo", "sheikh-zayed", "new-capital-city"). For the North Coast / Sahel use governorate "matrouh".' },
          propertyType: { type: 'string', description: 'UPPERCASE enum only: "APARTMENT", "VILLA", "TOWNHOUSE", "DUPLEX", "PENTHOUSE", "STUDIO", "CHALET".' },
          bedrooms: { type: 'number', description: 'Number of bedrooms' },
          minPrice: { type: 'number', description: 'Minimum price in EGP' },
          maxPrice: { type: 'number', description: 'Maximum price in EGP' },
          limit: { type: 'number', description: 'Max results (default 6)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_details',
      description: 'Get detailed info about a specific project: description, developer, payment plans, amenities, units.',
      parameters: {
        type: 'object',
        properties: {
          nameOrSlug: { type: 'string', description: 'Project name or slug, e.g. "Eastown", "mountain-view-icity"' },
        },
        required: ['nameOrSlug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_developer_details',
      description: 'Get info about a real estate developer company.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Developer name, e.g. "Mountain View", "SODIC", "Palm Hills"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_projects',
      description: 'Compare 2-4 projects side by side on price, location, developer, payment, amenities.',
      parameters: {
        type: 'object',
        properties: {
          projectNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of 2-4 project names',
          },
        },
        required: ['projectNames'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_payment',
      description: 'Calculate payment breakdown: down payment, installments, monthly payments.',
      parameters: {
        type: 'object',
        properties: {
          unitPrice: { type: 'number', description: 'Total price in EGP' },
          downPaymentPct: { type: 'number', description: 'Down payment %' },
          installmentYears: { type: 'number', description: 'Years for installments' },
          area: { type: 'number', description: 'Area in sqm' },
        },
        required: ['unitPrice'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payment_plans',
      description: 'Get payment plans for a specific project.',
      parameters: {
        type: 'object',
        properties: {
          projectSlug: { type: 'string', description: 'Project slug' },
        },
        required: ['projectSlug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_inquiry',
      description: 'Create a lead/inquiry when user wants to be contacted by a broker.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'User name' },
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email (optional)' },
          message: { type: 'string', description: 'What they are looking for' },
        },
        required: ['name', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_details',
      description: 'READ-ONLY. Get one lead by its public code (EA-10482) or id: status, protection window, attribution, linked deal/commission. Scoped to the caller (broker sees own leads, developer sees own org, admin sees all). Never modifies anything.',
      parameters: {
        type: 'object',
        properties: {
          leadCode: { type: 'string', description: 'Lead code like EA-10482 or lead id' },
        },
        required: ['leadCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_summary',
      description: 'READ-ONLY. Aggregated pipeline numbers for the caller: lead counts by status, lead protection (active/expiring/expired), deals by status with values, commission totals. Uses the signed-in user scope.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_commission',
      description: 'READ-ONLY calculator. Computes the commission split for a deal value using the configured commission rules (project/developer/platform). Returns server-computed amounts — does not create or store anything.',
      parameters: {
        type: 'object',
        properties: {
          dealValue: { type: 'number', description: 'Deal value in EGP' },
          projectId: { type: 'string', description: 'Optional project id for rule resolution' },
          developerId: { type: 'string', description: 'Optional developer id for rule resolution' },
          ruleId: { type: 'string', description: 'Optional explicit commission rule id' },
        },
        required: ['dealValue'],
      },
    },
  },
]
