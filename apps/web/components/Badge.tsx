import { strings } from '../lib/strings'

/** Manual statuses are quiet facts. */
export function StatusBadge({ status }: { status: string }) {
  return <span className="status-text">{status}</span>
}

/** Derived states are judgments the system computed — glyph + tint. */
export function GhostBadge() {
  return (
    <span className="badge badge-ghost" title={strings.ghostTooltip}>
      👻 ghosted
    </span>
  )
}

export function FollowUpBadge() {
  return (
    <span className="badge badge-followup" title={strings.followUpNudge}>
      ⏰ follow up
    </span>
  )
}
