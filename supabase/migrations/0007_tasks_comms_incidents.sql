-- ============================================================================
-- 0007_tasks_comms_incidents.sql
-- Tasks/dispatch, communication (stub for Phase 6), and emergencies/incidents.
-- ============================================================================

create type public.task_type as enum ('patrol', 'inspection', 'maintenance', 'response', 'other');
create type public.task_priority as enum ('low', 'normal', 'high', 'critical');
create type public.task_status as enum ('open', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled');
create type public.incident_type as enum ('sos', 'panic', 'alarm', 'medical', 'security', 'other');
create type public.incident_status as enum ('open', 'acknowledged', 'in_progress', 'resolved', 'false_alarm');

-- ----------------------------------------------------------------------------
-- tasks + task_events (dispatch)
-- ----------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  type         public.task_type not null default 'other',
  priority     public.task_priority not null default 'normal',
  status       public.task_status not null default 'open',
  title        text not null,
  description  text,
  site_id      uuid references public.sites (id) on delete set null,
  location     geography(Point, 4326),
  assigned_to  uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  due_at       timestamptz,
  accepted_at  timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_assigned_idx on public.tasks (assigned_to, status);
create index tasks_status_idx   on public.tasks (status, priority);
create index tasks_site_idx     on public.tasks (site_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_events (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  from_status public.task_status,
  to_status   public.task_status,
  note       text,
  at         timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, at);

-- ----------------------------------------------------------------------------
-- Communication (schema stub; built out in Phase 6)
-- ----------------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  is_group   boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  body            text,
  attachment_url  text,
  client_ref      uuid unique,           -- offline idempotency
  sent_at         timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, sent_at desc);

-- ----------------------------------------------------------------------------
-- incidents: SOS/panic and operator-raised incidents.
-- ----------------------------------------------------------------------------
create table public.incidents (
  id              uuid primary key default gen_random_uuid(),
  type            public.incident_type not null default 'sos',
  status          public.incident_status not null default 'open',
  raised_by       uuid references public.profiles (id) on delete set null,
  site_id         uuid references public.sites (id) on delete set null,
  location        geography(Point, 4326),
  description     text,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  client_ref      uuid unique,           -- offline idempotency for SOS
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index incidents_status_idx on public.incidents (status, created_at desc);
create index incidents_raised_idx on public.incidents (raised_by, created_at desc);

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

comment on table public.incidents is
  'SOS/panic + operator incidents. Insert is the most permissive in the system.';
