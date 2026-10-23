'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Brain, Send, Loader2, Sparkles, MapPin, Bed, Maximize, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatEGP, formatSQM } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

const exampleQueriesEn = [
  'I have 5 million EGP and want a 2-bedroom apartment in New Cairo with installments',
  'Find me a villa with a garden in Sheikh Zayed under 20 million',
  'Show me studios for rent in the Fifth Settlement',
  'What are the best investment compounds in the New Capital?',
]

const exampleQueriesAr = [
  'معايا 5 مليون جنيه وعايز شقة أوضتين في التجمع الخامس بالتقسيط',
  'عايز فيلا بجنينة في الشيخ زايد تحت 20 مليون',
  'عايز ستوديو للإيجار في التجمع الخامس',
  'إيه أحسن كومبوندات للاستثمار في العاصمة الإدارية؟',
]

export default function AISearchPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const exampleQueries = ar ? exampleQueriesAr : exampleQueriesEn

  const handleSearch = async () => {
    if (!query.trim()) return
    setIsLoading(true)
    setResults(null)

    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setResults(data)
    } catch (err) {
      console.error('AI search failed:', err)
      setResults({ error: ar ? 'البحث فشل. جرب تاني.' : 'Search failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-center sm:mb-8">
          <Badge variant="gold" className="mb-3">
            <Sparkles className="me-1 h-3 w-3" /> {ar ? 'بالذكاء الاصطناعي' : 'AI-Powered'}
          </Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">{ar ? 'البحث بالذكاء الاصطناعي' : 'AI Property Search'}</h1>
          <p className="mt-2 text-muted-foreground">
            {ar ? 'اوصف اللي بتدور عليه بكلام عادي' : 'Describe what you\u2019re looking for in natural language'}
          </p>
        </div>

        <Card className="mb-6 sm:mb-8">
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ar ? 'مثال: عايز شقة 3 أوض في التجمع الخامس تحت 10 مليون جنيه...' : 'e.g., I want a 3-bedroom apartment in New Cairo under 10M EGP...'}
                className="min-w-0 text-base"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button
                onClick={handleSearch}
                disabled={isLoading || !query.trim()}
                className="shrink-0 bg-estate-gold hover:bg-estate-gold-dark"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">{ar ? 'جرّب:' : 'Try:'}</span>
              {exampleQueries.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  className="min-h-[36px] rounded-full border px-3 py-1 text-xs transition-colors hover:border-estate-gold hover:text-estate-gold"
                >
                  {q.length > 50 ? q.slice(0, 50) + '...' : q}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-estate-gold" />
            <p className="mt-4 text-muted-foreground">{ar ? 'بندور على عقارات...' : 'Searching properties...'}</p>
          </div>
        )}

        {results?.error && !isLoading && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-red-500">{results.error}</p>
            </CardContent>
          </Card>
        )}

        {results && !results.error && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-estate-gold" />
                  <h3 className="font-semibold">{ar ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}</h3>
                </div>
                <p className="text-muted-foreground">{results.explanation}</p>
                {results.extractedFilters && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {results.extractedFilters.budget?.max && (
                      <Badge variant="gold">{ar ? 'الميزانية: لحد ' : 'Budget: up to '}{formatEGP(results.extractedFilters.budget.max)}</Badge>
                    )}
                    {results.extractedFilters.location && (
                      <Badge variant="secondary">{ar ? 'المكان: ' : 'Location: '}{results.extractedFilters.location}</Badge>
                    )}
                    {results.extractedFilters.bedrooms && (
                      <Badge variant="secondary">{results.extractedFilters.bedrooms}{ar ? ' أوض' : ' Bedrooms'}</Badge>
                    )}
                    {results.extractedFilters.propertyType && (
                      <Badge variant="secondary">{results.extractedFilters.propertyType}</Badge>
                    )}
                    {results.extractedFilters.listingType && (
                      <Badge variant="secondary">{results.extractedFilters.listingType}</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {results.projects?.length > 0 && (
              <div>
                <h3 className="mb-3 text-lg font-semibold">{ar ? `مشاريع مناسبة (${results.totalProjects})` : `Matching Projects (${results.totalProjects})`}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {results.projects.map((project: any) => (
                    <Card key={project.id} className="card-hover">
                      <CardContent className="p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant={
                            project.status === 'AVAILABLE' ? 'success' :
                            project.status === 'UNDER_CONSTRUCTION' ? 'info' : 'secondary'
                          }>
                            {project.status.replace(/_/g, ' ')}
                          </Badge>
                          {project.developer?.isVerified && <Badge variant="info">{ar ? 'موثّق' : 'Verified'}</Badge>}
                        </div>
                        <Link href={`/projects/${project.slug}`} className="font-semibold hover:text-estate-gold">
                          {project.name}
                        </Link>
                        <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 break-words">{[project.district?.name, project.city?.name, project.governorate?.name].filter(Boolean).join(', ')}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{project.developer?.companyName}</p>
                        {project.startPrice && (
                          <p className="mt-2 font-semibold text-estate-gold">
                            {ar ? 'من ' : 'From '}{formatEGP(project.startPrice)}
                          </p>
                        )}
                        {project.units?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {project.units.slice(0, 2).map((unit: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Bed className="h-3 w-3" />{unit.bedrooms || '?'}{ar ? ' أوض' : 'BR'}
                                <Maximize className="h-3 w-3" />{formatSQM(unit.area)}
                                <span className="font-medium text-estate-gold">{formatEGP(unit.price)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {results.units?.length > 0 && (
              <div>
                <h3 className="mb-3 text-lg font-semibold">{ar ? `وحدات مناسبة (${results.totalUnits})` : `Matching Units (${results.totalUnits})`}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {results.units.map((unit: any) => (
                    <Card key={unit.id} className="card-hover">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="gold">{unit.unitType}</Badge>
                          <Badge variant="secondary">{unit.listingType}</Badge>
                        </div>
                        <Link href={`/units/${unit.slug || unit.id}`} className="font-semibold hover:text-estate-gold">
                          {unit.project.name} - {unit.name}
                        </Link>
                        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                          {unit.bedrooms != null && <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" />{unit.bedrooms}{ar ? ' أوض' : 'BR'}</span>}
                          <span className="flex items-center gap-1"><Maximize className="h-3.5 w-3.5" />{formatSQM(unit.area)}</span>
                        </div>
                        <p className="mt-2 text-lg font-bold text-estate-gold">{formatEGP(unit.price)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {results.projects?.length === 0 && results.units?.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Brain className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <h3 className="mt-4 text-lg font-semibold">{ar ? 'مفيش نتايج' : 'No matches found'}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {ar ? 'جرب تغير كلام البحث أو اتفرج على كل المشاريع.' : 'Try adjusting your search criteria or browse all projects.'}
                  </p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link href="/projects">{ar ? 'اتفرج على كل المشاريع' : 'Browse All Projects'}</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!results && !isLoading && (
          <div className="py-12 text-center">
            <Brain className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              {ar ? 'اكتب اللي بتدور عليه فوق عشان نبدأ' : 'Enter a search query above to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
