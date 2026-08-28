'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { signOut } from '@/app/auth/actions';
import { sendResponsePush } from '@/app/respond/push-actions';
import { DuotoneMap, type FieldMarker, type FieldRing } from '@/components/map/DuotoneMap';

interface Building { id: string; name: string; type: string; address: string | null; lng: number; lat: number; radius: number | null }
interface Patrol { id: string; name: string; initials: string; lng: number; lat: number; ageSec: number; distanceM: number }

const muted = (p: number) => `color-mix(in srgb,var(--color-text) ${p}%,transparent)`;
const initialsOf = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase(); };
function distM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const rel = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);

export function RespondConsole({ email }: { email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Building[]>([]);
  const [building, setBuilding] = useState<Building | null>(null);
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  // Search buildings by name.
  useEffect(() => {
    const s = q.trim();
    if (!s) { setResults([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('sites').select('id, name, site_type, address, lng, lat, geofences(radius_m)').ilike('name', `%${s}%`).not('lng', 'is', null).limit(10);
      if (!active) return;
      setResults(((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string, name: r.name as string, type: (r.site_type as string) ?? 'other',
        address: (r.address as string | null) ?? null, lng: r.lng as number, lat: r.lat as number,
        radius: ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
      })));
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q, supabase]);

  // Load & rank patrols by distance to the selected building.
  const loadPatrols = useCallback(async (b: Building) => {
    const { data } = await supabase
      .from('current_location')
      .select('employee_id, lng, lat, updated_at, profiles!inner(full_name, employment_type)')
      .eq('profiles.employment_type', 'patrol')
      .not('lng', 'is', null);
    const list: Patrol[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const name = ((r.profiles as { full_name?: string } | null)?.full_name) ?? (r.employee_id as string).slice(0, 8);
      const lng = r.lng as number, lat = r.lat as number;
      return {
        id: r.employee_id as string, name, initials: initialsOf(name), lng, lat,
        ageSec: Math.round((Date.now() - new Date(r.updated_at as string).getTime()) / 1000),
        distanceM: distM(b.lat, b.lng, lat, lng),
      };
    });
    list.sort((a, b2) => a.distanceM - b2.distanceM);
    setPatrols(list);
  }, [supabase]);

  function choose(b: Building) {
    setBuilding(b); setResults([]); setQ(b.name); setMsg(null); setError(null);
    loadPatrols(b);
  }

  async function dispatch(p: Patrol) {
    if (!building) return;
    setDispatching(p.id); setError(null); setMsg(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (supabase.rpc as any)('dispatch_response', { p_site: building.id, p_patrol: p.id, p_note: `Alarm at ${building.name}.` });
    setDispatching(null);
    if (e) return setError(e.message);
    if (data) {
      sendResponsePush(p.id, building.name); // best-effort push (dev build)
      setMsg(`Dispatched ${p.name} (${fmtDist(p.distanceM)}) to ${building.name}. Task sent to their phone; alarm logged.`);
    }
  }

  const markers: FieldMarker[] = patrols.map((p, i) => ({ id: p.id, lng: p.lng, lat: p.lat, initials: p.initials, status: 'moving', label: i === 0 ? `${p.name} · nearest` : undefined }));
  const rings: FieldRing[] = building ? [{ id: building.id, lng: building.lng, lat: building.lat, radiusM: building.radius ?? 100, tone: 'alarm' }] : [];
  const bldMarker: FieldMarker[] = building ? [{ id: 'bld', lng: building.lng, lat: building.lat, initials: '⚑', status: 'sos', label: building.name }] : [];

  return (
    <div className="si" style={{ height: '100vh', display: 'flex', flexDirection: 'column', color: 'var(--color-text)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 22, height: 52, padding: '0 20px', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, border: '1.5px solid var(--color-accent)', display: 'grid', placeItems: 'center' }}><div style={{ width: 8, height: 8, background: 'var(--color-accent)' }} /></div>
          <span style={{ font: '600 19px/1 var(--font-heading)', letterSpacing: '.07em' }}>SENTINEL</span>
          <span style={{ font: '400 10px/1 var(--font-body)', letterSpacing: '.16em', textTransform: 'uppercase', color: muted(50) }}>Alarm response</span>
        </div>
        <nav style={{ display: 'flex', gap: 20, font: '500 11px/1 var(--font-body)', letterSpacing: '.11em', textTransform: 'uppercase' }}>
          <Link href="/dashboard" style={{ color: muted(55), textDecoration: 'none' }}>Dashboard</Link>
          <Link href="/map" style={{ color: muted(55), textDecoration: 'none' }}>Live Map</Link>
          <span style={{ color: 'var(--color-accent)', borderBottom: '2px solid var(--color-accent)', paddingBottom: 4 }}>Respond</span>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 9px', border: '1px solid var(--color-divider)' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-alarm)' }} /><span style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.13em' }}>LIVE · {clock}</span></div>
          <span style={{ font: '400 12px/1 var(--font-body)', color: muted(60) }}>{email}</span>
          <form action={signOut}><button className="btn btn-secondary" style={{ height: 30, fontSize: 11, letterSpacing: '.08em' }}>SIGN OUT</button></form>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: search + building + patrols */}
        <aside style={{ width: 400, flex: 'none', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', minHeight: 0 }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--color-divider)', position: 'relative' }}>
            <h1 style={{ margin: '0 0 12px', font: '600 24px/1 var(--font-heading)', letterSpacing: '.02em' }}>Respond to alarm</h1>
            <input className="input" placeholder="Search the building by name…" value={q} onChange={(e) => { setQ(e.target.value); setBuilding(null); }} style={{ height: 38 }} autoFocus />
            {results.length > 0 && (
              <div style={{ position: 'absolute', left: 16, right: 16, top: 78, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-md)', zIndex: 5, maxHeight: 300, overflowY: 'auto' }}>
                {results.map((b) => (
                  <button key={b.id} onClick={() => choose(b)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', borderBottom: '1px solid var(--color-divider)', background: 'transparent', cursor: 'pointer' }}>
                    <div style={{ font: '600 14px/1.2 var(--font-heading)' }}>{b.name}</div>
                    <div style={{ font: '11px/1.3 var(--font-body)', color: muted(58) }}><span style={{ textTransform: 'capitalize' }}>{b.type}</span>{b.address ? ` · ${b.address}` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {building ? (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--color-divider)', background: 'color-mix(in srgb,var(--color-alarm) 8%,transparent)' }}>
                <div style={{ font: '600 10px/1 var(--font-heading)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-alarm)', marginBottom: 4 }}>Target building</div>
                <div style={{ font: '600 20px/1.1 var(--font-heading)' }}>{building.name}</div>
                <div style={{ font: '12px/1.4 var(--font-body)', color: muted(62) }}><span style={{ textTransform: 'capitalize' }}>{building.type}</span>{building.address ? ` · ${building.address}` : ''}</div>
                <div style={{ font: '11px/1.4 var(--font-body)', color: muted(50) }}>{building.lat.toFixed(5)}, {building.lng.toFixed(5)}</div>
              </div>

              <div style={{ padding: '12px 16px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <h5 style={{ margin: 0, font: '600 13px/1 var(--font-heading)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Nearest patrols</h5>
                <span style={{ font: '11px/1 var(--font-body)', color: muted(55) }}>{patrols.length} on shift</span>
              </div>

              {msg && <div style={{ margin: '8px 16px', padding: '10px 12px', background: 'color-mix(in srgb,var(--color-accent) 12%,transparent)', font: '12px/1.5 var(--font-body)' }}>{msg}</div>}
              {error && <div style={{ margin: '8px 16px', color: 'var(--color-alarm)', font: '12px/1.5 var(--font-body)' }}>{error}</div>}

              {patrols.length === 0 ? (
                <div style={{ padding: 16, font: '12px/1.5 var(--font-body)', color: muted(55) }}>No patrols are on shift and sharing location right now.</div>
              ) : patrols.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: '1px solid var(--color-divider)', background: i === 0 ? 'color-mix(in srgb,var(--color-accent) 8%,transparent)' : 'transparent' }}>
                  <div style={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', background: i === 0 ? 'var(--color-accent)' : 'transparent', color: i === 0 ? 'var(--color-bg)' : 'var(--color-accent-800)', border: i === 0 ? 'none' : '1.5px solid var(--color-accent)', font: '600 11px/1 var(--font-heading)' }}>{p.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 14px/1.2 var(--font-heading)' }}>{p.name}{i === 0 && <span style={{ marginLeft: 6, font: '600 9px/1 var(--font-heading)', letterSpacing: '.1em', color: 'var(--color-accent-700)' }}>NEAREST</span>}</div>
                    <div style={{ font: '11px/1.3 var(--font-body)', color: muted(55) }}>{fmtDist(p.distanceM)} away · ping {rel(p.ageSec)} ago</div>
                  </div>
                  <button className="btn btn-primary" style={{ height: 30, fontSize: 10, letterSpacing: '.08em' }} onClick={() => dispatch(p)} disabled={dispatching === p.id}>
                    {dispatching === p.id ? '…' : 'DISPATCH'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
              <div style={{ font: '13px/1.6 var(--font-body)', color: muted(55), maxWidth: 260 }}>
                Search the building the alarm came from, then dispatch the nearest patrol to it.
              </div>
            </div>
          )}
        </aside>

        {/* Right: map */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <DuotoneMap
            markers={[...bldMarker, ...markers]}
            rings={rings}
            center={building ? [building.lng, building.lat] : undefined}
            flyTo={building ? [building.lng, building.lat] : undefined}
            className="cc-map-fill"
          />
        </div>
      </div>
    </div>
  );
}
