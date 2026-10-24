'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Send, Loader2, Bot, User, Building2, MapPin, DollarSign, Calculator, ArrowRight, X, Wifi, WifiOff } from 'lucide-react'
import { useSearch, type ResponseBlock } from '@/components/search/search-context'
import { ChatPropertyGrid } from '@/components/search/chat-property-grid'
import { ChatComparisonTable } from '@/components/search/chat-comparison-table'
import { ChatPaymentBreakdown } from '@/components/search/chat-payment-breakdown'
import { BrandMark } from '@/components/layout/brand-logo'
import { useChatAutoScroll } from '@/components/search/use-chat-auto-scroll'
import { cn } from '@/lib/utils'
import { readSSEStream, isSSEResponse } from '@/lib/chat-stream'

const QUICK_ACTIONS = [
  { label: 'شقق', labelEn: 'Apartments', query: 'عايز شقة', icon: Building2 },
  { label: 'فلل', labelEn: 'Villas', query: 'عايز فيلا', icon: Building2 },
  { label: 'استثمار', labelEn: 'Investment', query: 'عايز حاجة للاستثمار', icon: DollarSign },
  { label: 'أقل مقدم', labelEn: 'Low DP', query: 'أقل مقدم', icon: Calculator },
  { label: 'جاهز', labelEn: 'Ready', query: 'جاهز للاستلام', icon: MapPin },
  { label: 'قارن', labelEn: 'Compare', query: 'قارن المشاريع', icon: ArrowRight },
]

const SUGGESTIONS = [
  { label: 'مشاريع في New Cairo', labelEn: 'Projects in New Cairo', query: 'Show me projects in New Cairo' },
  { label: '3 غرف تحت 10M', labelEn: '3BR under 10M', query: '3 bedroom apartment in New Cairo under 10 million' },
  { label: 'حساب أقساط', labelEn: 'Payment calc', query: 'Calculate payment for 8 million with 10% down over 7 years' },
  { label: ' info عن Mountain View', labelEn: 'About Mountain View', query: 'Tell me about Mountain View iCity' },
]

function renderBlocks(blocks: ResponseBlock[]) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'text':
        return <TextBlock key={i} content={block.content} />
      case 'property_grid':
        return <ChatPropertyGrid key={i} title={block.title} projects={block.projects} units={block.units} total={block.total} />
      case 'comparison':
        return <ChatComparisonTable key={i} title={block.title} data={block.data} />
      case 'payment':
        return <ChatPaymentBreakdown key={i} title={block.title} calculation={block.calculation} />
      default:
        return null
    }
  })
}

