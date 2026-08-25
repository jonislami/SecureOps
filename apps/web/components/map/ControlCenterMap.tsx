'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { MAP_DEFAULT } from '@/lib/env';
import { signOut } from '@/app/auth/actions';
import { DuotoneMap, type FieldMarker, type FieldRing, type FieldStatus } from './DuotoneMap';

interface Site {
  id: string;
  name: string;
  lng: number;
  lat: number;
  radius_m: number | null;
}
interface Member {
  id: string;
  name: string;
  initials: string;
  role: string; // display role
  empType: string; // guard | patrol | technician | office
  code: string | null;
  siteId: string | null;
  siteName: string | null;
  lng: number;
  lat: number;
  isMoving: boolean;
  speedKmh: number | null;
  ageSec: number;
  status: FieldStatus;
}

const ROLE_LABEL: Record<string, string> = {
  guard: 'Static guard',
  patrol: 'Mobile patrol',
  technician: 'Technician',
  office: 'Office',
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}
function relTime(sec: number) {
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000,
    toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat),
    dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const FILTERS = ['ALL', 'ON POST', 'MOVING', 'STALE'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TEXT: Record<FieldStatus, string> = {
  on_post: 'ON POST',
  moving: 'MOVING',
  idle: 'IDLE',
  offline: 'OFFLINE',
  sos: 'SOS',
};
const STATUS_COLOR: Record<FieldStatus, string> = {
  on_post: 'var(--color-accent-700)',
  moving: 'var(--color-accent-700)',
  idle: 'var(--color-neutral-700)',
  offline: 'var(--color-neutral-700)',
  sos: 'var(--color-alarm)',
};

export function ControlCenterMap({ user }: { user: { name: string; role: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sos, setSos] = useState<{ name: string; site: string | null; ago: string; siteId: string | null } | null>(null);
  const [clock, setClock] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layer filters + building search.
  const [showGuards, setShowGuards] = useState(true);
  const [showPatrols, setShowPatrols] = useState(true);
  const [showBuildings, setShowBuildings] = useState(false);
  const [bldQuery, setBldQuery] = useState('');
  const [bldResults, setBldResults] = useState<Array<{ id: string; name: string; lng: number; lat: number; radius: number | null }>>([]);
  const [pickedBuilding, setPickedBuilding] = useState<{ id: string; name: string; lng: number; lat: number; radius: number | null } | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | undefined>(undefined);

  // Live clock.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  const loadSites = useCallback(async () => {
    // Paginate lightweight site points (PostgREST caps at 1000/req) so the
    // buildings layer can show thousands. Radius is fetched per selected building.
    const all: Site[] = [];
    for (let page = 0; page < 20; page++) {
      const from = page * 1000;
      const { data } = await supabase
        .from('sites')
        .select('id, name, lng, lat')
        .not('lng', 'is', null)
        .order('id')
        .range(from, from + 999);
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      for (const r of rows) all.push({ id: r.id as string, name: r.name as string, lng: r.lng as number, lat: r.lat as number, radius_m: null });
      if (rows.length < 1000) break;
    }
    setSites(all);
  }, [supabase]);

  const loadRoster = useCallback(async () => {
    const [{ data: locs }, { data: inc }] = await Promise.all([
      supabase
        .from('current_location')
        .select(
          'employee_id, lng, lat, is_moving, speed_mps, recorded_at, updated_at, profiles(full_name, employee_code, employment_type), shifts(site_id, sites(id, name, lng, lat))'
        )
        .not('lng', 'is', null),
      supabase
        .from('incidents')
        .select('raised_by, created_at, profiles(full_name), sites(id, name)')
        .in('status', ['open', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: false }),
    ]);

    const incidents = (inc ?? []) as unknown as Array<Record<string, unknown>>;
    const sosSet = new Set(incidents.map((i) => i.raised_by as string));
    if (incidents[0]) {
      const i0 = incidents[0];
      const ago = Math.round((Date.now() - new Date(i0.created_at as string).getTime()) / 1000);
      setSos({
        name: ((i0.profiles as { full_name?: string } | null)?.full_name) ?? 'Field member',
        site: ((i0.sites as { name?: string } | null)?.name) ?? null,
        siteId: ((i0.sites as { id?: string } | null)?.id) ?? null,
        ago: relTime(ago),
      });
    } else setSos(null);

    // Build a site radius lookup from the already-loaded sites (may be empty on first call).
    const siteRadius = new Map(sites.map((s) => [s.id, s.radius_m]));

    const list: Member[] = ((locs ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const prof = r.profiles as { full_name?: string; employee_code?: string; employment_type?: string } | null;
      const shift = r.shifts as { site_id?: string; sites?: { id?: string; name?: string; lng?: number; lat?: number } | null } | null;
      const name = prof?.full_name ?? (r.employee_id as string).slice(0, 8);
      const lng = r.lng as number;
      const lat = r.lat as number;
      const site = shift?.sites ?? null;
      const ageSec = Math.round((Date.now() - new Date((r.updated_at as string) ?? (r.recorded_at as string)).getTime()) / 1000);
      const moving = !!r.is_moving;

      let status: FieldStatus;
      if (sosSet.has(r.employee_id as string)) status = 'sos';
      else if (ageSec > 180) status = 'offline';
      else if (site && site.lng != null && site.lat != null) {
        const radius = siteRadius.get(site.id ?? '') ?? 100;
        const inside = distM(lat, lng, site.lat, site.lng) <= radius;
        status = inside ? 'on_post' : moving ? 'moving' : 'idle';
      } else status = moving ? 'moving' : 'idle';

      return {
        id: r.employee_id as string,
        name,
        initials: initialsOf(name),
        role: ROLE_LABEL[prof?.employment_type ?? 'guard'] ?? 'Field',
        empType: prof?.employment_type ?? 'guard',
        code: prof?.employee_code ?? null,
        siteId: site?.id ?? null,
        siteName: site?.name ?? null,
        lng,
        lat,
        isMoving: moving,
        speedKmh: r.speed_mps != null ? Math.round((r.speed_mps as number) * 3.6) : null,
        ageSec,
        status,
      };
    });
    list.sort((a, b) => a.ageSec - b.ageSec);
    setMembers(list);
  }, [supabase, sites]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);
  useEffect(() => {
    loadRoster();
    const ch = supabase
      .channel('cc_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'current_location' }, () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => loadRoster(), 800);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, loadRoster]);

  // Building search (server-side, by name).
  useEffect(() => {
    const q = bldQuery.trim();
    if (!q) { setBldResults([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('sites').select('id, name, lng, lat, geofences(radius_m)').ilike('name', `%${q}%`).not('lng', 'is', null).limit(8);
      if (!active) return;
      setBldResults(((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string, name: r.name as string, lng: r.lng as number, lat: r.lat as number,
        radius: ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
      })));
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [bldQuery, supabase]);

  function chooseBuilding(b: { id: string; name: string; lng: number; lat: number; radius: number | null }) {
    setPickedBuilding(b);
    setFlyTo([b.lng, b.lat]);
    setBldQuery('');
    setBldResults([]);
  }

  // Derived: filtered roster.
  const filtered = members.filter((m) => {
    if (filter === 'ON POST' && m.status !== 'on_post') return false;
    if (filter === 'MOVING' && m.status !== 'moving') return false;
    if (filter === 'STALE' && m.status !== 'offline' && m.status !== 'idle') return false;
    if (q) {
      const s = `${m.name} ${m.code ?? ''} ${m.siteName ?? ''}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Field markers on the map, gated by the guard/patrol layer toggles.
  const markers: FieldMarker[] = filtered
    .filter((m) => (m.empType === 'patrol' ? showPatrols : showGuards))
    .map((m) => ({
      id: m.id,
      lng: m.lng,
      lat: m.lat,
      initials: m.initials,
      status: m.status,
      label: selected === m.id ? `${m.name} · ${STATUS_TEXT[m.status].toLowerCase()}` : undefined,
    }));

  // Coverage from on-post members (scales to 2k sites — no per-site iteration).
  const coveredSiteIds = new Set(members.filter((m) => m.status === 'on_post' && m.siteId).map((m) => m.siteId as string));
  const covered = coveredSiteIds.size;
  const onShift = members.filter((m) => m.status !== 'offline').length;

  // Rings: only manned sites + the searched/selected building (never all 2k).
  const rings: FieldRing[] = [
    ...members.filter((m) => m.status === 'on_post' && m.siteId).map((m) => ({
      id: `on-${m.siteId}`, lng: m.lng, lat: m.lat, radiusM: 100, tone: 'accent' as const,
    })),
    ...(pickedBuilding ? [{ id: `sel-${pickedBuilding.id}`, lng: pickedBuilding.lng, lat: pickedBuilding.lat, radiusM: pickedBuilding.radius ?? 100, tone: 'alarm' as const }] : []),
  ];

  // Buildings layer (clustered) — only when the Buildings filter is on.
  const buildings = showBuildings ? sites.map((s) => ({ id: s.id, lng: s.lng, lat: s.lat })) : [];

  const mapCenter = members[0] ? ([members[0].lng, members[0].lat] as [number, number]) : MAP_DEFAULT.center;

  return (
    <div className="si" style={{ height: '100vh', display: 'flex', flexDirection: 'column', color: 'var(--color-text)' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          height: 52,
          padding: '0 20px',
          borderBottom: '1px solid var(--color-divider)',
          background: 'var(--color-neutral-100)',
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, border: '1.5px solid var(--color-accent)', display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 8, height: 8, background: 'var(--color-accent)' }} />
          </div>
          <span style={{ font: '600 19px/1 var(--font-heading)', letterSpacing: '.07em' }}>SENTINEL</span>
          <span style={{ font: '400 10px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'color-mix(in srgb,var(--color-text) 50%,transparent)' }}>
            Control Center
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 20, font: '500 11px/1 var(--font-body)', letterSpacing: '.11em', textTransform: 'uppercase' }}>
          <Link href="/dashboard" style={{ color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', textDecoration: 'none' }}>Dashboard</Link>
          <span style={{ color: 'var(--color-accent)', borderBottom: '2px solid var(--color-accent)', paddingBottom: 4 }}>Live Map</span>
          <Link href="/sites" style={{ color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', textDecoration: 'none' }}>Sites</Link>
          <Link href="/shifts" style={{ color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', textDecoration: 'none' }}>Shifts</Link>
          <Link href="/patrols" style={{ color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', textDecoration: 'none' }}>Patrols</Link>
          <Link href="/tasks" style={{ color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', textDecoration: 'none' }}>Tasks</Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px', border: '1px solid var(--color-divider)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
            <span style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.13em' }}>LIVE · {clock}</span>
          </div>
          <span style={{ font: '400 12px/1 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 60%,transparent)' }}>
            {user.name} · {user.role}
          </span>
          <form action={signOut}>
            <button className="btn btn-secondary" style={{ height: 30, fontSize: 11, letterSpacing: '.08em' }}>SIGN OUT</button>
          </form>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Roster rail */}
        <aside style={{ width: 336, flex: 'none', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', minHeight: 0 }}>
          <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h5 style={{ margin: 0, font: '600 15px/1 var(--font-heading)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Field roster</h5>
              <span style={{ font: '600 11px/1 var(--font-heading)', letterSpacing: '.09em', color: 'color-mix(in srgb,var(--color-text) 55%,transparent)' }}>
                {onShift} ON SHIFT / {members.length} ASSIGNED
              </span>
            </div>
            <input className="input" placeholder="Search name, code, site…" value={q} onChange={(e) => setQ(e.target.value)} style={{ height: 32, fontSize: 13 }} />
            <div className="seg" style={{ width: '100%' }}>
              {FILTERS.map((f) => (
                <button key={f} className={`seg-opt${filter === f ? ' active' : ''}`} style={{ flex: 1, fontSize: 11, letterSpacing: '.06em' }} onClick={() => setFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {sos && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'color-mix(in srgb,var(--color-alarm) 12%,transparent)', borderBottom: '1px solid var(--color-alarm)' }}>
              <div style={{ width: 16, height: 16, background: 'var(--color-alarm)', display: 'grid', placeItems: 'center', color: '#f2f2f3', font: '700 10px/1 var(--font-heading)' }}>!</div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 12px/1.2 var(--font-heading)', letterSpacing: '.07em', textTransform: 'uppercase', color: '#7d2a20' }}>SOS · {sos.name}</div>
                <div style={{ font: '11px/1.3 var(--font-body)', color: '#7d2a20' }}>Panic raised {sos.ago}{sos.site ? ` · ${sos.site}` : ''}</div>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.map((m) => {
              const barColor =
                m.status === 'sos' ? 'var(--color-alarm)' :
                m.status === 'on_post' ? 'var(--color-accent)' :
                m.status === 'moving' ? 'var(--color-accent-400)' :
                'var(--color-neutral-400)';
              const filledAvatar = m.status === 'on_post' || m.status === 'sos';
              const statusLabel =
                m.status === 'moving' && m.speedKmh != null ? `MOVING · ${m.speedKmh} km/h` :
                m.status === 'idle' ? `IDLE ${Math.max(1, Math.round(m.ageSec / 60))}m` :
                STATUS_TEXT[m.status];
              return (
                <div
                  key={m.id}
                  className="row"
                  onClick={() => { setSelected(m.id); }}
                  style={{
                    display: 'grid', gridTemplateColumns: '3px 30px 1fr auto', gap: 10, alignItems: 'center',
                    padding: '9px 12px', borderBottom: '1px solid var(--color-divider)',
                    background: selected === m.id ? 'color-mix(in srgb,var(--color-accent) 10%,transparent)' : 'transparent',
                    opacity: m.status === 'offline' ? 0.6 : 1,
                  }}
                >
                  <div style={{ height: 26, background: barColor }} />
                  <div style={{
                    height: 28, display: 'grid', placeItems: 'center', font: '600 11px/1 var(--font-heading)',
                    background: filledAvatar ? barColor : 'transparent',
                    color: filledAvatar ? 'var(--color-bg)' : 'var(--color-accent-800)',
                    border: filledAvatar ? 'none' : `1.5px solid ${m.status === 'moving' ? 'var(--color-accent)' : 'var(--color-neutral-500)'}`,
                  }}>{m.initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: '600 14px/1.2 var(--font-heading)', letterSpacing: '.02em' }}>{m.name}</div>
                    <div style={{ font: '11px/1.3 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 58%,transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.role}{m.code ? ` · ${m.code}` : ''}{m.siteName ? ` · ${m.siteName}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: '600 10px/1.2 var(--font-heading)', letterSpacing: '.1em', color: STATUS_COLOR[m.status] }}>{statusLabel}</div>
                    <div style={{ font: '10px/1.3 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 50%,transparent)' }}>{relTime(m.ageSec)}</div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 16, font: '12px/1.5 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 55%,transparent)' }}>
                No field members match. When guards go on shift and share location, they appear here.
              </div>
            )}
          </div>

          <div style={{ flex: 'none', padding: '10px 14px', borderTop: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: '11px/1.3 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', flex: 1 }}>
              Ping cadence 15s · realtime on <code style={{ fontSize: 10 }}>current_location</code>
            </span>
          </div>
        </aside>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <DuotoneMap
            markers={markers}
            rings={rings}
            buildings={buildings}
            center={mapCenter}
            selectedId={selected}
            onMarkerClick={(id) => setSelected(id)}
            onBuildingClick={async (id) => {
              const { data } = await supabase.from('sites').select('id, name, lng, lat, geofences(radius_m)').eq('id', id).maybeSingle();
              const r = data as unknown as Record<string, unknown> | null;
              if (r) chooseBuilding({ id: r.id as string, name: r.name as string, lng: r.lng as number, lat: r.lat as number, radius: ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null });
            }}
            flyTo={flyTo}
            fitKey={fitKey}
            className="cc-map-fill"
          />

          {/* Search + layer filters (top-left) */}
          <div style={{ position: 'absolute', left: 18, top: 18, width: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Search a building by name…" value={bldQuery} onChange={(e) => setBldQuery(e.target.value)} style={{ height: 34, fontSize: 13, background: 'color-mix(in srgb,var(--color-bg) 94%,transparent)' }} />
              {bldResults.length > 0 && (
                <div style={{ position: 'absolute', top: 38, left: 0, right: 0, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-md)', zIndex: 5, maxHeight: 260, overflowY: 'auto' }}>
                  {bldResults.map((b) => (
                    <button key={b.id} className="row" onClick={() => chooseBuilding(b)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', font: '13px/1.3 var(--font-body)', borderBottom: '1px solid var(--color-divider)', background: 'transparent' }}>{b.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['Buildings', showBuildings, setShowBuildings], ['Guards', showGuards, setShowGuards], ['Patrols', showPatrols, setShowPatrols]] as const).map(([label, on, set]) => (
                <button key={label} className={`seg-opt${on ? ' active' : ''}`} style={{ border: '1px solid var(--color-divider)', fontSize: 10.5, letterSpacing: '.05em', background: on ? 'var(--color-accent)' : 'color-mix(in srgb,var(--color-bg) 92%,transparent)' }} onClick={() => set((v: boolean) => !v)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Coverage blueprint card */}
          <div className="blueprint" style={{ position: 'absolute', right: 18, top: 18, width: 212, padding: 12, background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)', boxShadow: 'var(--shadow-md)' }}>
            <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
            <div style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', marginBottom: 8 }}>Coverage</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 8 }}>
              <div><div style={{ font: '600 30px/1 var(--font-heading)', color: 'var(--color-accent)' }}>{covered}</div><div style={{ font: '10px/1.2 var(--font-body)', letterSpacing: '.08em', textTransform: 'uppercase' }}>manned</div></div>
              <div><div style={{ font: '600 30px/1 var(--font-heading)' }}>{onShift}</div><div style={{ font: '10px/1.2 var(--font-body)', letterSpacing: '.08em', textTransform: 'uppercase' }}>on shift</div></div>
            </div>
            <div style={{ height: 1, background: 'var(--color-divider)', margin: '8px 0' }} />
            <div style={{ font: '11px/1.6 var(--font-body)', color: 'color-mix(in srgb,var(--color-text) 65%,transparent)' }}>
              {sites.length} buildings{sos ? <><br />1 SOS active</> : null}
            </div>
          </div>

          {/* Legend */}
          <div style={{ position: 'absolute', right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)', border: '1px solid var(--color-divider)' }}>
            {[
              ['On post (in geofence)', <div key="a" style={{ width: 12, height: 12, background: 'var(--color-accent)' }} />],
              ['Moving', <div key="b" style={{ width: 12, height: 12, border: '1.5px solid var(--color-accent)' }} />],
              ['Idle / stationary', <div key="c" style={{ width: 12, height: 12, border: '1.5px solid var(--color-neutral-500)' }} />],
              ['SOS / breach', <div key="d" style={{ width: 12, height: 12, background: 'var(--color-alarm)' }} />],
            ].map(([label, swatch], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, font: '11px/1 var(--font-body)' }}>{swatch}{label as string}</div>
            ))}
          </div>

          {/* Controls */}
          <div style={{ position: 'absolute', left: 18, bottom: 18, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ height: 32, fontSize: 11, letterSpacing: '.08em', background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)' }} onClick={() => setFitKey((k) => k + 1)}>FIT ALL</button>
          </div>
        </div>
      </div>
    </div>
  );
}
