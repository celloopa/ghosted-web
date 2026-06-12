// Pure helpers used by apps/web/app/apply/page.tsx and its tests.
// Kept in lib/ so the page can remain a Next.js page (no unexpected named exports).

import type { Application } from '@ghosted/core'

/** Slugify a company name for filenames: "Figma Corp" → "figma-cover-letter.md" */
export function buildDownloadName(
  company: string,
  kind: 'cover-letter' | 'resume-adjustments',
): string {
  const slug =
    company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'company'
  return `${slug}-${kind}.md`
}

/** Given an app, determine which view to show by default. */
export type WorkspaceView = 'finale' | 'workspace'

export function defaultView(app: Application): WorkspaceView {
  return app.materials?.cover_letter ? 'finale' : 'workspace'
}
