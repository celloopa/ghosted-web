import type { Materials } from '@ghosted/core'

export function StandoutsPanel({
  standouts,
  spammyIndexes,
}: {
  standouts: Materials['standout_suggestions']
  spammyIndexes: number[]
}) {
  if (!standouts?.length) {
    return <p className="dim small">Generate to get practical follow-through ideas that are not just another cover letter paragraph.</p>
  }

  const spammySet = new Set(spammyIndexes)
  const filtered = standouts.filter((_, i) => !spammySet.has(i))
  const filteredCount = standouts.length - filtered.length

  return (
    <>
      {filtered.map((s, i) => (
        <div className="suggestion-card" key={`${s.title}-${i}`}>
          <div className="row spread gap">
            <h3>{s.title}</h3>
            <span className="badge kw-matched">{s.effort}</span>
          </div>
          <p>{s.action}</p>
        </div>
      ))}
      {filteredCount > 0 && (
        <p className="dim small" data-testid="standouts-filtered-line">
          {filteredCount} {filteredCount === 1 ? 'suggestion' : 'suggestions'} filtered (looked like spam)
        </p>
      )}
    </>
  )
}
