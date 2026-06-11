import type { BaselineConstraints } from './baseline'
import type { RoleType } from './types'
import type { PostingFacts } from './posting'

// Keyword extraction and fit scoring are pure code. The lexicon covers the
// design-engineering space this product targets; matching is word-bounded
// and case-insensitive; scoring is explainable arithmetic, not vibes.

interface LexiconEntry {
  term: string
  aliases: string[] // regex-safe, matched with word boundaries
}

const LEXICON: LexiconEntry[] = [
  // languages & runtimes
  { term: 'JavaScript', aliases: ['javascript', 'es6'] },
  { term: 'TypeScript', aliases: ['typescript'] },
  { term: 'Python', aliases: ['python'] },
  { term: 'Go', aliases: ['golang'] },
  { term: 'Swift', aliases: ['swift', 'swiftui'] },
  { term: 'Ruby', aliases: ['ruby', 'rails'] },
  { term: 'HTML', aliases: ['html', 'html5'] },
  { term: 'CSS', aliases: ['css', 'css3', 'scss', 'sass', 'less'] },
  // frameworks & libraries
  { term: 'React', aliases: ['react', 'react\\.js', 'reactjs'] },
  { term: 'Next.js', aliases: ['next\\.js', 'nextjs'] },
  { term: 'Vue', aliases: ['vue', 'vue\\.js', 'nuxt'] },
  { term: 'Svelte', aliases: ['svelte', 'sveltekit'] },
  { term: 'React Native', aliases: ['react native'] },
  { term: 'Node.js', aliases: ['node\\.js', 'nodejs'] },
  { term: 'Tailwind', aliases: ['tailwind', 'tailwindcss'] },
  { term: 'Styled Components', aliases: ['styled-components', 'styled components', 'css-in-js'] },
  { term: 'GraphQL', aliases: ['graphql'] },
  { term: 'REST APIs', aliases: ['rest api', 'rest apis', 'restful'] },
  { term: 'Three.js', aliases: ['three\\.js', 'threejs', 'webgl'] },
  { term: 'D3', aliases: ['d3\\.js', 'd3js'] },
  { term: 'Framer Motion', aliases: ['framer motion', 'framer'] },
  { term: 'GSAP', aliases: ['gsap'] },
  // infra & tooling
  { term: 'PostgreSQL', aliases: ['postgres', 'postgresql'] },
  { term: 'SQL', aliases: ['sql', 'mysql', 'sqlite'] },
  { term: 'AWS', aliases: ['aws', 'amazon web services'] },
  { term: 'GCP', aliases: ['gcp', 'google cloud'] },
  { term: 'Docker', aliases: ['docker', 'containers'] },
  { term: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { term: 'Git', aliases: ['git', 'github', 'gitlab'] },
  { term: 'CI/CD', aliases: ['ci/cd', 'continuous integration', 'continuous deployment'] },
  { term: 'Testing', aliases: ['unit test', 'unit testing', 'jest', 'vitest', 'playwright', 'cypress', 'test-driven', 'tdd'] },
  { term: 'Storybook', aliases: ['storybook'] },
  { term: 'Webpack', aliases: ['webpack', 'vite', 'esbuild'] },
  { term: 'Performance', aliases: ['web performance', 'core web vitals', 'lighthouse', 'performance optimization'] },
  // design tools
  { term: 'Figma', aliases: ['figma'] },
  { term: 'Sketch', aliases: ['sketch app'] },
  { term: 'Adobe Creative Suite', aliases: ['adobe', 'photoshop', 'illustrator', 'indesign', 'creative suite', 'creative cloud'] },
  { term: 'After Effects', aliases: ['after effects'] },
  { term: 'Blender', aliases: ['blender'] },
  { term: 'Cinema 4D', aliases: ['cinema 4d', 'c4d'] },
  // design practice
  { term: 'Design Systems', aliases: ['design system', 'design systems', 'component library', 'component libraries', 'design tokens'] },
  { term: 'Prototyping', aliases: ['prototype', 'prototyping', 'prototypes'] },
  { term: 'Wireframing', aliases: ['wireframe', 'wireframing', 'wireframes'] },
  { term: 'User Research', aliases: ['user research', 'user interviews', 'usability testing', 'usability studies'] },
  { term: 'Interaction Design', aliases: ['interaction design', 'ixd'] },
  { term: 'Visual Design', aliases: ['visual design'] },
  { term: 'Product Design', aliases: ['product design', 'product designer'] },
  { term: 'UX', aliases: ['ux', 'user experience'] },
  { term: 'UI', aliases: ['ui', 'user interface', 'user interfaces'] },
  { term: 'Motion Design', aliases: ['motion design', 'motion graphics', 'animation', 'animations', 'micro-interactions'] },
  { term: 'Branding', aliases: ['brand identity', 'branding', 'brand design'] },
  { term: 'Typography', aliases: ['typography', 'type design'] },
  { term: 'Illustration', aliases: ['illustration', 'illustrations'] },
  { term: 'Accessibility', aliases: ['accessibility', 'a11y', 'wcag', 'aria', 'screen reader', 'screen readers'] },
  { term: 'Responsive Design', aliases: ['responsive', 'mobile-first', 'mobile first'] },
  { term: 'Information Architecture', aliases: ['information architecture'] },
  { term: 'Design Engineering', aliases: ['design engineer', 'design engineering', 'creative technologist', 'ux engineer', 'ui engineer'] },
  // product & process
  { term: 'Agile', aliases: ['agile', 'scrum', 'kanban', 'sprints'] },
  { term: 'A/B Testing', aliases: ['a/b test', 'a/b testing', 'experimentation'] },
  { term: 'Analytics', aliases: ['analytics', 'amplitude', 'mixpanel', 'posthog'] },
  { term: 'SEO', aliases: ['seo', 'search engine optimization'] },
  { term: 'i18n', aliases: ['i18n', 'internationalization', 'localization'] },
  { term: 'Cross-functional Collaboration', aliases: ['cross-functional', 'cross functional'] },
  { term: 'Data Visualization', aliases: ['data visualization', 'data viz', 'dashboards'] },
  { term: 'AI/LLM', aliases: ['llm', 'llms', 'generative ai', 'machine learning', 'ai-powered', 'prompt engineering'] },
  { term: 'WordPress', aliases: ['wordpress'] },
  { term: 'Shopify', aliases: ['shopify'] },
  { term: 'CMS', aliases: ['cms', 'contentful', 'sanity', 'payload'] },
]

export interface Keyword {
  term: string
  count: number
  inCV: boolean
}

export interface KeywordAnalysis {
  keywords: Keyword[]
}

function countMatches(textLower: string, alias: string): number {
  const re = new RegExp(`(?<![\\w/])${alias}(?![\\w-])`, 'gi')
  return (textLower.match(re) ?? []).length
}

export function extractKeywords(text: string, cvJson?: string): KeywordAnalysis {
  if (!text.trim()) return { keywords: [] }
  const lower = text.toLowerCase()
  const cvLower = (cvJson ?? '').toLowerCase()

  const keywords: Keyword[] = []
  for (const entry of LEXICON) {
    // Only the curated aliases match — the canonical display name is NOT
    // auto-matched, so noisy words ("Go", "Sketch", "UI") stay opt-in.
    let count = 0
    let inCV = false
    for (const alias of entry.aliases) {
      count += countMatches(lower, alias)
      if (!inCV && cvLower && countMatches(cvLower, alias) > 0) inCV = true
    }
    if (count > 0) keywords.push({ term: entry.term, count, inCV })
  }
  keywords.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
  return { keywords }
}

// ---- fit ----

export interface FitReport {
  score: number // 0-100
  role_type_guess: RoleType
  matched: string[]
  missing: string[]
  notes: string[]
}

const ROLE_PATTERNS: { role: RoleType; re: RegExp }[] = [
  { role: 'design_engineer', re: /design (engineer|technolog)|ux engineer|ui engineer|creative technolog|design systems? engineer/i },
  { role: 'product_designer', re: /product design|ux design|interaction design|experience design|ui\/ux|ux\/ui|staff designer|senior designer/i },
  { role: 'brand_motion', re: /brand|motion|graphic design|visual design|art director/i },
]

export function guessRoleType(position: string): RoleType {
  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(position)) return role
  }
  return 'other'
}

