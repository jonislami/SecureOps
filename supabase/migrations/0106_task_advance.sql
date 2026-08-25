-- ============================================================================
-- 0106_task_advance.sql
-- Phase 5: advance a task through its lifecycle with server-side checks and an
-- automatic audit trail in task_events. Assignee or staff may advance.
-- ============================================================================

create or replace function public.advance_task(p_task uuid, p_to text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_to   public.task_status := p_to::public.task_status;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_task from public.tasks where id = p_task;
  if v_task.id is null then raise exception 'task not found'; end if;

  -- Only the assignee or an oversight role may move a task.
  if v_task.assigned_to <> v_uid and not public.is_staff() then
    raise exception 'not your task';
  end if;

  update public.tasks
  set status = v_to,
      accepted_at  = case when v_to = 'accepted'  and accepted_at  is null then now() else accepted_at  end,
      completed_at = case when v_to = 'completed' then now() else completed_at end
  where id = p_task;

  insert into public.task_events(task_id, actor_id, from_status, to_status)
  values (p_task, v_uid, v_task.status, v_to);

  return jsonb_build_object('status', v_to);
end;
$$;

revoke all on function public.advance_task(uuid, text) from public;
grant execute on function public.advance_task(uuid, text) to authenticated;
