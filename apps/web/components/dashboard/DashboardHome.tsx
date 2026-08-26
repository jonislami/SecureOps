'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS, type AppRole } from '@sentinel/shared';
import { signOut } from '@/app/auth/actions';
import { DuotoneMap, type FieldMarker, type FieldRing, type FieldStatus } from '@/components/map/DuotoneMap';

interface Site { id: string; name: string; lng: number; lat: number; zoneId: string | null; radius: number | null }
interface Member {
  id: string; name: string; initials: string; role: string; siteName: string | null; siteId: string | null;
  window: string | null; lng: number; lat: number; ageSec: number; status: FieldStatus; battery: number | null;
}
interface Incident { id: string; type: string; name: string; site: string | null; ago: string; raisedBy: string }
interface ActivityRow { at: string; text: string }

const ROLE_LABEL: Record<string, string> = { guard: 'static', patrol: 'patrol', technician: 'technician', office: 'office' };

const initialsOf = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase(); };
const relTime = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);
function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const muted = (p: number) => `color-mix(in srgb,var(--color-text) ${p}%,transparent)`;

export function DashboardHome({ user }: { user: { name: string; email: string; roles: AppRole[]; isAdmin: boolean } }) {
  const supabase = useMemo(() => createClient(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [taskCounts, setTaskCounts] = useState({ open: 0, total: 0, unassigned: 0 });
  const [shiftCounts, setShiftCounts] = useState({ active: 0, assigned: 0 });
  const [cp, setCp] = useState({ scanned: 0, total: 0 });
  const [clock, setClock] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [sitesR, zonesR, locR, incR, tasksR, shiftsR, cpR, scansR, gevR] = await Promise.all([
      supabase.from('sites').select('id, name, lng, lat, zone_id, geofences(radius_m)').not('lng', 'is', null),
      supabase.from('zones').select('id, name'),
      supabase.from('current_location').select('employee_id, lng, lat, is_moving, recorded_at, updated_at, battery_pct, profiles(full_name, employment_type), shifts(starts_at, ends_at, sites(id, name))').not('lng', 'is', null),
      supabase.from('incidents').select('id, type, created_at, raised_by, profiles(full_name), sites(name)').in('status', ['open', 'acknowledged', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, status, assigned_to'),
      supabase.from('shifts').select('id, status').in('status', ['active', 'scheduled']),
      supabase.from('checkpoints').select('id', { count: 'exact', head: true }),
      supabase.from('checkpoint_scans').select('id', { count: 'exact', head: true }).gte('scanned_at', todayStart.toISOString()),
      supabase.from('geofence_events').select('event_type, occurred_at, profiles(full_name), sites(name)').order('occurred_at', { ascending: false }).limit(6),
    ]);

    const siteList: Site[] = ((sitesR.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string, name: r.name as string, lng: r.lng as number, lat: r.lat as number,
      zoneId: (r.zone_id as string | null) ?? null,
      radius: ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
    }));
    setSites(siteList);
    setZones(((zonesR.data ?? []) as { id: string; name: string }[]));
    const siteRadius = new Map(siteList.map((s) => [s.id, s.radius]));

    const incList = ((incR.data ?? []) as unknown as Array<Record<string, unknown>>).map((i) => ({
      id: i.id as string, type: i.type as string,
      name: ((i.profiles as { full_name?: string } | null)?.full_name) ?? 'Field member',
      site: ((i.sites as { name?: string } | null)?.name) ?? null,
      ago: relTime(Math.round((Date.now() - new Date(i.created_at as string).getTime()) / 1000)),
      raisedBy: i.raised_by as string,
    }));
    setIncidents(incList);
    const sosSet = new Set(incList.map((i) => i.raisedBy));

    const mem: Member[] = ((locR.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const prof = r.profiles as { full_name?: string; employment_type?: string } | null;
      const shift = r.shifts as { starts_at?: string; ends_at?: string; sites?: { id?: string; name?: string } | null } | null;
      const site = shift?.sites ?? null;
      const name = prof?.full_name ?? (r.employee_id as string).slice(0, 8);
      const lng = r.lng as number, lat = r.lat as number;
      const ageSec = Math.round((Date.now() - new Date((r.updated_at as string) ?? (r.recorded_at as string)).getTime()) / 1000);
      const moving = !!r.is_moving;
      let status: FieldStatus;
      if (sosSet.has(r.employee_id as string)) status = 'sos';
      else if (ageSec > 180) status = 'offline';
      else {
        const s = site?.id ? siteList.find((x) => x.id === site.id) : null;
        if (s) status = distM(lat, lng, s.lat, s.lng) <= (siteRadius.get(s.id) ?? 100) ? 'on_post' : moving ? 'moving' : 'idle';
        else status = moving ? 'moving' : 'idle';
      }
      const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
      return {
        id: r.employee_id as string, name, initials: initialsOf(name),
        role: ROLE_LABEL[prof?.employment_type ?? 'guard'] ?? 'field',
        siteName: site?.name ?? null, siteId: site?.id ?? null,
        window: shift?.starts_at ? `${fmt(shift.starts_at)}–${fmt(shift.ends_at)}` : null,
        lng, lat, ageSec, status, battery: (r.battery_pct as number | null) ?? null,
      };
    });
    mem.sort((a, b) => a.ageSec - b.ageSec);
    setMembers(mem);

    const tasks = (tasksR.data ?? []) as Array<{ status: string; assigned_to: string | null }>;
    const open = tasks.filter((t) => ['open', 'assigned', 'accepted', 'in_progress'].includes(t.status));
    setTaskCounts({ open: open.length, total: tasks.length, unassigned: open.filter((t) => !t.assigned_to).length });
    const shifts = (shiftsR.data ?? []) as Array<{ status: string }>;
    setShiftCounts({ active: shifts.filter((s) => s.status === 'active').length, assigned: shifts.length });
    setCp({ scanned: scansR.count ?? 0, total: cpR.count ?? 0 });

    setActivity(((gevR.data ?? []) as unknown as Array<Record<string, unknown>>).map((g) => ({
      at: new Date(g.occurred_at as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      text: `${((g.profiles as { full_name?: string } | null)?.full_name) ?? 'Field member'} ${g.event_type === 'enter' ? 'entered' : 'left'} geofence ${((g.sites as { name?: string } | null)?.name) ?? ''}`.trim(),
    })));
  }, [supabase]);

  useEffect(() => {
    load();
    const ch = supabase.channel('dash').on('postgres_changes', { event: '*', schema: 'public', table: 'current_location' }, () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(load, 1000);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load]);

  // Derived.
  const onShift = members.filter((m) => m.status !== 'offline').length;
  const coveredSites = new Set(members.filter((m) => m.status === 'on_post' && m.siteId).map((m) => m.siteId as string));
  const covered = coveredSites.size;
  const staleCount = members.filter((m) => m.ageSec > 120).length;
  const lowBattery = members.filter((m) => m.battery != null && m.battery < 20).length;
  const reporting = members.length;

  const markers: FieldMarker[] = members.map((m) => ({ id: m.id, lng: m.lng, lat: m.lat, initials: m.initials, status: m.status }));
  const rings: FieldRing[] = sites.map((s) => ({ id: s.id, lng: s.lng, lat: s.lat, radiusM: s.radius ?? 100, tone: coveredSites.has(s.id) ? 'accent' : 'neutral' }));
  const mapCenter = members[0] ? ([members[0].lng, members[0].lat] as [number, number]) : undefined;

  const zoneCoverage = zones.map((z) => {
    const zs = sites.filter((s) => s.zoneId === z.id);
    const cov = zs.filter((s) => coveredSites.has(s.id)).length;
    return { name: z.name, cov, total: zs.length };
  }).filter((z) => z.total > 0);

  const roleTags = user.roles.filter((r) => ['super_admin', 'control_operator', 'dispatcher', 'supervisor'].includes(r));

  const K = kpiCard;
  return (
    <div className="si" style={{ minHeight: '100vh', color: 'var(--color-text)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 22, height: 52, padding: '0 24px', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, border: '1.5px solid var(--color-accent)', display: 'grid', placeItems: 'center' }}><div style={{ width: 8, height: 8, background: 'var(--color-accent)' }} /></div>
          <span style={{ font: '600 19px/1 var(--font-heading)', letterSpacing: '.07em' }}>SENTINEL</span>
          <span style={{ font: '400 10px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: muted(50) }}>Control Center</span>
        </div>
        <nav style={{ display: 'flex', gap: 20, font: '500 11px/1 var(--font-body)', letterSpacing: '.11em', textTransform: 'uppercase' }}>
          <span style={{ color: 'var(--color-accent)', borderBottom: '2px solid var(--color-accent)', paddingBottom: 4 }}>Dashboard</span>
          <Link href="/map" style={{ color: muted(55), textDecoration: 'none' }}>Live Map</Link>
          <Link href="/sites" style={{ color: muted(55), textDecoration: 'none' }}>Sites</Link>
          <Link href="/shifts" style={{ color: muted(55), textDecoration: 'none' }}>Shifts</Link>
          <Link href="/patrols" style={{ color: muted(55), textDecoration: 'none' }}>Patrols</Link>
          <Link href="/tasks" style={{ color: muted(55), textDecoration: 'none' }}>Tasks</Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px', border: '1px solid var(--color-divider)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
            <span style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.13em' }}>LIVE · {clock}</span>
          </div>
          <span style={{ font: '400 12px/1 var(--font-body)', color: muted(60) }}>{user.email}</span>
          <form action={signOut}><button className="btn btn-secondary" style={{ height: 30, fontSize: 11, letterSpacing: '.08em' }}>SIGN OUT</button></form>
        </div>
      </header>

      <div style={{ padding: '26px 24px 40px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1500, width: '100%', margin: '0 auto' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, font: '600 40px/1 var(--font-heading)', letterSpacing: '.01em' }}>Control Center</h1>
            <p style={{ margin: '6px 0 0', font: '14px/1.5 var(--font-body)', color: muted(62) }}>
              {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })} · {onShift} on shift · Operator {user.name}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {roleTags.length ? roleTags.map((r) => (<span key={r} className="tag" style={tagAccent}>{ROLE_LABELS[r]}</span>)) : <span className="tag" style={tagAccent}>Operator</span>}
            </div>
            <Link href="/map" className="btn btn-primary" style={{ height: 36, fontSize: 11, letterSpacing: '.1em', textDecoration: 'none' }}>OPEN LIVE MAP</Link>
          </div>
        </div>

        {/* KPI band */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
          {K('On shift', <><span style={{ font: '600 40px/1 var(--font-heading)', color: 'var(--color-accent)' }}>{onShift}</span><span style={{ font: '600 14px/1 var(--font-heading)', color: muted(45) }}>/ {shiftCounts.assigned || members.length}</span></>, `${Math.max(0, shiftCounts.assigned - onShift)} not checked in`)}
          {K('Sites covered', <><span style={{ font: '600 40px/1 var(--font-heading)' }}>{covered}</span><span style={{ font: '600 14px/1 var(--font-heading)', color: muted(45) }}>/ {sites.length}</span></>, `${Math.max(0, sites.length - covered)} uncovered`, sites.length - covered > 0)}
          {K('Checkpoints', <><span style={{ font: '600 40px/1 var(--font-heading)' }}>{cp.scanned}</span><span style={{ font: '600 14px/1 var(--font-heading)', color: muted(45) }}>/ {cp.total}</span></>, 'scanned today')}
          {K('Open tasks', <><span style={{ font: '600 40px/1 var(--font-heading)' }}>{taskCounts.open}</span><span style={{ font: '600 14px/1 var(--font-heading)', color: muted(45) }}>/ {taskCounts.total}</span></>, `${taskCounts.unassigned} unassigned`)}
          {K('Active alarms', <span style={{ font: '600 40px/1 var(--font-heading)', color: 'var(--color-alarm)' }}>{incidents.length}</span>, incidents.length ? `${incidents.length} awaiting response` : 'all clear', false, incidents.length > 0)}
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 392px', gap: 18, alignItems: 'start' }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* Field positions mini-map */}
            <div className="card blueprint" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              <Corners />
              <SectionHead title="Field positions" right={`${members.length} REPORTING · EVERY 15S`} />
              <div style={{ position: 'relative', height: 326 }}>
                <DuotoneMap markers={markers} rings={rings} center={mapCenter} zoom={12} className="cc-map-fill" />
              </div>
            </div>

            {/* Shift board */}
            <div className="card blueprint" style={{ padding: 0, gap: 0 }}>
              <Corners />
              <SectionHead title="Shift board" right={<Link href="/shifts" style={{ color: 'var(--color-accent-700)', textDecoration: 'none' }}>MANAGE SHIFTS →</Link>} />
              <table className="si-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr>{['Worker', 'Post / route', 'Window', 'State', 'Last ping'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 4 ? 'right' : 'left', font: '600 11px/1 var(--font-heading)', letterSpacing: '.08em', textTransform: 'uppercase', color: muted(60), padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {members.slice(0, 8).map((m) => (
                    <tr key={m.id}>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-divider)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{m.name}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}>{m.siteName ?? '—'} · {m.role}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}>{m.window ?? '—'}</td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-divider)' }}><StateTag status={m.status} /></td>
                      <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-divider)', textAlign: 'right', color: m.status === 'sos' ? 'var(--color-alarm)' : undefined }}>{relTime(m.ageSec)}</td>
                    </tr>
                  ))}
                  {members.length === 0 && (<tr><td colSpan={5} style={{ padding: '14px', color: muted(55), fontSize: 13 }}>No one on shift yet. Assign shifts and staff will appear here.</td></tr>)}
                </tbody>
              </table>
            </div>

            {/* Modules */}
            <div>
              <h5 style={{ margin: '0 0 12px', font: '600 13px/1 var(--font-heading)', letterSpacing: '.15em', textTransform: 'uppercase', color: muted(55) }}>Modules</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                <ModuleCard href="/map" title="Live Map" desc="Real-time field locations" action="Open map →" />
                <ModuleCard href="/sites" title="Sites & Geofences" desc={`${sites.length} protected locations`} action="Manage sites →" />
                <ModuleCard href="/shifts" title="Shifts" desc="Assign guards to posts" action="Manage shifts →" />
                <ModuleCard href="/patrols" title="Patrol Routes" desc="Routes & checkpoints" action="Manage routes →" />
                <ModuleCard href="/tasks" title="Tasks & Dispatch" desc={`${taskCounts.open} open · ${taskCounts.unassigned} unassigned`} action="Dispatch →" />
                <ModuleCard href="/respond" title="Emergencies" desc={incidents.length ? `${incidents.length} awaiting ack` : 'Alarm response'} action="Respond →" alarm />
                {user.isAdmin && <ModuleCard href="/admin" title="Workers & Roles" desc="Accounts & permissions" action="Admin →" />}
                <ModuleCard title="Reports" desc="Shift & compliance export" action="Phase 9" disabled />
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Needs response */}
            <div className="card blueprint" style={{ padding: 0, gap: 0, borderColor: 'var(--color-alarm)' }}>
              <Corners alarm />
              <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--color-alarm)', background: 'color-mix(in srgb,var(--color-alarm) 12%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h5 style={{ margin: 0, font: '600 14px/1 var(--font-heading)', letterSpacing: '.1em', textTransform: 'uppercase', color: '#7d2a20' }}>Needs response</h5>
                <span style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.11em', color: '#7d2a20' }}>{incidents.length}</span>
              </div>
              {incidents.length === 0 ? (
                <div style={{ padding: '16px 15px', font: '12px/1.5 var(--font-body)', color: muted(55) }}>No active alarms. SOS and geofence breaches show here.</div>
              ) : incidents.slice(0, 4).map((i) => (
                <div key={i.id} style={{ padding: '14px 15px', borderBottom: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--color-alarm)', color: '#f2f2f3', font: '600 12px/1 var(--font-heading)' }}>{initialsOf(i.name)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: '600 15px/1.15 var(--font-heading)' }}>{i.type.toUpperCase()} · {i.name}</div>
                      <div style={{ font: '11px/1.35 var(--font-body)', color: muted(60) }}>{i.site ?? 'Unknown site'} · raised {i.ago} ago</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link href="/map" className="btn btn-primary" style={{ flex: 1, height: 30, fontSize: 10, letterSpacing: '.09em', background: 'var(--color-alarm)', borderColor: 'var(--color-alarm)', textDecoration: 'none' }}>ACKNOWLEDGE</Link>
                    <Link href="/map" className="btn btn-secondary" style={{ flex: 1, height: 30, fontSize: 10, letterSpacing: '.09em', textDecoration: 'none' }}>LOCATE</Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Coverage by zone */}
            {zoneCoverage.length > 0 && (
              <div className="card blueprint" style={{ padding: 0, gap: 0 }}>
                <Corners />
                <SectionHead title="Coverage by zone" />
                <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {zoneCoverage.map((z) => (
                    <div key={z.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', font: '12px/1 var(--font-body)' }}><span>{z.name}</span><span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{z.cov} / {z.total}</span></div>
                      <div style={{ height: 6, background: 'var(--color-neutral-300)' }}><div style={{ width: `${z.total ? (z.cov / z.total) * 100 : 0}%`, height: 6, background: 'var(--color-accent)' }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="card blueprint" style={{ padding: 0, gap: 0 }}>
              <Corners />
              <SectionHead title="Activity" right={<span style={{ color: 'var(--color-accent-700)' }}>LIVE</span>} />
              <div style={{ padding: '6px 15px 12px' }}>
                {activity.length === 0 ? (
                  <div style={{ padding: '10px 0', font: '12px/1.45 var(--font-body)', color: muted(55) }}>Geofence entries, scans, and alarms appear here.</div>
                ) : activity.map((a, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 10, padding: '9px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--color-divider)' : 'none', font: '12px/1.45 var(--font-body)' }}>
                    <span style={{ color: muted(50) }}>{a.at}</span><span>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* GPS pipeline health */}
            <div className="card blueprint" style={{ padding: 15, gap: 10 }}>
              <Corners />
              <div style={{ font: '600 9px/1 var(--font-heading)', letterSpacing: '.15em', textTransform: 'uppercase', color: muted(52) }}>GPS pipeline health</div>
              <HealthRow k="Devices reporting" v={`${reporting}`} />
              <HealthRow k="Ping cadence" v="15s" />
              <HealthRow k="Stale > 2 min" v={`${staleCount}`} alarm={staleCount > 0} />
              <HealthRow k="Low battery (< 20%)" v={`${lowBattery}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- small pieces ---- */
const tagAccent: CSSProperties = { background: 'var(--color-accent)', color: 'var(--color-bg)', font: '600 10px/1 var(--font-heading)', letterSpacing: '.06em', padding: '5px 9px', textTransform: 'uppercase' };

function Corners({ alarm }: { alarm?: boolean }) {
  const c = alarm ? { color: 'var(--color-alarm)' as const } : undefined;
  return (<>{(['tl', 'tr', 'bl', 'br'] as const).map((p) => <i key={p} className={`corner ${p}`} style={c} />)}</>);
}
function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--color-divider)' }}>
      <h5 style={{ margin: 0, font: '600 15px/1 var(--font-heading)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{title}</h5>
      {right && <span style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.11em', color: 'var(--color-accent-700)' }}>{right}</span>}
    </div>
  );
}
function kpiCard(label: string, value: ReactNode, sub: string, subAlarm = false, alarmBorder = false) {
  return (
    <div className="card blueprint" style={{ padding: 16, gap: 8, borderColor: alarmBorder ? 'var(--color-alarm)' : undefined }}>
      <Corners alarm={alarmBorder} />
      <div style={{ font: '600 9px/1 var(--font-heading)', letterSpacing: '.15em', textTransform: 'uppercase', color: alarmBorder ? 'var(--color-alarm)' : muted(52) }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{value}</div>
      <div style={{ font: '11px/1.4 var(--font-body)', color: subAlarm ? 'var(--color-alarm)' : muted(60) }}>{sub}</div>
    </div>
  );
}
function ModuleCard({ href, title, desc, action, alarm, disabled }: { href?: string; title: string; desc: string; action: string; alarm?: boolean; disabled?: boolean }) {
  const inner = (
    <div className="card blueprint" style={{ padding: 15, gap: 6, borderColor: alarm ? 'var(--color-alarm)' : undefined, opacity: disabled ? 0.6 : 1, height: '100%' }}>
      <Corners alarm={alarm} />
      <div style={{ font: '600 15px/1.1 var(--font-heading)', letterSpacing: '.04em', color: alarm ? '#7d2a20' : undefined }}>{title}</div>
      <div style={{ font: '11.5px/1.45 var(--font-body)', color: muted(60) }}>{desc}</div>
      <div style={{ font: '600 9px/1 var(--font-heading)', letterSpacing: '.13em', textTransform: 'uppercase', color: disabled ? muted(50) : alarm ? 'var(--color-alarm)' : 'var(--color-accent-700)', marginTop: 2 }}>{action}</div>
    </div>
  );
  return href && !disabled ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}
function StateTag({ status }: { status: FieldStatus }) {
  if (status === 'on_post') return <span className="tag" style={{ background: 'var(--color-accent-100, #eef6ff)', color: 'var(--color-accent-800)', padding: '3px 10px', fontSize: 11 }}>On post</span>;
  if (status === 'moving') return <span className="tag" style={{ border: '1px solid var(--color-accent)', color: 'var(--color-accent)', padding: '3px 10px', fontSize: 11 }}>Moving</span>;
  if (status === 'sos') return <span className="tag" style={{ background: 'color-mix(in srgb,var(--color-alarm) 15%,transparent)', color: '#7d2a20', padding: '3px 10px', fontSize: 11 }}>SOS</span>;
  if (status === 'offline') return <span className="tag" style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', padding: '3px 10px', fontSize: 11 }}>No check-in</span>;
  return <span className="tag" style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', padding: '3px 10px', fontSize: 11 }}>Idle</span>;
}
function HealthRow({ k, v, alarm }: { k: string; v: string; alarm?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', font: '12px/1 var(--font-body)' }}>
      <span>{k}</span><span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, color: alarm ? 'var(--color-alarm)' : undefined }}>{v}</span>
    </div>
  );
}
