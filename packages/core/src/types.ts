// The whole product model. Pure data — no I/O, no framework, no clock.

export type RoleType = 'design_engineer' | 'product_designer' | 'brand_motion' | 'other'

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
  events: ApplicationEvent[]
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
