import type { Href } from 'expo-router';

/**
 * Turns a *website* URL into an app route.
 *
 * Notifications, push payloads and AI replies all carry `link` values written
 * in the website's URL space (`/dashboard/leads`, `/projects/slug`,
 * `/ceo/inquiries`) because the server that mints them has no idea which
 * client will read them. Mapping lives here — one place — so every entry point
 * agrees on where a link lands.
 *
 * Anything with no app equivalent returns `null` and the caller stays where it
 * is, rather than pushing a route that resolves to the 404 screen.
 */
export function resolveLink(link?: string | null): Href | null {
  if (!link) return null;

  const project = /^\/projects\/([^/?#]+)/.exec(link);
  if (project) {
    // The rate-your-visit nudge links `/projects/<slug>?review=<viewingId>`
    // (see `src/lib/viewing-completed.ts`). The query must survive the hop:
    // `/project/[slug]` reads `review` as its pre-selected viewing and opens
    // the rating form. Without this the tap lands on the project but the
    // form stays shut — a dead-feeling link.
    const review = /[?&]review=([^&#]+)/.exec(link)?.[1];
    if (review) return { pathname: '/project/[slug]', params: { slug: project[1], review } };
    return `/project/${project[1]}`;
  }
  // Bare listing (sometimes with a query string) — the app's explore screen.
  if (link === '/projects' || link === '/projects/' || link.startsWith('/projects?')) {
    return '/(tabs)/explore';
  }

  const unit = /^\/units\/([^/?#]+)/.exec(link);
  if (unit) return `/unit/${unit[1]}`;
  if (link === '/units' || link === '/units/' || link.startsWith('/units?')) {
    return '/(tabs)/explore';
  }

  const lead = /^\/(?:dashboard|ceo)\/leads\/([^/?#]+)/.exec(link);
  if (lead) return `/lead/${lead[1]}`;

  if (link.startsWith('/dashboard/leads') || link.startsWith('/ceo/leads')) return '/(tabs)/leads';
  if (link.startsWith('/dashboard/deals') || link.startsWith('/ceo/deals')) return '/(tabs)/deals';
  if (link.startsWith('/dashboard/viewings') || link.startsWith('/ceo/viewings')) return '/viewings';
  if (link.startsWith('/dashboard/favorites') || link.startsWith('/dashboard/saved')) return '/(tabs)/saved';
  if (link.startsWith('/dashboard/inquiries')) return '/inquiries';
  if (link.startsWith('/dashboard/projects')) return '/dashboard/projects';
  if (link.startsWith('/dashboard/units')) return '/dashboard/units';
  if (link.startsWith('/dashboard/analytics')) return '/dashboard/analytics';
  if (link.startsWith('/dashboard/settings')) return '/settings';

  // Broker portal — the website's `/broker` room renders natively in the app.
  if (link === '/broker' || link.startsWith('/broker/')) return '/broker';

  // Staff consoles that exist only in the app — the website reaches the same
  // data through its own pages, so the same server link resolves both ways.
  if (/^\/ceo\/inquiries/.test(link)) return '/ceo/inquiries';
  if (/^\/ceo\/approvals/.test(link)) return '/ceo/approvals';
  if (/^\/ceo\/pricing/.test(link)) return '/ceo/pricing';
  if (/^\/ceo\/content/.test(link)) return '/ceo/content';
  if (/^\/ceo\/jobs/.test(link)) return '/ceo/jobs';
  if (/^\/ceo\/analytics/.test(link)) return '/ceo/analytics';
  if (/^\/ceo\/(overview|stats)/.test(link)) return '/ceo/overview';
  if (/^\/ceo\/blog/.test(link)) return '/ceo/blog';
  if (/^\/ceo\/press/.test(link)) return '/ceo/press';
  if (/^\/ceo\/contacts/.test(link)) return '/ceo/contacts';
  // Detail before the list prefix: `/ceo/projects/<id>` has its own screen.
  const ceoProject = /^\/ceo\/projects\/([^/?#]+)/.exec(link);
  if (ceoProject) return `/ceo/projects/${ceoProject[1]}`;
  if (link.startsWith('/ceo/projects')) return '/ceo/projects';
  if (link.startsWith('/ceo/all-projects')) return '/ceo/all-projects';
  if (link.startsWith('/ceo/units')) return '/ceo/units';
  if (link.startsWith('/ceo/payment-plans')) return '/ceo/payment-plans';
  if (link.startsWith('/ceo/new-launches')) return '/ceo/new-launches';
  if (link.startsWith('/ceo/import/nawy')) return '/ceo/import/nawy';
  if (link.startsWith('/ceo/create-user')) return '/ceo/create-user';
  if (link.startsWith('/ceo/access-requests')) return '/ceo/access-requests';
  if (link.startsWith('/ceo/invitations')) return '/ceo/invitations';
  if (link.startsWith('/ceo/settings')) return '/ceo/settings';
  if (link.startsWith('/ceo/ai')) return '/ceo/ai';
  if (/^\/developer/.test(link)) return '/developer';
  if (/^\/ceo\/brokers/.test(link)) return '/ceo/brokers';
  if (/^\/ceo\/developers/.test(link)) return '/ceo/developers';
  if (/^\/ceo\/users/.test(link)) return '/ceo/users';
  if (link === '/ceo' || link === '/ceo/') return '/ceo/overview';

  if (link.startsWith('/notifications')) return '/notifications';

  // Personal lists — the website's `/saved` room and `/saved-searches` page
  // both land on the app's saved tab; `/compare` has a same-name screen.
  if (link.startsWith('/saved-searches')) return '/(tabs)/saved';
  if (link === '/saved' || link === '/saved/' || link.startsWith('/saved?')) return '/(tabs)/saved';
  if (link === '/compare' || link === '/compare/' || link.startsWith('/compare?')) return '/compare';

  // Content pages — same path on both clients (detail slugs included).
  if (link === '/about' || link.startsWith('/about/')) return '/about';
  if (link === '/contact' || link.startsWith('/contact/')) return '/contact';
  const careerPost = /^\/careers\/([^/?#]+)/.exec(link);
  if (careerPost) return `/careers/${careerPost[1]}`;
  if (link === '/careers' || link === '/careers/' || link.startsWith('/careers?')) return '/careers';
  const blogPost = /^\/blog\/([^/?#]+)/.exec(link);
  if (blogPost) return `/blog/${blogPost[1]}`;
  if (link === '/blog' || link === '/blog/' || link.startsWith('/blog?')) return '/blog';
  const pressPost = /^\/press\/([^/?#]+)/.exec(link);
  if (pressPost) return `/press/${pressPost[1]}`;
  if (link === '/press' || link === '/press/' || link.startsWith('/press?')) return '/press';
  if (link === '/privacy' || link.startsWith('/privacy/')) return '/privacy';
  if (link === '/terms' || link.startsWith('/terms/')) return '/terms';
  if (link === '/cookies' || link.startsWith('/cookies/')) return '/cookies';

  // AI tools — the website's `/ai-tools` room fans out to the app's
  // same-name tool screens; the room itself lands on the tools tab.
  if (link === '/ai-tools/chat' || link.startsWith('/ai-tools/chat/')) return '/assistant';
  if (link === '/ai-tools/search' || link.startsWith('/ai-tools/search/')) return '/ai-search';
  if (link === '/ai-tools/mortgage' || link.startsWith('/ai-tools/mortgage/')) return '/mortgage';
  if (link === '/ai-tools/price-estimator' || link.startsWith('/ai-tools/price-estimator/'))
    return '/price-estimator';
  if (link === '/ai-tools/investment' || link.startsWith('/ai-tools/investment/')) return '/investment';
  if (link === '/ai-tools' || link.startsWith('/ai-tools/') || link.startsWith('/ai-tools?'))
    return '/(tabs)/tools';

  // Bare `/dashboard` — there is no dashboard landing screen on mobile by
  // design, so it lands on the role-aware home tab.
  if (link === '/dashboard' || link === '/dashboard/' || link.startsWith('/dashboard?')) return '/';

  // Deliberately unmapped: `/ceo/auto-match` (no app screen), `/auth/*`
  // (signed-out-flow screens reached natively, never via a link), and unknown
  // `/dashboard/*` suffixes. Callers stay put.
  return null;
}
