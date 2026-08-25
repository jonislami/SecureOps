'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Route as RouteIcon, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAP_DEFAULT } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveMap, type MapMarker, type MapCircle } from '@/components/map/LiveMap';

interface RouteRow {
  id: string;
  name: string;
  count: number;
}
interface Checkpoint {
  id: string;
  name: string;
  seq: number;
  lng: number;
  lat: number;
  radius_m: number | null;
}

export function RoutesManager() {
  const supabase = useMemo(() => createClient(), []);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [newRoute, setNewRoute] = useState('');
  const [cpName, setCpName] = useState('');
  const [cpRadius, setCpRadius] = useState(25);
  const [error, setError] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    const { data } = await supabase
      .from('patrol_routes')
      .select('id, name, checkpoints(count)')
      .order('name');
    setRoutes(
      ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        count: ((r.checkpoints as Array<{ count?: number }> | null)?.[0]?.count as number) ?? 0,
      }))
    );
  }, [supabase]);

  const loadCheckpoints = useCallback(
    async (routeId: string) => {
      const { data } = await supabase
        .from('checkpoints')
        .select('id, name, seq, lng, lat, radius_m')
        .eq('route_id', routeId)
        .order('seq');
      setCheckpoints((data ?? []) as Checkpoint[]);
    },
    [supabase]
  );

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);
  useEffect(() => {
    if (selected) loadCheckpoints(selected);
    else setCheckpoints([]);
  }, [selected, loadCheckpoints]);

  async function createRoute() {
    setError(null);
    if (!newRoute.trim()) return;
    const { data, error: e } = await supabase
      .from('patrol_routes')
      .insert({ name: newRoute.trim() } as never)
      .select('id')
      .single();
    if (e) return setError(e.message);
    setNewRoute('');
    await loadRoutes();
    if (data) setSelected((data as { id: string }).id);
  }

  async function addCheckpoint(lng: number, lat: number) {
    if (!selected) return;
    setError(null);
    const seq = (checkpoints.at(-1)?.seq ?? 0) + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).rpc('admin_add_checkpoint', {
      p_route: selected,
      p_name: cpName.trim() || `Checkpoint ${seq}`,
      p_seq: seq,
      p_lng: lng,
      p_lat: lat,
      p_radius_m: cpRadius,
      p_method: 'geofence',
      p_tag: null,
    });
    if (e) return setError(e.message);
    setCpName('');
    await Promise.all([loadCheckpoints(selected), loadRoutes()]);
  }

  const markers: MapMarker[] = checkpoints.map((c) => ({
    id: c.id,
    lng: c.lng,
    lat: c.lat,
    label: `${c.seq}. ${c.name}`,
    color: '#8B5CF6',
  }));
  const circles: MapCircle[] = checkpoints
    .filter((c) => c.radius_m)
    .map((c) => ({ id: c.id, lng: c.lng, lat: c.lat, radiusM: c.radius_m as number, color: '#8B5CF6' }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Routes list + create */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="New route name (e.g. Night Round)"
              value={newRoute}
              onChange={(e) => setNewRoute(e.target.value)}
            />
            <Button type="button" onClick={createRoute}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No routes yet.</p>
          ) : (
            <ul className="divide-y">
              {routes.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.id)}
                    className={`flex w-full items-center gap-3 py-3 text-left ${
                      selected === r.id ? 'font-semibold text-primary' : ''
                    }`}
                  >
                    <RouteIcon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.count} checkpoints</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Checkpoint editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selected ? 'Checkpoints — click the map to add' : 'Select a route'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Create or select a route on the left, then click the map to drop ordered checkpoints.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Next checkpoint name</Label>
                  <Input
                    placeholder="(auto)"
                    value={cpName}
                    onChange={(e) => setCpName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Radius: {cpRadius}m</Label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={cpRadius}
                    onChange={(e) => setCpRadius(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <LiveMap
                center={checkpoints[0] ? [checkpoints[0].lng, checkpoints[0].lat] : MAP_DEFAULT.center}
                markers={markers}
                circles={circles}
                onClick={addCheckpoint}
                className="h-72 w-full overflow-hidden rounded-md border"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}

              <ol className="space-y-1">
                {checkpoints.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{c.seq}.</span> {c.name}
                    <span className="text-xs text-muted-foreground">
                      · {c.lat.toFixed(4)}, {c.lng.toFixed(4)} · {Math.round(c.radius_m ?? 0)}m
                    </span>
                  </li>
                ))}
                {checkpoints.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    No checkpoints yet — click the map to add the first.
                  </li>
                )}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