export function analyzeFit(facts: PostingFacts, cvJson: string, constraints: BaselineConstraints): FitReport {
  const { keywords } = extractKeywords(facts.description, cvJson)
  const matched = keywords.filter((k) => k.inCV).map((k) => k.term)
  const missing = keywords.filter((k) => !k.inCV).map((k) => k.term)
  const notes: string[] = []

  // Coverage: blend of distinct terms covered and mention-weighted coverage.
  let coverage = 0.5 // neutral when the posting names no known skills
  if (keywords.length > 0) {
    const distinct = matched.length / keywords.length
    const totalCount = keywords.reduce((s, k) => s + k.count, 0)
    const matchedCount = keywords.filter((k) => k.inCV).reduce((s, k) => s + k.count, 0)
    coverage = 0.6 * distinct + 0.4 * (totalCount > 0 ? matchedCount / totalCount : 0)
    notes.push(`CV covers ${matched.length} of ${keywords.length} skills the posting names.`)
  } else {
    notes.push('Posting names no recognizable skills — fit is mostly a judgment call.')
  }

  // Role targeting.
  const role_type_guess = guessRoleType(facts.position ?? '')
  let roleScore = 0.7 // neutral when no targeting set
  if (constraints.role_types_in.length > 0) {
    if (constraints.role_types_in.includes(role_type_guess)) {
      roleScore = 1
    } else {
      roleScore = 0.25
      notes.push(`Looks like a ${role_type_guess.replace('_', ' ')} role — outside your targeting.`)
    }
  }

  // Logistics: salary floor + remote preference.
  let logistics = 1
  if (constraints.salary_floor && facts.salary_max && facts.salary_max < constraints.salary_floor) {
    logistics = Math.min(logistics, 0.3)
    notes.push(`Salary tops out at $${facts.salary_max.toLocaleString()} — below your $${constraints.salary_floor.toLocaleString()} floor.`)
  }
  if (constraints.remote === 'remote_only' && facts.remote === false) {
    logistics = Math.min(logistics, 0.4)
    notes.push(`Not remote (${facts.location ?? 'location unknown'}) — you set remote-only.`)
  }

  const score = Math.round(100 * (0.55 * coverage + 0.3 * roleScore + 0.15 * logistics))
  return { score, role_type_guess, matched, missing, notes }
}
