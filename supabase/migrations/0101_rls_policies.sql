-- ============================================================================
-- 0101_rls_policies.sql
-- Enable RLS on every table and define policies (docs/03-rbac-rls.md).
-- Pattern: field staff touch only their own rows; oversight roles see across;
-- admins/dispatchers manage reference & dispatch data. Situational business
-- rules (geofence-gated check-in, etc.) are enforced in Edge Functions.
-- ============================================================================

-- Enable RLS everywhere ------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.user_roles            enable row level security;
alter table public.clients               enable row level security;
alter table public.zones                 enable row level security;
alter table public.sites                 enable row level security;
alter table public.geofences             enable row level security;
alter table public.teams                 enable row level security;
alter table public.team_members          enable row level security;
alter table public.vehicles              enable row level security;
alter table public.shifts                enable row level security;
alter table public.location_pings        enable row level security;
alter table public.current_location      enable row level security;
alter table public.location_history      enable row level security;
alter table public.geofence_events       enable row level security;
alter table public.attendance            enable row level security;
alter table public.patrol_routes         enable row level security;
alter table public.checkpoints           enable row level security;
alter table public.patrol_sessions       enable row level security;
alter table public.checkpoint_scans      enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_events           enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.incidents             enable row level security;
alter table public.audit_log             enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff() or public.supervises(id));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- user_roles  (only admins manage; everyone may read their own)
-- ============================================================================
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Reference data: clients, zones, sites, geofences, vehicles
--   read: any authenticated staff; field staff read (site access refined via app)
--   write: admins (vehicles/sites also dispatcher where useful)
-- ============================================================================
create policy clients_select on public.clients
  for select to authenticated using (true);
create policy clients_admin_write on public.clients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy zones_select on public.zones
  for select to authenticated using (true);
create policy zones_admin_write on public.zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy sites_select on public.sites
  for select to authenticated using (true);
create policy sites_admin_write on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy geofences_select on public.geofences
  for select to authenticated using (true);
create policy geofences_admin_write on public.geofences
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy vehicles_select on public.vehicles
  for select to authenticated using (true);
create policy vehicles_staff_write on public.vehicles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ============================================================================
-- teams / team_members
-- ============================================================================
create policy teams_select on public.teams
  for select to authenticated
  using (public.is_staff() or supervisor_id = auth.uid()
         or exists (select 1 from public.team_members tm
                    where tm.team_id = id and tm.user_id = auth.uid()));
create policy teams_admin_write on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy team_members_select on public.team_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff()
         or exists (select 1 from public.teams t
                    where t.id = team_id and t.supervisor_id = auth.uid()));
create policy team_members_admin_write on public.team_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- shifts  (self read/limited; staff manage)
-- ============================================================================
create policy shifts_select on public.shifts
  for select to authenticated
  using (public.can_oversee(employee_id));

create policy shifts_staff_write on public.shifts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Field staff may update actual clock-in/out on their own shift.
create policy shifts_self_update on public.shifts
  for update to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- ============================================================================
-- GPS: location_pings / current_location / location_history / geofence_events
--   Field staff insert/read their own; oversight reads across.
--   (Ingest normally runs via service_role Edge Fn, which bypasses RLS.)
-- ============================================================================
create policy pings_self_insert on public.location_pings
  for insert to authenticated with check (employee_id = auth.uid());
create policy pings_select on public.location_pings
  for select to authenticated using (public.can_oversee(employee_id));

create policy current_loc_self_upsert on public.current_location
  for insert to authenticated with check (employee_id = auth.uid());
create policy current_loc_self_update on public.current_location
  for update to authenticated using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
create policy current_loc_select on public.current_location
  for select to authenticated using (public.can_oversee(employee_id));

create policy history_select on public.location_history
  for select to authenticated using (public.can_oversee(employee_id));

create policy geofence_events_select on public.geofence_events
  for select to authenticated using (public.can_oversee(employee_id));

-- ============================================================================
-- attendance  (self write own; oversight read/verify)
-- ============================================================================
create policy attendance_self_insert on public.attendance
  for insert to authenticated with check (employee_id = auth.uid());
create policy attendance_self_update on public.attendance
  for update to authenticated using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
create policy attendance_select on public.attendance
  for select to authenticated using (public.can_oversee(employee_id));
create policy attendance_staff_update on public.attendance
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ============================================================================
-- patrols
-- ============================================================================
create policy patrol_routes_select on public.patrol_routes
  for select to authenticated using (true);
create policy patrol_routes_staff_write on public.patrol_routes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy checkpoints_select on public.checkpoints
  for select to authenticated using (true);
create policy checkpoints_staff_write on public.checkpoints
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy patrol_sessions_self_write on public.patrol_sessions
  for all to authenticated
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());
create policy patrol_sessions_select on public.patrol_sessions
  for select to authenticated using (public.can_oversee(employee_id));

create policy scans_self_insert on public.checkpoint_scans
  for insert to authenticated with check (employee_id = auth.uid());
create policy scans_select on public.checkpoint_scans
  for select to authenticated using (public.can_oversee(employee_id));

-- ============================================================================
-- tasks / task_events
-- ============================================================================
create policy tasks_select on public.tasks
  for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid()
         or public.is_staff() or public.supervises(assigned_to));

create policy tasks_dispatch_write on public.tasks
  for all to authenticated
  using (public.is_dispatcher() or public.is_staff())
  with check (public.is_dispatcher() or public.is_staff());

-- Assignee may advance status of their own task.
create policy tasks_assignee_update on public.tasks
  for update to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

create policy task_events_select on public.task_events
  for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.tasks t
                    where t.id = task_id
                      and (t.assigned_to = auth.uid() or t.created_by = auth.uid())));
create policy task_events_insert on public.task_events
  for insert to authenticated
  with check (actor_id = auth.uid());

-- ============================================================================
-- communication  (members only)
-- ============================================================================
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.conversation_members m
                    where m.conversation_id = id and m.user_id = auth.uid()));
create policy conversations_insert on public.conversations
  for insert to authenticated with check (created_by = auth.uid() or public.is_staff());

create policy conv_members_select on public.conversation_members
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.conversation_members m
                    where m.conversation_id = public.conversation_members.conversation_id
                      and m.user_id = auth.uid())
         or public.is_staff());
create policy conv_members_manage on public.conversation_members
  for all to authenticated
  using (public.is_staff()
         or exists (select 1 from public.conversations c
                    where c.id = conversation_id and c.created_by = auth.uid()))
  with check (public.is_staff()
         or exists (select 1 from public.conversations c
                    where c.id = conversation_id and c.created_by = auth.uid()));

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.conversation_members m
                    where m.conversation_id = public.messages.conversation_id
                      and m.user_id = auth.uid()));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid()
              and exists (select 1 from public.conversation_members m
                          where m.conversation_id = public.messages.conversation_id
                            and m.user_id = auth.uid()));

-- ============================================================================
-- incidents  (SOS: anyone may raise; staff acknowledge/resolve)
-- ============================================================================
create policy incidents_insert on public.incidents
  for insert to authenticated with check (true);   -- safety first: never block SOS
create policy incidents_select on public.incidents
  for select to authenticated
  using (raised_by = auth.uid() or public.is_staff() or public.supervises(raised_by));
create policy incidents_staff_update on public.incidents
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ============================================================================
-- audit_log  (admins read; nobody writes directly — triggers use SECURITY DEFINER)
-- ============================================================================
create policy audit_admin_select on public.audit_log
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policies => direct client writes are denied.
