// The voice. Decided in docs/DECISION_INTERVIEW.md §2-4:
// deadpan, candid, steady. Humor about the void, never the user.
// Banned from: stats numbers, rejection flows, errors, auth.

export const strings = {
  tagline: 'Silence, measured.',
  oneLiner: 'Ghosted turns the silence of your job search into data and next actions.',

  todayEmpty: 'Nothing needs you today. The follow-ups are sent, the ghosts are counted. Go be a person.',
  todayEmptyNoApps: 'Add your first application — we’ll take it from there.',

  ghostTooltip: 'No response in 14 days. Officially a ghost. It’s them, not you.',
  followUpNudge: 'Quiet for 7 days. One short nudge — the silence can’t get worse.',
  responseLogged: 'Contact. The void blinked.',

  lowData: 'Too few applications to read a trend yet. The chart fills itself — keep going.',
  addCta: 'Add application', // deliberately plain — capture is sacred
  closedConfirm: 'Closed. Logged and counted.',
  importSuccess: (n: number) => `${n} applications imported — ghosts and all.`,
} as const
