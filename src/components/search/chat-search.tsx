'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Sparkles, Send, Loader2, Bot, User, MessageSquare, ArrowRight } from 'lucide-react'
import { useSearch, type ChatMessage, type ResponseBlock } from '@/components/search/search-context'
import { ChatPropertyGrid } from '@/components/search/chat-property-grid'
import { ChatComparisonTable } from '@/components/search/chat-comparison-table'
import { ChatPaymentBreakdown } from '@/components/search/chat-payment-breakdown'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'
import { readSSEStream, isSSEResponse } from '@/lib/chat-stream'

const SUGGESTIONS_EN = [
  { icon: '🏠', label: '3 bedroom in New Cairo', query: '3 bedroom apartment in New Cairo' },
  { icon: '💰', label: 'Under 10 million', query: 'Show me properties under 10 million' },
  { icon: '🏗️', label: 'Tell me about Mountain View', query: 'Tell me about Mountain View iCity' },
  { icon: '⚖️', label: 'Compare SODIC vs Mountain View', query: 'Compare SODIC and Mountain View' },
  { icon: '🧮', label: 'Calculate payment for 8M', query: 'Calculate payment for 8 million with 10% down over 7 years' },
]

const SUGGESTIONS_AR = [
  { icon: '🏠', label: 'شقة 3 أوض في التجمع', query: 'عايز شقة 3 أوض في التجمع الخامس' },
  { icon: '💰', label: 'تحت 10 مليون', query: 'وريني عقارات تحت 10 مليون' },
  { icon: '🏗️', label: 'احكيلي عن ماونتن فيو', query: 'احكيلي عن ماونتن فيو آي سيتي' },
  { icon: '⚖️', label: 'قارن سوديك وماونتن فيو', query: 'قارن بين سوديك وماونتن فيو' },
  { icon: '🧮', label: 'احسب قسط 8 مليون', query: 'احسب القسط لشقة بـ 8 مليون بمقدم 10% على 7 سنين' },
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
      case 'filter_update':
        return null // handled by context
      default:
        return null
    }
  })
}

