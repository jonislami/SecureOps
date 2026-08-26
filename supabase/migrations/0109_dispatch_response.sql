-- ============================================================================
-- 0109_dispatch_response.sql
-- Alarm response: dispatch a patrol to a building — creates a high-priority
-- response task (shows on the patrol's phone) + an alarm incident record.
-- Staff/dispatcher only. The client ranks patrols by distance and passes the
-- chosen one (usually the nearest).
-- ============================================================================

create or replace function public.dispatch_response(
  p_site   uuid,
  p_patrol uuid,
  p_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_site  public.sites%rowtype;
  v_task  uuid;
  v_inc   uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_staff() then raise exception 'forbidden: control-center only'; end if;

  select * into v_site from public.sites where id = p_site;
  if v_site.id is null then raise exception 'building not found'; end if;
  if p_patrol is null then raise exception 'no patrol selected'; end if;

  insert into public.tasks(
    type, priority, status, title, description, site_id, location,
    assigned_to, created_by, due_at
  )
  values (
    'response', 'high', 'assigned',
    'Alarm response · ' || v_site.name,
    coalesce(nullif(p_note, ''), 'Alarm at ' || v_site.name || ' — respond immediately.'),
    p_site, v_site.location, p_patrol, v_uid, now() + interval '30 minutes'
  )
  returning id into v_task;

  insert into public.task_events(task_id, actor_id, from_status, to_status, note)
  values (v_task, v_uid, null, 'assigned', 'Dispatched from alarm response');

  insert into public.incidents(
    type, status, site_id, location, description, raised_by
  )
  values (
    'alarm', 'open', p_site, v_site.location,
    'Alarm at ' || v_site.name || ' — patrol dispatched.', v_uid
  )
  returning id into v_inc;

  return jsonb_build_object('task_id', v_task, 'incident_id', v_inc);
end;
$$;

revoke all on function public.dispatch_response(uuid, uuid, text) from public;
grant execute on function public.dispatch_response(uuid, uuid, text) to authenticated;
