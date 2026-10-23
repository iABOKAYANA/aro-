import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('chat consultation-before-cards wiring', () => {
  it('loads the latest conversation turns so Ayn can remember answers and consent', () => {
    const route = source('src/app/api/ai/chat/route.ts')
    expect(route).toMatch(/const HISTORY_LIMIT = 12/)
    expect(route).toMatch(/orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}/)
    expect(route).toContain('const recentChronological = [...history].reverse()')
  })

  it('removes listing tools and disables forced search before shortlist consent', () => {
    const llm = source('src/lib/ai-llm.ts')
    expect(llm).toContain('toolsForTurn(ctx, shortlistAllowed)')
    expect(llm).toContain('PRE_SHORTLIST_BLOCKED_TOOLS.has(functionName)')
    expect(llm).toMatch(/listingTurn && shortlistAllowed/)
    expect(llm).toContain('shouldHoldShortlist(assistantTexts, currentMessage, directCatalogTask)')
  })
})
