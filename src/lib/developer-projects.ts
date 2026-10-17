import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor, type ActorContext } from '@/lib/lead-access'

/**
 * Developer-scoped write guard for `/api/developer/projects/*`.
 *
 * Resolves the caller's own DeveloperProfile (never trusts a client-sent
 * `developerId`) and loads the project from the path id. Returns the actor
 * context + profile id on success, or an error response:
 *  - 401/403 from the role gate,
 *  - 403 when the account has no developer profile linked,
 *  - 404 when the project does not exist,
 *  - 403 when the project belongs to another developer.
 */
export async function requireOwnProject(projectId: string): Promise<
  | { ok: true; ctx: ActorContext; developerId: string; project: { id: string; developerId: string } }
  | { ok: false; response: NextResponse }
> {
  const gate = await requireActor(['DEVELOPER'])
  if (!gate.ok) return gate
  const { ctx } = gate

  if (!ctx.developerId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No developer profile linked to this account' },
        { status: 403 }
      ),
    }
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, developerId: true },
  })
  if (!project) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
    }
  }
  if (project.developerId !== ctx.developerId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: this project belongs to another developer' },
        { status: 403 }
      ),
    }
  }

  return { ok: true, ctx, developerId: ctx.developerId, project }
}
