import type { BaselineConstraints } from './baseline'
import type { RoleType, KnownRoleType } from './types'
import { KNOWN_ROLE_TYPES } from './types'
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
  // ── cross-functional / general-professional ───────────────────────────────
  { term: 'Communication', aliases: ['communication skills', 'written communication', 'verbal communication'] },
  { term: 'Customer Service', aliases: ['customer service', 'customer support', 'client support'] },
  { term: 'Customer Support', aliases: ['technical support', 'help desk', 'support tickets'] },
  { term: 'Project Management', aliases: ['project management', 'project manager'] },
  { term: 'Program Management', aliases: ['program management', 'program manager'] },
  { term: 'Leadership', aliases: ['leadership', 'team leadership', 'people management'] },
  { term: 'Team Management', aliases: ['team management', 'managing a team', 'direct reports'] },
  { term: 'Scheduling', aliases: ['scheduling', 'calendar management', 'appointment setting'] },
  { term: 'Microsoft Office', aliases: ['microsoft office', 'office 365', 'microsoft 365'] },
  { term: 'Excel', aliases: ['microsoft excel', 'excel spreadsheet', 'spreadsheets'] },
  { term: 'Word', aliases: ['microsoft word'] },
  { term: 'PowerPoint', aliases: ['powerpoint', 'microsoft powerpoint'] },
  { term: 'Outlook', aliases: ['microsoft outlook'] },
  { term: 'Google Workspace', aliases: ['google workspace', 'google docs', 'google sheets', 'google slides', 'gsuite', 'g suite'] },
  { term: 'CRM', aliases: ['crm', 'customer relationship management'] },
  { term: 'Salesforce', aliases: ['salesforce'] },
  { term: 'HubSpot', aliases: ['hubspot'] },
  { term: 'Data Entry', aliases: ['data entry', 'data input'] },
  { term: 'Bookkeeping', aliases: ['bookkeeping', 'accounts payable', 'accounts receivable'] },
  { term: 'Accounting', aliases: ['accounting', 'general ledger', 'financial reporting'] },
  { term: 'QuickBooks', aliases: ['quickbooks'] },
  { term: 'Inventory Management', aliases: ['inventory management', 'stock management', 'inventory control'] },
  { term: 'Sales', aliases: ['sales experience', 'inside sales', 'outside sales', 'quota'] },
  { term: 'Account Management', aliases: ['account management', 'account manager', 'client relationship'] },
  { term: 'Social Media', aliases: ['social media', 'instagram', 'linkedin', 'twitter', 'facebook', 'tiktok'] },
  { term: 'Email Marketing', aliases: ['email marketing', 'email campaigns', 'newsletter'] },
  { term: 'Content Writing', aliases: ['content writing', 'content creation', 'blog writing'] },
  { term: 'Copywriting', aliases: ['copywriting', 'copy writing'] },
  { term: 'Editing', aliases: ['editing', 'proofreading', 'copy editing'] },
  { term: 'Patient Care', aliases: ['patient care', 'patient management', 'bedside manner'] },
  { term: 'Medical Records', aliases: ['medical records', 'ehr', 'emr', 'electronic health records'] },
  { term: 'Bilingual', aliases: ['bilingual', 'fluent in spanish', 'spanish speaker', 'bilingual spanish'] },
  { term: 'Time Management', aliases: ['time management', 'prioritization', 'multi-tasking', 'multitasking'] },
  { term: 'Problem Solving', aliases: ['problem solving', 'problem-solving', 'critical thinking', 'analytical skills'] },
  { term: 'Conflict Resolution', aliases: ['conflict resolution', 'de-escalation', 'dispute resolution'] },
  { term: 'Onboarding', aliases: ['onboarding', 'new hire training', 'employee training'] },
  { term: 'Public Speaking', aliases: ['public speaking', 'presentations', 'facilitation'] },
  { term: 'Event Planning', aliases: ['event planning', 'event management', 'event coordination'] },
  { term: 'Budgeting', aliases: ['budgeting', 'budget management', 'cost control', 'financial planning'] },
  { term: 'Vendor Management', aliases: ['vendor management', 'supplier management', 'procurement'] },
]

/**
 * Given a canonical term from the LEXICON, return the first alias (in the
 * entry's alias order) that appears in `text` using the same word-boundary
 * matching as countMatches. Returns null when the term is not in the lexicon
 * or no alias matches.
 *
 * The LEXICON itself remains private; this is the only intended escape hatch
 * for callers that need to resolve the surface form actually present in a
 * document rather than the canonical display label.
 */
