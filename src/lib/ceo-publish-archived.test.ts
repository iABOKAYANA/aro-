import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: publishing an ARCHIVED project must actually go live.
// The owner hit the trap: the status transition wrote approvalStatus='PUBLISHED'
// while the row stayed isActive=false — invisible forever. These source-level
// checks pin the three parts of the fix:
//   1) ARCHIVED → PUBLISHED is an allowed transition,
//   2) the publish path reactivates (isActive: true),
//   3) the CEO surfaces offer the direct Publish action on archived projects.
const root = process.cwd()
const src = (p: string) => readFileSync(join(root, p), 'utf8')

describe('publish-archived-project flow', () => {
  it('status route allows ARCHIVED → PUBLISHED', () => {
    const route = src('src/app/api/ceo/projects/[id]/status/route.ts')
    expect(route).toMatch(/ARCHIVED:\s*\[\s*'DRAFT',\s*'PUBLISHED'\s*\]/)
  })

  it('publish reactivates an inactive project row (isActive: true)', () => {
    const route = src('src/app/api/ceo/projects/[id]/status/route.ts')
    expect(route).toMatch(/targetStatus === 'PUBLISHED' && !project\.isActive/)
    expect(route).toMatch(/updateData\.isActive = true/)
  })

  it('returns an honest publiclyVisible verdict derived from the price gate', () => {
    const route = src('src/app/api/ceo/projects/[id]/status/route.ts')
    expect(route).toContain('publiclyVisible')
    expect(route).toMatch(/\(pricedCheck\.startPrice \?\? 0\) > 0 \|\|\s*pricedCheck\.units\.length > 0/)
  })

  it('CEO surfaces show a direct Publish action for ARCHIVED projects', () => {
    const detail = src('src/app/ceo/projects/[id]/page.tsx')
    expect(detail).toMatch(/case 'ARCHIVED':[\s\S]*action: 'publish'/)
    const list = src('src/app/ceo/projects/page.tsx')
    expect(list).toMatch(/ARCHIVED: \['restore', 'publish'\]/)
  })

  it('UI warns when publishing without a verifiable price', () => {
    const detail = src('src/app/ceo/projects/[id]/page.tsx')
    expect(detail).toContain('publiclyVisible === false')
    expect(detail).toContain('سعر مسجل')
  })
})
