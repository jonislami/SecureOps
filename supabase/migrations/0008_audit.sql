-- ============================================================================
-- 0008_audit.sql
-- Append-only audit log + a generic trigger to capture sensitive mutations.
-- ============================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                       -- auth.uid() at time of change
  action      text not null,              -- INSERT | UPDATE | DELETE | custom
  entity_type text not null,              -- table name or logical entity
  entity_id   text,                       -- pk of the affected row (as text)
  before      jsonb,
  after       jsonb,
  ip          inet,
  at          timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, at desc);

comment on table public.audit_log is 'Append-only audit trail. Insert via triggers/functions only.';

-- ----------------------------------------------------------------------------
-- Generic audit trigger. Attach to sensitive tables with:
--   create trigger <t>_audit after insert or update or delete on <table>
--     for each row execute function public.audit_row();
-- ----------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id    text;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if (tg_op = 'DELETE') then
    v_id := (to_jsonb(old)->>'id');
    insert into public.audit_log(actor_id, action, entity_type, entity_id, before, after)
    values (v_actor, tg_op, tg_table_name, v_id, to_jsonb(old), null);
    return old;
  elsif (tg_op = 'UPDATE') then
    v_id := (to_jsonb(new)->>'id');
    insert into public.audit_log(actor_id, action, entity_type, entity_id, before, after)
    values (v_actor, tg_op, tg_table_name, v_id, to_jsonb(old), to_jsonb(new));
    return new;
  else -- INSERT
    v_id := (to_jsonb(new)->>'id');
    insert into public.audit_log(actor_id, action, entity_type, entity_id, before, after)
    values (v_actor, tg_op, tg_table_name, v_id, null, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- Attach audit to the most sensitive tables.
create trigger incidents_audit
  after insert or update or delete on public.incidents
  for each row execute function public.audit_row();

create trigger shifts_audit
  after insert or update or delete on public.shifts
  for each row execute function public.audit_row();

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row();

create trigger attendance_audit
  after insert or update or delete on public.attendance
  for each row execute function public.audit_row();
