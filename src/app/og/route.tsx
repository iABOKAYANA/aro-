import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'edge'

/** Open Graph card dimensions. */
const SIZE = { width: 1200, height: 630 } as const

/**
 * Dynamic Open Graph image.
 *
 * Rendered at request time so every project/blog post can ship its own card
 * without pre-generating assets — pass `?t=` (title) and `?s=` (subtitle).
 *
 *   /og?t=Palm%20Hills%20New%20Cairo&s=From%208.5M%20EGP
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const title = (searchParams.get('t') || `${SITE_NAME} — Find your next home in Egypt`).slice(0, 90)
  const subtitle = (searchParams.get('s') || 'AI-powered search across projects, compounds and units').slice(0, 120)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background:
            'radial-gradient(circle at 15% 20%, #1d3a73 0%, transparent 55%), radial-gradient(circle at 85% 90%, #0f766e 0%, transparent 50%), linear-gradient(160deg, #0b1020 0%, #111a35 100%)',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: 'linear-gradient(135deg,#38bdf8,#22c55e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 800,
              color: '#0b1020',
            }}
          >
            G
          </div>
          <div style={{ fontSize: 34, letterSpacing: 4, color: '#94a3b8' }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: title.length > 46 ? 66 : 82,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 36, color: '#7dd3fc', maxWidth: 1000 }}>{subtitle}</div>
        </div>

        <div style={{ display: 'flex', gap: 48, fontSize: 26, color: '#94a3b8' }}>
          <span>Projects</span>
          <span>Compounds</span>
          <span>Units</span>
          <span>AI Search</span>
        </div>
      </div>
    ),
    { ...SIZE }
  )
}
