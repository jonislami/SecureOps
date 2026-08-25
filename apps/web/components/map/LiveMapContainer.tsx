'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LiveMap, type MapMarker, type MapCircle } from './LiveMap';
import { GuardDetailsPanel, SiteDetailsPanel } from './MapDetailPanel';

interface SiteRow {
  id: string;
  name: string;
  lng: number;
  lat: number;
  radius_m: number | null;
}

interface LivePos {
  employee_id: string;
  lng: number;
  lat: number;
  name: string;
  is_moving: boolean | null;
  recorded_at: string | null;
}

/**
 * Loads current field positions and keeps them live via Supabase Realtime on
 * `current_location`. Renders one marker per employee; markers move as new
 * positions arrive (green = moving, blue = stationary).
 */
export function LiveMapContainer() {
  const supabase = useMemo(() => createClient(), []);
  const [positions, setPositions] = useState<Record<string, LivePos>>({});
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selected, setSelected] = useState<{ type: 'guard' | 'site'; id: string } | null>(null);
  const namesRef = useRef<Record<string, string>>({});

  // Load sites (with geofence radius) once — shown as reference points + rings.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('sites')
        .select('id, name, lng, lat, geofences(radius_m)')
        .not('lng', 'is', null);
      if (!active || !data) return;
      setSites(
        (data as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          lng: r.lng as number,
          lat: r.lat as number,
          radius_m:
            ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
        }))
      );
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;

    // Initial snapshot.
    (async () => {
      const { data } = await supabase
        .from('current_location')
        .select('employee_id, lng, lat, is_moving, recorded_at, profiles(full_name)')
        .not('lng', 'is', null);
      if (!active || !data) return;

      const next: Record<string, LivePos> = {};
      for (const row of data as unknown as Array<Record<string, unknown>>) {
        const emp = row.employee_id as string;
        const prof = row.profiles as { full_name?: string } | null;
        const name = prof?.full_name ?? emp.slice(0, 8);
        namesRef.current[emp] = name;
        next[emp] = {
          employee_id: emp,
          lng: row.lng as number,
          lat: row.lat as number,
          name,
          is_moving: (row.is_moving as boolean | null) ?? null,
          recorded_at: (row.recorded_at as string | null) ?? null,
        };
      }
      setPositions(next);
    })();

    // Live updates.
    const channel = supabase
      .channel('current_location_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'current_location' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row || row.lng == null || row.lat == null) return;
          const emp = row.employee_id as string;
          setPositions((prev) => ({
            ...prev,
            [emp]: {
              employee_id: emp,
              lng: row.lng as number,
              lat: row.lat as number,
              name: namesRef.current[emp] ?? emp.slice(0, 8),
              is_moving: (row.is_moving as boolean | null) ?? null,
              recorded_at: (row.recorded_at as string | null) ?? null,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Guards are dots (green = moving, blue = stationary).
  const personMarkers: MapMarker[] = Object.values(positions).map((p) => ({
    id: p.employee_id,
    lng: p.lng,
    lat: p.lat,
    label: `${p.name}${p.is_moving ? ' · moving' : ''}`,
    color: p.is_moving ? '#22C55E' : '#3B82F6',
  }));

  // A site is "covered" if any guard's live position is inside its geofence.
  const people = Object.values(positions);
  let covered = 0;
  const circles: MapCircle[] = sites
    .filter((s) => s.radius_m)
    .map((s) => {
      const isCovered = people.some(
        (p) => distanceM(p.lat, p.lng, s.lat, s.lng) <= (s.radius_m as number)
      );
      if (isCovered) covered += 1;
      // Covered = green ring (a guard is on post). Uncovered = red ring.
      return {
        id: s.id,
        lng: s.lng,
        lat: s.lat,
        radiusM: s.radius_m as number,
        color: isCovered ? '#22C55E' : '#EF4444',
      };
    });
  const uncovered = circles.length - covered;

  return (
    <>
      <LiveMap
        markers={personMarkers}
        circles={circles}
        onMarkerClick={(id) => setSelected({ type: 'guard', id })}
        onCircleClick={(id) => setSelected({ type: 'site', id })}
        className="absolute inset-0 h-full w-full"
      />

      {/* Coverage counter (top-right, out of the way of the detail panel). */}
      <div className="pointer-events-none absolute right-3 top-3 space-y-0.5 rounded-md border bg-card/90 px-3 py-2 text-sm shadow">
        <div>
          <span className="font-medium text-emerald-600">{covered}</span> covered ·{' '}
          <span className="font-medium text-red-600">{uncovered}</span> uncovered
        </div>
        <div className="text-xs text-muted-foreground">
          {personMarkers.length} guard{personMarkers.length === 1 ? '' : 's'} on shift
        </div>
      </div>

      {/* Click-a-guard / click-a-site details (top-left). */}
      {selected?.type === 'guard' && (
        <GuardDetailsPanel employeeId={selected.id} onClose={() => setSelected(null)} />
      )}
      {selected?.type === 'site' && (
        <SiteDetailsPanel siteId={selected.id} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

/** Great-circle distance in metres between two lat/lng points (haversine). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
