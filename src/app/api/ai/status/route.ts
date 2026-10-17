import { NextResponse } from 'next/server'
import { AI_CONFIG } from '@/lib/ai/config'
import { checkOllamaStatus } from '@/lib/ai/ollama'
import { checkLlamacppStatus } from '@/lib/ai/llamacpp'
import { checkGeminiStatus } from '@/lib/ai/gemini'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = AI_CONFIG.provider === 'gemini'
      ? await checkGeminiStatus()
      : AI_CONFIG.provider === 'llamacpp'
        ? await checkLlamacppStatus()
        : await checkOllamaStatus()
    return NextResponse.json({ available: status.available })
  } catch {
    return NextResponse.json({ available: false })
  }
}
