import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProjectBySlug } from '@/lib/search';
import { isPublicProject } from '@/lib/project-visibility';
import { languageAlternates } from '@/lib/site';
import { stripBrandSuffix } from '@/lib/seo';

import { TourViewer } from './tour-viewer';

export const dynamic = 'force-dynamic';

interface TourPageProps {
  params: { slug: string };
  searchParams?: { i?: string };
}

/** `panoramaImages` is a JSON array of 360° image URLs — anything else reads as empty. */
function parsePanoramas(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((url): url is string => typeof url === 'string' && url.length > 0);
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: TourPageProps): Promise<Metadata> {
  const project = await getProjectBySlug(params.slug);
  if (!project) return { title: 'Virtual Tour Not Found', robots: { index: false, follow: false } };
  // Viewer page: canonical to itself (query variants like ?i= collapse here),
  // no hreflang — it is a tool view, not a language destination.
  const canonical = languageAlternates(`/projects/${project.slug}/tour`).canonical;
  // Suffix once, exactly: metaTitle may or may not end with the brand, and the
  // root layout template would otherwise stack "| GHAYA REAL ESTATE" on top of
  // an already-suffixed string (the doubled title seen on /tour pages).
  // The Nawy mirror-brand suffix inherited from catalog imports is stripped —
  // ghayaestate.com SERPs never show a foreign brand.
  const cleaned = stripBrandSuffix(project.metaTitle || `360° Tour — ${project.name}`)
  const suffixed = cleaned.includes('| GHAYA REAL ESTATE') ? cleaned : `${cleaned} | GHAYA REAL ESTATE`
  return {
    title: { absolute: suffixed },
    description: project.metaDescription || `Take an interactive 360° virtual tour of ${project.name}.`,
    alternates: { canonical },
  };
}

/**
 * GET `/projects/[slug]/tour[?i=<index>]` — the interactive 360° viewer for
 * one project. Entry buttons (project detail, mobile project screen) get wired
 * by a follow-up agent; this page stands alone until then.
 */
export default async function ProjectTourPage({ params, searchParams }: TourPageProps) {
  const project = await getProjectBySlug(params.slug);
  // Non-approved projects are invisible to the public (same 404 as missing).
  if (!project || !isPublicProject(project)) notFound();

  const images = parsePanoramas(project.panoramaImages);
  const raw = searchParams?.i !== undefined ? Number.parseInt(searchParams.i, 10) : 0;
  const startIndex = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), Math.max(images.length - 1, 0)) : 0;
  const backHref = `/projects/${project.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {project.name} — 360° Tour
            </h1>
            {images.length > 1 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {images.length} scenes — pick one below the viewer
              </p>
            ) : null}
          </div>
          <Link
            href={backHref}
            className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          >
            <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> Back to project
          </Link>
        </div>

        <TourViewer images={images} startIndex={startIndex} backHref={backHref} backLabel="Back to project" />
      </div>
    </div>
  );
}
