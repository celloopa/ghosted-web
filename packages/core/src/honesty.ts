// Deterministic honesty validation of model output.
//
// "Minimum viable intelligence": the model writes prose, but CODE validates the
// model. The generator returns resume_rewrites / opportunity_angles /
// standout_suggestions; these pure functions catch fabrication deterministically.
//
// The CV is treated as a plain-text haystack — we never JSON.parse it, so garbage
// input can never throw. Matching is conservative on purpose: a false positive
// (wrongly flagging honest prose) is worse than a false negative here, because the
// flags surface to the candidate as "the model may have made this up."

/** Lowercase, collapse whitespace runs, strip smart quotes and markdown emphasis. */
function normalize(s: string): string {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip a trailing ellipsis ("…" or "...") and surrounding space. */
function stripTrailingEllipsis(s: string): string {
  return s.replace(/\s*(?:…|\.\.\.)\s*$/, '').trimEnd()
}

export interface RewriteCheck {
  sourceFound: boolean // the `source` text actually exists in the CV
  inventedNumbers: string[] // numeric/percent tokens in `rewrite` absent from BOTH cv and source
  inventedTerms: string[] // capitalized tech-ish tokens in `rewrite` absent from BOTH cv and source
  ok: boolean // sourceFound && no inventions
}

function sourceFoundIn(source: string, cvNorm: string): boolean {
  const cleaned = stripTrailingEllipsis(source)
  const norm = normalize(cleaned)
  if (norm === '') return false
  if (cvNorm.includes(norm)) return true
  // Models sometimes truncate a long bullet; accept a match on the first 80
  // normalized chars when the source was long to begin with.
  if (cleaned.length > 120) {
    const head = norm.slice(0, 80)
    if (head.length > 0 && cvNorm.includes(head)) return true
  }
  return false
}

// A number-ish token: a digit run (with grouping commas / decimals) optionally
// suffixed with %, or a "10k" / "3x" style magnitude. The trailing \b keeps "k/x"
// from swallowing the start of an ordinary word.
const NUMBER_TOKEN = /\d[\d,.]*%?|\d+[kKxX×]\b/g

/** Compare numbers by their digit sequence (commas stripped) so 12,000 ≡ 12000. */
function digitKey(token: string): string {
  return token.replace(/,/g, '')
}

function findInventedNumbers(rewrite: string, haystacks: string[]): string[] {
  const keys = haystacks.map(digitKey)
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of rewrite.matchAll(NUMBER_TOKEN)) {
    const token = m[0]
    const key = digitKey(token)
    if (seen.has(key)) continue
    seen.add(key)
    if (!keys.some((h) => h.includes(key))) out.push(token)
  }
  return out
}

// Capitalized tech-ish token: starts uppercase, then 2+ chars from a tech-name
// charset (covers C++, CI/CD, Node.js, .NET-style suffixes once the lead char is
// stripped). Anchored so it must match the whole stripped token.
const TERM_TOKEN = /^[A-Z][A-Za-z0-9.+#/-]{2,}$/

// Ordinary English words that legitimately start résumé sentences. Lowercased for
// comparison. Extended a little beyond the brief's list with obvious neighbours.
const TERM_STOPLIST = new Set(
  [
    'The', 'This', 'That', 'These', 'Those',
    'Built', 'Led', 'Designed', 'Developed', 'Created', 'Improved', 'Implemented',
    'Managed', 'Increased', 'Reduced', 'Shipped', 'Delivered', 'Launched', 'Drove',
    'Owned', 'Maintained', 'Architected', 'Established', 'Spearheaded', 'Coordinated',
    'And', 'With', 'For', 'But', 'Our', 'Their', 'When', 'While', 'Using', 'Through',
  ].map((w) => w.toLowerCase()),
)

/** Strip leading/trailing punctuation that isn't part of a tech name. */
function trimTermPunct(raw: string): string {
  return raw.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9+#/.]+$/, '')
}

function findInventedTerms(rewrite: string, haystackNorm: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // Split into sentences; the first word of each is exempt (sentence-initial caps).
  const sentences = rewrite.split(/[.!?]+/)
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter((w) => w.length > 0)
    for (let i = 0; i < words.length; i++) {
      const isFirstWord = i === 0
      const token = trimTermPunct(words[i] as string)
      if (token === '') continue
      if (!TERM_TOKEN.test(token)) continue
      const lower = token.toLowerCase()
      if (isFirstWord) continue // sentence-start capital, not a claimed term
      if (TERM_STOPLIST.has(lower)) continue
      if (seen.has(lower)) continue
      // Present anywhere in CV or source (normalized) → not invented.
      if (haystackNorm.some((h) => h.includes(lower))) continue
      seen.add(lower)
      out.push(token)
    }
  }
  return out
}