function TextBlock({ content }: { content: string }) {
  // Parse markdown-like bold and line breaks
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <div className="text-xs leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-gray-800 dark:text-white">{part.slice(2, -2)}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
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

export function ChatSearch() {
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'
  const SUGGESTIONS = ar ? SUGGESTIONS_AR : SUGGESTIONS_EN
  const {
    messages, conversationId, isTyping,
    addUserMessage, addAssistantMessage, updateMessage, setConversationId, setIsTyping,
    updateFiltersFromSearch, pushToURL,
  } = useSearch()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const send = useCallback(async (text?: string) => {
    const q = (text || input).trim()
    if (!q || isTyping) return
    setInput('')
    setError(null)

    addUserMessage(q)
    setIsTyping(true)

    try {
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({
          message: q,
          conversationId,
          sessionId: getAnonSessionId(),
          stream: true,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error('Failed to get response')

      if (!isSSEResponse(res)) {
        // Non-stream fallback (offline JSON shape or an older server).
        const data = await res.json()

        if (data.sessionId) persistAnonSessionId(data.sessionId)
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId)
        }

        const msg = data.message

        // Update shared filters if the response includes filter updates
        const filterBlocks = (msg.blocks || []).filter((b: any) => b.type === 'filter_update')
        if (filterBlocks.length > 0) {
          const lastFilter = filterBlocks[filterBlocks.length - 1]
          updateFiltersFromSearch(lastFilter.filters)
        }

        addAssistantMessage({
          role: 'assistant',
          content: msg.content,
          blocks: msg.blocks,
          intent: msg.intent,
        })
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
        if (donePayload.conversationId && !conversationId) {
          setConversationId(donePayload.conversationId)
        }
        const msg = donePayload.message
        const filterBlocks = (msg.blocks || []).filter((b: any) => b.type === 'filter_update')
        if (filterBlocks.length > 0) {
          const lastFilter = filterBlocks[filterBlocks.length - 1]
          updateFiltersFromSearch(lastFilter.filters)
        }
        if (streamId) updateMessage(streamId, { content: msg.content, blocks: msg.blocks, intent: msg.intent })
        else {
          addAssistantMessage({
            role: 'assistant',
            content: msg.content,
            blocks: msg.blocks,
            intent: msg.intent,
          })
        }
      } else if (errorPayload) {
        const content = errorPayload.content || (ar ? 'حصلت مشكلة. جرب تاني.' : 'Something went wrong. Please try again.')
        console.error('AI chat stream failed:', errorPayload)
        setError(content)
        if (streamId) updateMessage(streamId, { content })
        else {
          addAssistantMessage({
            role: 'assistant',
            content,
          })
        }
      }
      // Neither done nor error = aborted: leave any partial bubble as-is.
    } catch (err: any) {
      if (err.name === 'AbortError') return
      console.error('AI chat failed:', err)
      setError(ar ? 'حصلت مشكلة. جرب تاني.' : 'Something went wrong. Please try again.')
      addAssistantMessage({
        role: 'assistant',
        content: ar
          ? 'معلش، حصلت مشكلة. جرب تاني أو قول سؤالك بطريقة تانية.'
          : "I'm sorry, I encountered an error. Please try again or rephrase your question.",
      })
    } finally {
      setIsTyping(false)
    }
  }, [input, isTyping, conversationId, addUserMessage, addAssistantMessage, updateMessage, setConversationId, setIsTyping, updateFiltersFromSearch, ar])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showSuggestions = messages.length === 0

  return (
    <div className="flex flex-col rounded-2xl border border-[#D4A843]/15 bg-white shadow-lg overflow-hidden dark:border-[#D4A84333] dark:bg-[#0A0A0A]" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-[#262626]">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A843] to-[#B8922E]">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-gray-800 dark:text-white">{ar ? 'المساعد الذكي' : 'AI Assistant'}</span>
          <span className="ms-2 text-[10px] text-gray-400">{ar ? 'خبير العقارات' : 'Real estate expert'}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-green-600">{ar ? 'متصل' : 'Online'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-h-[500px] min-h-[200px] overflow-y-auto px-4 py-3 space-y-4">
        {showSuggestions ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D4A843]/10 mt-0.5">
                <Bot className="h-3 w-3 text-[#D4A843]" />
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-700 rounded-tl-sm dark:border-[#262626] dark:bg-black dark:text-gray-300">
                {ar
                  ? 'أهلاً! أنا عين، مساعدك في غاية. أقدر أساعدك تلاقي عقارات، تقارن مشاريع، تحسب الأقساط، وأكتر. بتدور على إيه؟'
                  : "Hi! I'm Ayn, your GHAYA assistant. I can help you find properties, compare projects, calculate payments, and more. What are you looking for?"}
              </div>
            </div>
            <div className="ms-8 grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.query)}
                  className="flex items-center gap-2 rounded-full border border-gray-100 px-3 py-2 text-start text-xs text-gray-600 transition-all hover:border-[#D4A843]/30 hover:bg-[#D4A843]/5 hover:text-[#B8922E] dark:border-[#262626] dark:bg-black dark:text-gray-300"
                >
                  <span>{s.icon}</span>
                  <span className="flex-1">{s.label}</span>
                  <ArrowRight className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#D4A843]/10 mt-0.5">
                  <Bot className="h-3 w-3 text-[#D4A843]" />
                </div>
              )}
              <div className={cn(
                'max-w-[85%] break-words rounded-xl px-3 py-2 [overflow-wrap:anywhere]',
                msg.role === 'user'
                  ? 'bg-[#D4A843] text-white rounded-tr-sm'
                  : 'bg-gray-50 border border-gray-100 rounded-tl-sm space-y-1 dark:border-[#262626] dark:bg-black dark:text-gray-200'
              )}>
                {msg.role === 'user' ? (
                  <p className="text-xs leading-relaxed">{msg.content}</p>
                ) : (
                  <>
                    {msg.blocks && msg.blocks.length > 0 ? (
                      renderBlocks(msg.blocks)
                    ) : (
                      <TextBlock content={msg.content} />
                    )}
                  </>
                )}
                {msg.chips && msg.chips.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.chips.map((c) => (
                      <span key={c.field} className="inline-block rounded-full bg-[#D4A843]/10 px-2 py-0.5 text-[10px] font-medium text-[#B8922E]">
                        {c.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 mt-0.5 dark:bg-[#262626]">
                  <User className="h-3 w-3 text-gray-500 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D4A843]/10">
              <Loader2 className="h-3 w-3 animate-spin text-[#D4A843]" />
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-400 rounded-tl-sm dark:border-[#262626] dark:bg-black">
              <div className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '0ms' }} />
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '150ms' }} />
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#D4A843]" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-3 py-2 dark:border-[#262626] dark:bg-black">
        {error && (
          <div className="mb-1.5 rounded-2xl bg-red-50 px-2.5 py-1 text-[10px] text-red-500">{error}</div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="send"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ar ? 'اسأل عن العقارات والمشاريع والأقساط...' : 'Ask about properties, projects, or payments...'}
            className="flex-1 border-0 bg-transparent px-2 py-1.5 text-base text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white"
          />
          <button
            onClick={() => send()}
            disabled={isTyping || !input.trim()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-all',
              input.trim() && !isTyping
                ? 'bg-[#D4A843] text-white hover:bg-[#B8922E] shadow-sm'
                : 'bg-gray-100 text-gray-400 dark:bg-[#262626] dark:text-gray-400'
            )}
          >
            <Send className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  )
}
