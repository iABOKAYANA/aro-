/** @type {import('next').NextConfig} */

// Content-Security-Policy ENFORCED: violations are blocked + collected via
// `report-uri` (/api/csp-report). Directives unchanged from the report-only
// phase (Next.js inline scripts/styles via 'unsafe-inline'/'unsafe-eval',
// Tailwind inline styles, YouTube-nocookie embeds). Report file showed zero
// self-inflicted violations, so enforcement is safe; revert the header key
// below to `Content-Security-Policy-Report-Only` to roll back.
// Violations are POSTed to
// `/api/csp-report` (`report-uri`; no `report-to` group — Report-To
// endpoints must be absolute URLs, so a relative collector can't use it).
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' + 'unsafe-eval': required by Next.js runtime inline
  // scripts; YouTube hosts cover the promo-video embeds.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://www.youtube-nocookie.com https://www.googletagmanager.com https://unpkg.com",
  // 'unsafe-inline': Tailwind + Next.js inline styles; googleapis kept for
  // any hosted-font stylesheet (fonts themselves are self-hosted).
  // unpkg.com: Leaflet 1.9.4 JS+CSS for /projects map (projects-map.tsx,
  // projects-listing-map.tsx load via runtime <script>/<link> injection).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  // `https:` covers next/image remotePatterns (`https://**`), map tiles,
  // Wikimedia landmark photos and Blob-hosted uploads.
  "img-src 'self' data: blob: https: https://www.google-analytics.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' https: https://*.google-analytics.com https://*.googletagmanager.com",
  // Voice-note audio (Blob/local) + promo video files.
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join('; ')

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: CSP,
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    instrumentationHook: true,
  },
}

module.exports = nextConfig