export function checkRewrite(rewrite: { source: string; rewrite: string }, cvJson: string): RewriteCheck {
  const cvNorm = normalize(cvJson)
  const sourceNorm = normalize(rewrite.source)

  const sourceFound = sourceFoundIn(rewrite.source, cvNorm)
  const inventedNumbers = findInventedNumbers(rewrite.rewrite, [cvJson, rewrite.source])
  const inventedTerms = findInventedTerms(rewrite.rewrite, [cvNorm, sourceNorm])
  const ok = sourceFound && inventedNumbers.length === 0 && inventedTerms.length === 0
  return { sourceFound, inventedNumbers, inventedTerms, ok }
}

export interface AngleCheck {
  evidenceFound: boolean
}

const WORD_OVERLAP_THRESHOLD = 0.7
const DISTINCTIVE_MIN_LEN = 5

/** Deduplicated distinctive words (length ≥5) from normalized text. */
function distinctiveWords(norm: string): string[] {
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length >= DISTINCTIVE_MIN_LEN)
  return [...new Set(words)]
}

export function checkAngle(angle: { evidence: string }, cvJson: string): AngleCheck {
  const cvNorm = normalize(cvJson)
  const evidenceNorm = normalize(angle.evidence)
  if (evidenceNorm === '') return { evidenceFound: false }

  // Direct containment passes immediately.
  if (cvNorm.includes(evidenceNorm)) return { evidenceFound: true }

  // Otherwise accept a paraphrase: ≥70% of the evidence's distinctive words appear
  // somewhere in the CV text.
  const words = distinctiveWords(evidenceNorm)
  if (words.length === 0) return { evidenceFound: false }
  const hits = words.filter((w) => cvNorm.includes(w)).length
  return { evidenceFound: hits / words.length >= WORD_OVERLAP_THRESHOLD }
}

// Mass / spam outreach patterns. Case-insensitive. The intent is to catch
// "contact a crowd" advice while leaving genuine, targeted suggestions alone.
const SPAM_PATTERNS: RegExp[] = [
  /\bmass\b/,
  /\bspam\b/,
  /\bblast\b/,
  /automat(?:e|ed|ion)\s+(?:outreach|dm|email|message)/,
  /cold\s+(?:dm|call|email)s?\s+\d{2,}/,
  /connect with \d{2,}/,
  /\b\d{2,}\s+(?:recruiters|employees|people)\b/,
  /follow.{0,12}(?:everyone|all employees)/,
]

export function isSpammyStandout(s: { title: string; action: string }): boolean {
  const hay = normalize(`${s.title} ${s.action}`)
  return SPAM_PATTERNS.some((re) => re.test(hay))
}

export interface HonestyReport {
  rewrites: RewriteCheck[]
  angles: AngleCheck[]
  spammyStandouts: number[] // indexes of standout_suggestions that fail the spam filter
  flagged: number // total count of problems across everything
}

export function checkDraftHonesty(
  draft: {
    resume_rewrites: { source: string; rewrite: string; why: string }[]
    opportunity_angles: { title: string; evidence: string; use: string }[]
    standout_suggestions: { title: string; action: string; effort: string }[]
  },
  cvJson: string,
): HonestyReport {
  const rewrites = draft.resume_rewrites.map((r) => checkRewrite(r, cvJson))
  const angles = draft.opportunity_angles.map((a) => checkAngle(a, cvJson))
  const spammyStandouts: number[] = []
  draft.standout_suggestions.forEach((s, i) => {
    if (isSpammyStandout(s)) spammyStandouts.push(i)
  })

  const flagged =
    rewrites.filter((r) => !r.ok).length +
    angles.filter((a) => !a.evidenceFound).length +
    spammyStandouts.length

  return { rewrites, angles, spammyStandouts, flagged }
}
