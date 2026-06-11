-- Ghosted v2 schema. Mirrors packages/core types exactly.
-- RLS is written here, BEFORE the first insert ever happens (plan M2).

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null check (length(company) between 1 and 200),
  position text not null check (length(position) between 1 and 200),
  role_type text not null check (role_type in ('design_engineer', 'product_designer', 'brand_motion', 'other')),
  status text not null default 'saved' check (status in ('saved', 'applied', 'interviewing', 'offer', 'closed')),
  closed_reason text check (closed_reason in ('rejected', 'withdrawn', 'accepted')),
  source text,
  date_applied date,
  salary_min integer check (salary_min >= 0),
  salary_max integer check (salary_max >= 0),
  location text,
  remote boolean,
  resume_version text,
  job_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the same invariant transition() enforces in core
  constraint closed_needs_reason check (status <> 'closed' or closed_reason is not null)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('applied', 'response', 'interview', 'follow_up', 'note')),
  date date not null,
  detail text,
  corrected boolean not null default false, -- append-only with corrections
  created_at timestamptz not null default now()
);

create index applications_user_idx on public.applications (user_id, status);
create index events_application_idx on public.events (application_id, date);
create index events_user_idx on public.events (user_id);

-- RLS: every row is owned; user A can never touch user B's rows.
alter table public.applications enable row level security;
alter table public.events enable row level security;

create policy "own applications" on public.applications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own events" on public.events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger applications_touch
  before update on public.applications
  for each row execute function public.touch_updated_at();
