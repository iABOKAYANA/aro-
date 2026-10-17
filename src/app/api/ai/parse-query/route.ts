import { NextResponse } from 'next/server'
import { parseNaturalLanguageQuery } from '@/lib/ai-search-parser'
import { propertyFilterSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (query.length > 500) {
      return NextResponse.json({ error: 'Query too long (max 500 characters)' }, { status: 400 })
    }

    const parsed = parseNaturalLanguageQuery(query)

    // Validate filters against the schema
    const validation = propertyFilterSchema.safeParse(parsed.filters)
    if (!validation.success) {
      return NextResponse.json({
        filters: parsed.filters,
        summary: parsed.summary,
        confidence: parsed.confidence,
        warnings: validation.error.issues.map(i => i.message),
      })
    }

    return NextResponse.json({
      filters: validation.data,
      summary: parsed.summary,
      confidence: parsed.confidence,
      query: query.trim(),
    })
  } catch (error) {
    console.error('AI parse query error:', error)
    return NextResponse.json({ error: 'Failed to parse query' }, { status: 500 })
  }
}
