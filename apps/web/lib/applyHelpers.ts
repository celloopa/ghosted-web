// Pure helpers used by apps/web/app/apply/page.tsx and its tests.
// Kept in lib/ so the page can remain a Next.js page (no unexpected named exports).

import type { Application, DocStyle, ResumePlan } from '@ghosted/core'

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

/** Shape of the /api/export request body. */
export interface ExportPayload {
  appId: string
  cvJson: string
  summary?: string
  coverLetter: string
  bulletOrder: { name: string; order: number[] }[]
  skillsOrder: string[]
  matchedKeywords: string[]
  style?: DocStyle
}

/**
 * Build the /api/export payload from app + baseline + resume plan + optional style.
 * Pure function — no I/O, fully testable.
 */
export function buildExportPayload(
  app: Application,
  cvJson: string,
  plan: ResumePlan,
  style?: DocStyle,
): ExportPayload {
  const posting = app.posting!
  const materials = app.materials

  const bulletOrder = plan.roles.map((role) => ({
    name: role.name,
    order: role.order.map((b) => b.originalIndex),
  }))

  return {
    appId: app.id,
    cvJson,
    summary: materials?.summary,
    coverLetter: materials?.cover_letter ?? '',
    bulletOrder,
    skillsOrder: plan.skills_order,
    matchedKeywords: posting.matched,
    ...(style ? { style } : {}),
  }
}

/**
 * Whether the cover letter changed after the last export.
 * Returns true when the letter has been revised (exported_at < latest generated_at).
 */
export function isStaleExport(
  exportedAt: string | undefined,
  generatedAt: string | undefined,
): boolean {
  if (!exportedAt) return false
  if (!generatedAt) return false
  return generatedAt > exportedAt
}

/**
 * Whether the materials content is newer than the last PDF export.
 * Used on the detail page to show a staleness warning.
 *
 * Returns true when:
 *  - materials.generated_at is set AND
 *  - either exported_at is absent (never exported), OR generated_at > exported_at
 *
 * Returns false when:
 *  - materials is undefined/null
 *  - generated_at is absent (nothing generated yet, nothing to be stale)
 *  - exported_at >= generated_at (export is current)
 */
export function isContentNewerThanExport(materials: import('@ghosted/core').Materials | undefined | null): boolean {
  if (!materials) return false
  const { generated_at, exported_at } = materials
  if (!generated_at) return false
  if (!exported_at) return false
  return generated_at > exported_at
}

/**
 * Derive which finale actions to show based on app.status.
 * Returns a plain object so it can be tested without DOM.
 */
export function finaleActions(status: Application['status']): {
  showMarkApplied: boolean
  showBackToDetails: boolean
} {
  return {
    showMarkApplied: status === 'saved',
    showBackToDetails: status !== 'saved',
  }
}