function TextBlock({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

export function FullPageChat() {
  const {
    filters, messages, conversationId, isTyping, activeCount,
    addUserMessage, addAssistantMessage, updateMessage, setConversationId, setIsTyping,
    updateFiltersFromSearch, clearFilters, pushToURL,
  } = useSearch()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<'loading' | 'online' | 'offline'>('loading')
  const [logoOk, setLogoOk] = useState(true)
  const scrollPanelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Check AI status on mount
  useEffect(() => {
    fetch('/api/ai/status')
      .then(r => r.json())
      .then(data => setAiStatus(data.available && data.modelInstalled ? 'online' : 'offline'))
      .catch(() => setAiStatus('offline'))
  }, [])

  // Extract property grid blocks for the results panel
  const lastPropertyGrid = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && msg.blocks) {
        const grid = msg.blocks.find(b => b.type === 'property_grid')
        if (grid) return grid as Extract<ResponseBlock, { type: 'property_grid' }>
      }
    }
    return null
  }, [messages])

  const showResults = lastPropertyGrid && lastPropertyGrid.total > 0

  // Reader-respecting auto-scroll: panel-only, never on open, follows only
  // while the reader is at the bottom (see use-chat-auto-scroll.ts).
  const { restick } = useChatAutoScroll(scrollPanelRef, [messages, isTyping])

  const send = useCallback(async (text?: string) => {
    const q = (text || input).trim()
    if (!q || isTyping) return
    setInput('')
    setError(null)
    addUserMessage(q)
    restick()
    setIsTyping(true)
    try {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ message: q, conversationId, sessionId: getAnonSessionId(), stream: true }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error('Failed')
      if (!isSSEResponse(res)) {
        // Non-stream fallback (offline JSON shape or an older server).
        const data = await res.json()
        if (data.sessionId) persistAnonSessionId(data.sessionId)
        if (data.conversationId && !conversationId) setConversationId(data.conversationId)
        const msg = data.message
        const filterBlocks = (msg.blocks || []).filter((b: any) => b.type === 'filter_update')
        if (filterBlocks.length > 0) updateFiltersFromSearch(filterBlocks[filterBlocks.length - 1].filters)
        addAssistantMessage({ role: 'assistant', content: msg.content, blocks: msg.blocks, intent: msg.intent })
        return
      }
      // Streaming: tokens patch one bubble in place; `done` carries the
      // authoritative (post language-guard, persisted) payload.
      let acc = ''
      let streamId: string | null = null
      let donePayload: any = null
      let errorPayload: any = null
      const ensureBubble = () => {
        if (!streamId) {
          // First token arrived — swap the typing spinner for live text.
          setIsTyping(false)
          streamId = addAssistantMessage({ role: 'assistant', content: '' })
        }
        return streamId
      }
      await readSSEStream(res, (event, data) => {
        if (event === 'meta') {
          if (data.sessionId) persistAnonSessionId(data.sessionId)
          if (data.conversationId && !conversationId) setConversationId(data.conversationId)
        } else if (event === 'token') {
          acc += data?.text || ''
          updateMessage(ensureBubble(), { content: acc })
        } else if (event === 'done') {
          donePayload = data
        } else if (event === 'error') {
          errorPayload = data
        }
        // `status` events: the typing spinner already covers the wait.
      })
      if (donePayload) {
        if (donePayload.sessionId) persistAnonSessionId(donePayload.sessionId)
        if (donePayload.conversationId && !conversationId) setConversationId(donePayload.conversationId)
        const msg = donePayload.message
        const filterBlocks = (msg.blocks || []).filter((b: any) => b.type === 'filter_update')
        if (filterBlocks.length > 0) updateFiltersFromSearch(filterBlocks[filterBlocks.length - 1].filters)
        if (streamId) updateMessage(streamId, { content: msg.content, blocks: msg.blocks, intent: msg.intent })
        else addAssistantMessage({ role: 'assistant', content: msg.content, blocks: msg.blocks, intent: msg.intent })
      } else if (errorPayload) {
        const content = errorPayload.content || (lang === 'ar' ? 'حصل مشكلة. جرّب تاني.' : 'Something went wrong. Try again.')
        setError(content)
        if (streamId) updateMessage(streamId, { content })
        else addAssistantMessage({ role: 'assistant', content })
      }
      // Neither done nor error = aborted: leave any partial bubble as-is.
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(lang === 'ar' ? 'حصل مشكلة. جرّب تاني.' : 'Something went wrong. Try again.')
      addAssistantMessage({ role: 'assistant', content: lang === 'ar' ? 'حصل مشكلة. جرّب تاني.' : 'Sorry, an error occurred.' })
    } finally {
      setIsTyping(false)
    }
  }, [input, isTyping, conversationId, addUserMessage, addAssistantMessage, updateMessage, setConversationId, setIsTyping, updateFiltersFromSearch, restick])

  // Detect if last user message was Arabic
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const lang = lastUserMsg ? (lastUserMsg.content.match(/[\u0600-\u06FF]/) ? 'ar' : 'en') : 'ar'

  // Auto-send a question typed in the homepage AI box (?q=...)
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (autoSentRef.current) return
    const q = new URLSearchParams(window.location.search).get('q')?.trim()
    if (q && messages.length === 0 && !isTyping) {
      autoSentRef.current = true
      send(q)
    }
  }, [send, messages.length, isTyping])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const showWelcome = messages.length === 0

  return (
    <div className="flex h-full flex-col overflow-hidden" dir="auto">
      {/* Main: Chat + Results split */}
      <div className="flex flex-1 min-h-0">
        {/* Chat Panel */}
        <div className={cn(
          'flex flex-col min-h-0',
          showResults ? 'w-full lg:w-[45%] lg:border-r border-gray-200 dark:border-[#262626]' : 'w-full'
        )}>
          {/* Chat Messages — the scroller the auto-scroll hook controls */}
          <div ref={scrollPanelRef} className="flex-1 overflow-y-auto min-h-0 px-3 py-4 sm:px-4 md:px-6">
            <div className="mx-auto max-w-2xl space-y-4">
              {showWelcome ? (
                <div className="space-y-6 pt-4 sm:pt-8">
                  <div className="text-center">
                    {logoOk ? (
                      <Image
                        src="/images/ghaya-logo.png"
                        alt="GHAYA Real Estate"
                        width={160}
                        height={64}
                        onError={() => setLogoOk(false)}
                        className="mx-auto mb-3 h-16 w-auto rounded-2xl object-contain shadow-lg"
                      />
                    ) : (
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-900 to-black shadow-lg">
                        <BrandMark className="h-9 w-9" />
                      </div>
                    )}
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">
                      {lang === 'ar' ? 'عين' : 'Ayn'}
                    </h1>
                    <p className="mt-1.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {lang === 'ar' ? 'قولي بتدور على إيه وأنا هساعدك' : 'Tell me what you\'re looking for'}
                    </p>
                    {/* AI Status Indicator */}
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {aiStatus === 'loading' && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                          <span className="text-[11px] text-gray-400">{lang === 'ar' ? 'جاري التحقق...' : 'Checking...'}</span>
                        </>
                      )}
                      {aiStatus === 'online' && (
                        <>
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          <span className="text-[11px] text-green-600">{lang === 'ar' ? 'المساعد الذكي متصل' : 'AI Online'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {QUICK_ACTIONS.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => send(a.query)}
                        className="flex flex-col items-center gap-1 rounded-2xl border border-gray-200 p-2.5 sm:p-3 transition-all hover:border-[#D4A843]/40 hover:bg-[#D4A843]/5 active:scale-95 dark:border-[#262626] dark:bg-[#0A0A0A]"
                      >
                        <a.icon className="h-4 w-4 sm:h-5 sm:w-5 text-[#D4A843]" />
                        <span className="text-[11px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{a.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Suggestions */}
                  <div className="space-y-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => send(s.query)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-left transition-all hover:border-[#D4A843]/30 hover:bg-[#D4A843]/5 dark:border-[#262626] dark:bg-[#0A0A0A]"
                      >
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-[#D4A843] rtl:rotate-180" />
                        <span className="text-sm text-gray-600 group-hover:text-[#D4A843] dark:text-gray-300">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#D4A843]/10 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-[#D4A843]" />
                      </div>
                    )}
                    <div className={cn(
                      'max-w-[85%] break-words rounded-2xl px-3.5 py-2.5 [overflow-wrap:anywhere]',
                      msg.role === 'user'
                        ? 'bg-[#D4A843] text-white rounded-br-sm'
                        : 'bg-gray-50 border border-gray-100 rounded-bl-sm dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-200'
                    )}>
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {msg.blocks && msg.blocks.length > 0 ? (
                            <>
                              {renderBlocks(msg.blocks.filter(b => b.type !== 'property_grid'))}
                              {/* Mobile has no results panel — render cards inline (hidden on lg). */}
                              {msg.blocks.some(b => b.type === 'property_grid') && (
                                <div className="lg:hidden">
                                  {renderBlocks(msg.blocks.filter(b => b.type === 'property_grid'))}
                                </div>
                              )}
                            </>
                          ) : (
                            <TextBlock content={msg.content} />
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 mt-0.5 dark:bg-[#262626]">
                        <User className="h-3.5 w-3.5 text-gray-500 dark:text-gray-300" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {isTyping && (
                <div className="flex gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D4A843]/10">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4A843]" />
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3.5 py-2.5 rounded-bl-sm dark:border-[#262626] dark:bg-[#0A0A0A]">
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div />
            </div>
          </div>

          {/* Input Area — safe-area padding keeps it above the iOS home bar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-4 dark:border-[#262626] dark:bg-black">
            {/* Active filter chips */}
            {activeCount > 0 && (
              <div className="mx-auto mb-2 flex max-w-2xl flex-wrap gap-1.5">
                {Object.entries(filters).filter(([k, v]) => v && v !== '' && k !== 'page' && !(k === 'sortBy' && v === 'newest')).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 rounded-full bg-[#D4A843]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#B8922E]">
                    {String(val).replace(/-/g, ' ')}
                    <button
                      type="button"
                      aria-label={lang === 'ar' ? `إزالة فلتر ${key}` : `Remove ${key} filter`}
                      onClick={() => { clearFilters(); setTimeout(() => pushToURL(), 0) }}
                      className="ml-0.5 hover:text-red-500"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mx-auto max-w-2xl">
              {error && <div className="mb-2 rounded-2xl bg-red-50 px-3 py-1.5 text-xs text-red-500">{error}</div>}
              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-1.5 transition-colors focus-within:border-[#D4A843]/40 focus-within:bg-white dark:border-[#262626] dark:bg-[#0A0A0A] dark:focus-within:bg-black">
                <input
                  ref={inputRef}
                  type="text"
                  enterKeyHint="send"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === 'ar' ? 'اسأل عن عقارات، مشاريع، أو أقساط...' : 'Ask about properties, projects, or payments...'}
                  className="flex-1 bg-transparent px-2 py-2 text-base text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white"
                />
                <button
                  type="button"
                  aria-label={lang === 'ar' ? 'إرسال الرسالة' : 'Send message'}
                  onClick={() => send()}
                  disabled={isTyping || !input.trim()}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full transition-all',
                    input.trim() && !isTyping
                      ? 'bg-[#D4A843] text-white hover:bg-[#B8922E] shadow-sm'
                      : 'bg-gray-200 text-gray-400 dark:bg-[#262626] dark:text-gray-400'
                  )}
                >
                  <Send className="h-5 w-5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Panel (desktop only) */}
        {showResults && (
          <div className="hidden lg:flex lg:w-[55%] flex-col min-h-0 bg-gray-50/50 dark:bg-black">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-[#262626]">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {lastPropertyGrid.total} {lang === 'ar' ? 'نتيجة' : 'results'}
              </span>
              <button
                onClick={() => pushToURL()}
                className="text-xs text-[#D4A843] hover:underline"
              >
                {lang === 'ar' ? 'فتح في صفحة كاملة' : 'View full page'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {lastPropertyGrid.projects?.map((p: any) => (
                  <a
                    key={p.id}
                    href={`/projects/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 transition-all hover:border-[#D4A843]/30 hover:shadow-sm dark:border-[#262626] dark:bg-[#0A0A0A]"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-gray-800 group-hover:text-[#D4A843] dark:text-white">{p.name}</h4>
                      {p.developerName && <p className="text-[11px] text-gray-400">{p.developerName}</p>}
                      {p.city && <p className="text-[11px] text-gray-400">📍 {p.city}</p>}
                      <div className="mt-1.5 flex items-center gap-2">
                        {p.startPrice && <span className="text-xs font-bold text-[#D4A843]">{formatEGP(p.startPrice)} ج.م</span>}
                        {p.unitCount > 0 && <span className="text-[11px] text-gray-400">{p.unitCount} وحدة</span>}
                      </div>
                      {p.propertyTypes?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.propertyTypes.slice(0, 2).map((t: string) => (
                            <span key={t} className="rounded-full bg-gray-50 px-1.5 py-0.5 text-[9px] text-gray-500 dark:bg-black dark:text-gray-400">{t.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
                {lastPropertyGrid.units?.map((u: any) => (
                  <a
                    key={u.id}
                    href={`/units/${u.slug || u.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-gray-200 bg-white p-3 transition-all hover:border-[#D4A843]/30 hover:shadow-sm dark:border-[#262626] dark:bg-[#0A0A0A]"
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="truncate text-sm font-semibold text-gray-800 group-hover:text-[#D4A843] dark:text-white">{u.projectName}</h4>
                      <span className="flex-shrink-0 rounded-full bg-[#D4A843]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#B8922E]">{u.unitType.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                      {u.bedrooms != null && <span>🛏 {u.bedrooms}</span>}
                      {u.bathrooms != null && <span>🚿 {u.bathrooms}</span>}
                      <span>📐 {u.area}m²</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#D4A843]">{formatEGP(u.price)} ج.م</span>
                      {u.pricePerSqm && <span className="text-[11px] text-gray-400">{formatEGP(u.pricePerSqm)}/m²</span>}
                    </div>
                  </a>
                ))}
              </div>
              {lastPropertyGrid.total > (lastPropertyGrid.projects?.length || lastPropertyGrid.units?.length || 0) && (
                <button
                  onClick={() => pushToURL()}
                  className="mt-4 flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-gray-300 py-2.5 text-xs text-gray-500 transition-colors hover:border-[#D4A843]/30 hover:text-[#D4A843] dark:border-[#262626] dark:text-gray-400"
                >
                  {lang === 'ar' ? `عرض كل ${lastPropertyGrid.total} نتيجة` : `View all ${lastPropertyGrid.total} results`}
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatEGP(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`
  return amount.toLocaleString()
}

// Anonymous continuations must present the conversation's matching sessionId
// (server IDOR guard) — one persistent id per browser, SSR-safe.
const ANON_SESSION_KEY = 'ghaya-anon-session'
function getAnonSessionId(): string {
  try {
    if (typeof window === 'undefined') return ''
    let id = window.localStorage.getItem(ANON_SESSION_KEY)
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
      window.localStorage.setItem(ANON_SESSION_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
function persistAnonSessionId(id: unknown) {
  try {
    if (typeof id === 'string' && id && typeof window !== 'undefined') {
      window.localStorage.setItem(ANON_SESSION_KEY, id)
    }
  } catch {
    // Storage blocked — the in-memory conversation still works for this tab.
  }
}
