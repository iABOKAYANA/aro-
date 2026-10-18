'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  TrendingUp,
  Users,
  MapPin,
  BarChart3,
  Zap,
  RefreshCw,
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import { useChatAutoScroll } from '@/components/search/use-chat-auto-scroll'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  data?: AIResponseData
  timestamp: Date
}

interface AIResponseData {
  type: string
  title: string
  summary: string
  items?: { label: string; value: string | number; trend?: string }[]
  chart?: { labels: string[]; values: number[] }
  insight?: string
}

const quickQuestions = [
  { text: 'Which projects have the most inquiries?', textAr: 'أنهي مشاريع عليها أكتر استفسارات؟', icon: TrendingUp },
  { text: 'How many leads are unassigned?', textAr: 'في كام ليد مش متوزع؟', icon: Users },
  { text: 'Which locations have highest demand?', textAr: 'أنهي مناطق عليها أعلى طلب؟', icon: MapPin },
  { text: 'What is the conversion rate?', textAr: 'نسبة التحويل كام؟', icon: BarChart3 },
  { text: 'Which brokers are performing best?', textAr: 'أنهي بروكرز شغالين أحسن حاجة؟', icon: Zap },
  { text: 'Show me lead status breakdown', textAr: 'ورّيني توزيعة حالات الليدز', icon: RefreshCw },
]

const WELCOME_EN =
  'Welcome to your AI Command Center. I have real-time access to your business data. Ask me anything about leads, projects, brokers, or performance metrics.'
const WELCOME_AR =
  'أهلًا بيك في مركز الذكاء الاصطناعي. عندي وصول لحظي لبيانات الشغل بتاعتك. اسألني أي حاجة عن الليدز أو المشاريع أو البروكرز أو مؤشرات الأداء.'

export default function CEOAIPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: lang === 'ar' ? WELCOME_AR : WELCOME_EN,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reader-respecting auto-scroll: panel-only, never on open, follows only
  // while the reader is at the bottom (see use-chat-auto-scroll.ts).
  const { restick } = useChatAutoScroll(scrollRef, [messages])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    restick()
    setInput('')
    setLoading(true)

    // Hard timeout: a hung connection must never leave the spinner stuck
    // (the send button is disabled while `loading` — an unanswered fetch
    // would lock the page forever).
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)

    const fail = (content: string) =>
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content, timestamp: new Date() },
      ])

    try {
      const res = await fetch('/api/ceo/ai', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, lang }),
        signal: ctrl.signal,
      })

      if (res.status === 401 || res.status === 403) {
        fail(ar ? 'جلسة الدخول خلصت — ادخل من جديد تاني من صفحة الدخول وحاول بعد كده.' : 'Your session has expired — please sign in again and retry.')
        return
      }
      if (!res.ok) {
        fail(ar ? `السيرفر رجّع خطأ (${res.status}) — جرّب تاني بعد شوية.` : `The server returned an error (${res.status}) — please retry shortly.`)
        return
      }

      const data = await res.json()
      if (!data.answer) {
        fail(ar ? 'مفيش رد وصل.' : 'No response received.')
        return
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        data: data.structured,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      fail(
        aborted
          ? ar
            ? 'المشغل أخد أكتر من الوقت المسموح (٢٠ ثانية) — جرّب تاني.'
            : 'The request timed out (20s) — please try again.'
          : ar
            ? 'معلش، حصلت مشكلة وأنا بعالج طلبك. حاول تاني.'
            : 'Sorry, I encountered an error processing your request. Please try again.'
      )
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-estate-gold to-yellow-600 shadow-lg shadow-estate-gold/20">
            <Sparkles className="h-5 w-5 text-foreground" />
          </div>
          <Reveal>
            <p className="section-kicker">{ar ? 'لوحة المدير · الذكاء الاصطناعي' : 'CEO Console · AI'}</p>
            <h1 className="font-display display-3 text-foreground">{ar ? 'مركز الذكاء الاصطناعي' : 'AI Command Center'}</h1>
            <p className="text-sm text-gray-400">{ar ? 'ذكاء لحظي لبيزنس الشغل' : 'Real-time business intelligence'}</p>
            <hr className="gold-hairline mt-4" />
          </Reveal>
        </div>
        <Badge variant="outline" className="border-estate-gold/30 bg-estate-gold/10 text-estate-gold">
          <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-estate-gold" />
          {ar ? 'لايف' : 'Live'}
        </Badge>
      </div>

      {/* Quick questions */}
      <div className="flex flex-wrap gap-2">
        {quickQuestions.map((q) => (
          <button
            key={q.text}
            onClick={() => sendMessage(ar ? q.textAr : q.text)}
            disabled={loading}
            className="flex items-center gap-2 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-2 text-sm text-gray-300 transition-all hover:border-estate-gold/40 hover:bg-estate-gold/10 hover:text-estate-gold disabled:opacity-50"
          >
            <q.icon className="h-3.5 w-3.5" />
            {ar ? q.textAr : q.text}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-estate-gold/15">
                <Bot className="h-4 w-4 text-estate-gold" />
              </div>
            )}

            <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              {msg.role === 'user' ? (
                <div className="rounded-2xl rounded-br-md bg-card dark:bg-black/80 px-4 py-3 text-sm text-foreground ring-1 ring-border dark:ring-[#262626]">
                  {msg.content}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl rounded-bl-md bg-card dark:bg-[#0A0A0A] px-4 py-3 text-sm text-gray-200 ring-1 ring-border dark:ring-[#262626] backdrop-blur-sm">
                    {msg.content}
                  </div>

                  {msg.data && (
                    <Card className="border-estate-gold/20 bg-estate-gold/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-estate-gold">
                          {msg.data.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {msg.data.summary && (
                          <p className="text-sm text-gray-300">{msg.data.summary}</p>
                        )}
                        {msg.data.items && (
                          <div className="space-y-2">
                            {msg.data.items.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded-2xl bg-card dark:bg-[#0A0A0A] px-3 py-2"
                              >
                                <span className="text-sm text-gray-300">{item.label}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">
                                    {item.value}
                                  </span>
                                  {item.trend && (
                                    <span
                                      className={`text-xs ${
                                        item.trend.startsWith('+')
                                          ? 'text-green-400'
                                          : item.trend.startsWith('-')
                                            ? 'text-red-400'
                                            : 'text-gray-500'
                                      }`}
                                    >
                                      {item.trend}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.data.insight && (
                          <div className="mt-2 border-t border-estate-gold/20 pt-2">
                            <p className="text-xs text-estate-gold/80">
                              <span className="font-semibold">{ar ? 'الخلاصة:' : 'Insight:'}</span> {msg.data.insight}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-card dark:bg-[#0A0A0A]">
                <User className="h-4 w-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-estate-gold/15">
              <Bot className="h-4 w-4 text-estate-gold" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-card dark:bg-[#0A0A0A] px-4 py-3 ring-1 ring-border dark:ring-[#262626]">
              <Loader2 className="h-4 w-4 animate-spin text-estate-gold" />
              <span className="text-sm text-gray-400">{ar ? 'بحلّل الداتا بتاعتك…' : 'Analyzing your data...'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-3 border-t border-border dark:border-[#262626] pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ar ? 'اسأل عن مؤشرات البيزنس بتاعتك…' : 'Ask about your business metrics...'}
          disabled={loading}
          className="flex-1 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C] shadow-lg shadow-estate-gold/20 hover:shadow-estate-gold/30"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
