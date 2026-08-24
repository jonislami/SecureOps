'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LiveMap, type MapMarker } from './LiveMap';

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
  const namesRef = useRef<Record<string, string>>({});

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

  const markers: MapMarker[] = Object.values(positions).map((p) => ({
    id: p.employee_id,
    lng: p.lng,
    lat: p.lat,
    label: `${p.name}${p.is_moving ? ' · moving' : ''}`,
    color: p.is_moving ? '#22C55E' : '#3B82F6',
  }));

  return (
    <>
      <LiveMap markers={markers} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-card/90 px-3 py-2 text-sm shadow">
        <span className="font-medium">{markers.length}</span> on map
        {markers.length === 0 && (
          <div className="text-xs text-muted-foreground">Waiting for field positions…</div>
        )}
      </div>
    </>
  );
}
