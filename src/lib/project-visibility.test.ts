import { describe, expect, it } from 'vitest'
import { isPublicProject, PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

describe('project parent/child visibility', () => {
  it('keeps a published root project public when it has its own price', () => {
    expect(isPublicProject({ isActive: true, approvalStatus: 'PUBLISHED', parentProjectId: null, startPrice: 100 })).toBe(true)
  })

  it('never exposes a child project as a standalone project page', () => {
    expect(isPublicProject({ isActive: true, approvalStatus: 'PUBLISHED', parentProjectId: 'parent-1', startPrice: 100 })).toBe(false)
  })

  it('allows a public parent to be visible using a priced, approved child', () => {
    expect(isPublicProject({
      isActive: true,
      approvalStatus: 'PUBLISHED',
      parentProjectId: null,
      startPrice: null,
      childProjects: [{ isActive: true, approvalStatus: 'APPROVED', startPrice: 250 }],
    })).toBe(true)
  })

  it('does not make a parent public from an archived or unpriced child', () => {
    expect(isPublicProject({
      isActive: true,
      approvalStatus: 'PUBLISHED',
      parentProjectId: null,
      startPrice: null,
      childProjects: [{ isActive: false, approvalStatus: 'PUBLISHED', startPrice: 250 }],
    })).toBe(false)
    expect(isPublicProject({
      isActive: true,
      approvalStatus: 'PUBLISHED',
      parentProjectId: null,
      startPrice: null,
      childProjects: [{ isActive: true, approvalStatus: 'PUBLISHED', startPrice: null }],
    })).toBe(false)
  })

  it('public root and unit queries exclude nested child projects', () => {
    expect(PUBLIC_PROJECT_WHERE.parentProjectId).toBeNull()
    expect(PUBLIC_UNIT_PROJECT_WHERE.parentProjectId).toBeNull()
  })
})