export function keywordVariantIn(text: string, term: string): string | null {
  const entry = LEXICON.find((e) => e.term === term)
  if (!entry) return null
  const lower = text.toLowerCase()
  for (const alias of entry.aliases) {
    if (countMatches(lower, alias) > 0) return alias
  }
  return null
}

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
  role_type_guess: KnownRoleType
  matched: string[]
  missing: string[]
  notes: string[]
}

const ROLE_PATTERNS: { role: KnownRoleType; re: RegExp }[] = [
  // Design sub-roles (checked before the broad 'design' bucket)
  { role: 'design', re: /design (engineer|technolog)|ux engineer|ui engineer|creative technolog|design systems? engineer/i },
  { role: 'design', re: /product design|ux design|interaction design|experience design|ui\/ux|ux\/ui|staff designer|senior designer/i },
  { role: 'design', re: /brand|motion design|graphic design|visual design|art director|motion graphic/i },
  // Software engineering
  { role: 'software_engineering', re: /software engineer|software developer|frontend engineer|backend engineer|full.?stack engineer|full.?stack developer|fullstack|web developer|ios developer|android developer|mobile developer|devops|site reliability|sre|platform engineer|infrastructure engineer/i },
  // Product management
  { role: 'product', re: /product manager|program manager|product owner|head of product|vp of product|growth product/i },
  // Data
  { role: 'data', re: /data (scientist|analyst|engineer|architect)|machine learning|ml engineer|bi analyst|business intelligence|analytics engineer/i },
  // Marketing
  { role: 'marketing', re: /marketing manager|marketing coordinator|growth manager|seo manager|content marketing|demand generation|brand manager|social media manager|digital marketing|email marketing manager/i },
  // Sales
  { role: 'sales', re: /account executive|sales (representative|rep|manager|director|associate)|business development|bdr|sdr|solutions engineer|sales engineer|inside sales|outside sales/i },
  // Customer service
  { role: 'customer_service', re: /customer (service|support|success|care)|client success|support specialist|support agent|call center|help desk|service desk/i },
  // Project management
  { role: 'project_management', re: /project manager|project coordinator|scrum master|agile coach|pmo|delivery manager/i },
  // Finance & accounting
  { role: 'finance', re: /accountant|financial analyst|controller|bookkeeper|finance manager|cfo|treasurer|payroll|accounts payable|accounts receivable/i },
  // Healthcare
  { role: 'healthcare', re: /nurse|nursing|medical assistant|patient (coordinator|care|advocate)|clinical|phlebotomist|pharmacy|health (coach|educator)|care manager|caregiver/i },
  // Education
  { role: 'education', re: /teacher|instructor|educator|tutor|professor|curriculum|instructional designer|learning (designer|developer)/i },
  // Writing / content
  { role: 'writing', re: /copywriter|content writer|technical writer|editor|journalist|communications (manager|specialist)|copy editor/i },
  // Administrative
  { role: 'admin', re: /executive assistant|administrative assistant|office manager|admin coordinator|receptionist|office coordinator/i },
  // Operations
  { role: 'operations', re: /operations manager|ops manager|business operations|revenue operations|logistics (manager|coordinator)|supply chain|operations coordinator/i },
]

// The set of KnownRoleType values we CAN classify (everything except 'other').
const CLASSIFIABLE_ROLES = new Set<string>(
  KNOWN_ROLE_TYPES.map((e) => e.value).filter((v) => v !== 'other'),
)

export function guessRoleType(position: string): KnownRoleType {
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
      // Apply penalty only when:
      //   (a) the guess is a CONFIDENT known category (not 'other'), AND
      //   (b) none of the user's targeting values is an unclassifiable custom string
      //       (if a user targets e.g. 'nursing' we can't compare, so stay neutral).
      const guessIsClassifiable = role_type_guess !== 'other' && CLASSIFIABLE_ROLES.has(role_type_guess)
      const targetingIsComparable = constraints.role_types_in.every((r) => CLASSIFIABLE_ROLES.has(r))
      if (guessIsClassifiable && targetingIsComparable) {
        roleScore = 0.25
        notes.push(`Looks like a ${role_type_guess.replace(/_/g, ' ')} role — outside your targeting.`)
      }
      // otherwise: guess is 'other' or targeting contains unknown custom roles → neutral (0.7)
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
