// The whole product model. Pure data — no I/O, no framework, no clock.

export type KnownRoleType =
  | 'software_engineering'
  | 'design'
  | 'product'
  | 'data'
  | 'marketing'
  | 'sales'
  | 'customer_service'
  | 'operations'
  | 'project_management'
  | 'finance'
  | 'healthcare'
  | 'education'
  | 'writing'
  | 'admin'
  | 'other'

// (string & {}) preserves known-value autocomplete hints while allowing any custom string.
export type RoleType = KnownRoleType | (string & {})

export interface KnownRoleTypeEntry {
  value: KnownRoleType
  label: string
  examples: string
}

export const KNOWN_ROLE_TYPES: KnownRoleTypeEntry[] = [
  { value: 'software_engineering', label: 'Software Engineering', examples: 'software engineer, backend, frontend, full-stack, SRE' },
  { value: 'design', label: 'Design', examples: 'product designer, UX, UI, brand, motion, graphic design' },
  { value: 'product', label: 'Product Management', examples: 'product manager, PM, APM, growth PM' },
  { value: 'data', label: 'Data & Analytics', examples: 'data analyst, data scientist, BI engineer, ML engineer' },
  { value: 'marketing', label: 'Marketing', examples: 'marketing manager, growth, content, SEO, demand gen' },
  { value: 'sales', label: 'Sales', examples: 'account executive, sales rep, BDR, SDR, solutions engineer' },
  { value: 'customer_service', label: 'Customer Service', examples: 'support, client coordinator, call center, success manager' },
  { value: 'operations', label: 'Operations', examples: 'ops manager, biz ops, revenue ops, logistics coordinator' },
  { value: 'project_management', label: 'Project Management', examples: 'project manager, program manager, PMO, scrum master' },
  { value: 'finance', label: 'Finance & Accounting', examples: 'accountant, financial analyst, controller, bookkeeper' },
  { value: 'healthcare', label: 'Healthcare', examples: 'nurse, medical assistant, patient coordinator, care manager' },
  { value: 'education', label: 'Education', examples: 'teacher, instructional designer, tutor, curriculum developer' },
  { value: 'writing', label: 'Writing & Content', examples: 'copywriter, content writer, editor, technical writer' },
  { value: 'admin', label: 'Administrative', examples: 'executive assistant, office manager, admin coordinator' },
  { value: 'other', label: 'Something else', examples: 'anything not listed — you can type your own' },
]

/** The 5 user-set statuses. ghosted / needs-follow-up are DERIVED, never stored. */
export type Status = 'saved' | 'applied' | 'interviewing' | 'offer' | 'closed'

export type ClosedReason = 'rejected' | 'withdrawn' | 'accepted'

export type EventType = 'applied' | 'response' | 'interview' | 'follow_up' | 'note'

export interface ApplicationEvent {
  type: EventType
  /** ISO 8601 date or datetime */
  date: string
  detail?: string
  /** Append-only log: events are never deleted, only marked logged-in-error. */
  corrected?: boolean
}

export interface Application {
  id: string
  company: string
  position: string
  role_type: RoleType
  status: Status
  closed_reason?: ClosedReason
  /** Derived from job_url host on capture, or set manually. */
  source?: string
  date_applied?: string
  salary_min?: number
  salary_max?: number
  location?: string
  remote?: boolean
  resume_version?: string
  job_url?: string
  notes?: string
  /** Saved-with-intent: cover letter / resume adjustments still to be made (apply-flow queue). */
  needs_materials?: boolean
  /** Saved-with-intent: Today nudges on this date. */
  remind_at?: string
  /** Apply-flow analysis: deterministic posting parse + fit (no model). */
  posting?: PostingRecord
  /** Apply-flow output: deterministic assembly + the two LLM-written pieces. */
  materials?: Materials
  events: ApplicationEvent[]
}

export interface PostingRecord {
  url?: string
  description: string
  fit_score: number
  fit_notes: string[]
  matched: string[]
  missing: string[]
  analyzed_at: string
}

export interface RewriteDecision {
  status: 'accepted' | 'rejected'
  edited?: string
}

export interface Materials {
  summary?: string
  cover_letter?: string
  resume_adjustments?: string
  resume_rewrites?: { source: string; rewrite: string; why: string }[]
  /** Triage decisions keyed by rewrite index. Optional; JSON-serializable for localStorage + export. */
  rewrite_decisions?: Record<number, RewriteDecision>
  opportunity_angles?: { title: string; evidence: string; use: string }[]
  standout_suggestions?: { title: string; action: string; effort: 'low' | 'medium' | 'high' }[]
  generated_at?: string
  model?: string
  revisions?: number
  /** Stamped when the user clicks "Materials done — applying". Presence = sendable. */
  finalized_at?: string
  /** revisions count captured at the moment of send. */
  revisions_at_send?: number
  /** Stamped after a successful PDF export. Used to detect content-changed-since-export. */
  exported_at?: string
  /** Application-form Q&A: the user pastes a question, the model drafts an answer. */
  qa?: { question: string; answer: string; added_at?: string }[]
}

export interface TransitionError {
  code: 'illegal_transition' | 'missing_closed_reason'
  message: string
}

export type TransitionResult =
  | { ok: true; value: Application }
  | { ok: false; error: TransitionError }

export interface GroupStats {
  key: string
  /** Applications that have actually been applied (status !== 'saved'). */
  total: number
  responses: number
  interviews: number
  /** null when total is 0 */
  responseRate: number | null
  interviewRate: number | null
  /** Median days from applied to first response/interview event; null if none. */
  medianDaysToFirstResponse: number | null
  /** Under 5 applied — UI shows counts, not rates. */
  lowData: boolean
}

export interface Stats {
  byRoleType: GroupStats[]
  bySource: GroupStats[]
  byResumeVersion: GroupStats[]
}

export interface ImportError {
  path: string
  message: string
}

export type ImportResult =
  | { ok: true; applications: Application[]; warnings: string[] }
  | { ok: false; errors: ImportError[] }
