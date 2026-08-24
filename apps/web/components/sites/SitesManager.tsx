'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAP_DEFAULT } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveMap } from '@/components/map/LiveMap';

interface ClientRow {
  id: string;
  name: string;
}
interface SiteRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  lng: number | null;
  lat: number | null;
  client: string;
  radius_m: number | null;
}

export function SitesManager() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-site form state.
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(100);
  const [picked, setPicked] = useState<{ lng: number; lat: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-client inline.
  const [newClient, setNewClient] = useState('');

  const load = useCallback(async () => {
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase
        .from('sites')
        .select('id, name, code, address, lng, lat, clients(name), geofences(radius_m)')
        .order('name'),
    ]);
    setClients((c ?? []) as ClientRow[]);
    setSites(
      ((s ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        code: (row.code as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        lng: (row.lng as number | null) ?? null,
        lat: (row.lat as number | null) ?? null,
        client: ((row.clients as { name?: string } | null)?.name) ?? '—',
        radius_m:
          ((row.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addClient() {
    if (!newClient.trim()) return;
    const { error: e } = await supabase
      .from('clients')
      .insert({ name: newClient.trim() } as never);
    if (e) return setError(e.message);
    setNewClient('');
    await load();
  }

  async function saveSite() {
    setError(null);
    if (!clientId) return setError('Choose a client');
    if (!name.trim()) return setError('Site name is required');
    if (!picked) return setError('Click the map to set the site location');

    setSaving(true);
    // admin_create_site isn't in the generated Function types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).rpc('admin_create_site', {
      p_client: clientId,
      p_name: name.trim(),
      p_code: code.trim(),
      p_address: address.trim(),
      p_lng: picked.lng,
      p_lat: picked.lat,
      p_radius_m: radius,
    });
    setSaving(false);
    if (e) return setError(e.message);

    setName('');
    setCode('');
    setAddress('');
    setPicked(null);
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Add site */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Client</Label>
            <div className="flex gap-2">
              <select
                className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="…or add a new client"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addClient}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Site name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ferizaj HQ" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HQ-1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" />
          </div>
          <div className="space-y-2">
            <Label>Geofence radius (m): {radius}</Label>
            <input
              type="range"
              min={30}
              max={500}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Location — click the map to place the site</Label>
            <LiveMap
              center={picked ? [picked.lng, picked.lat] : MAP_DEFAULT.center}
              onClick={(lng, lat) => setPicked({ lng, lat })}
              markers={picked ? [{ id: 'picked', lng: picked.lng, lat: picked.lat, color: '#22C55E' }] : []}
              circles={
                picked
                  ? [{ id: 'r', lng: picked.lng, lat: picked.lat, radiusM: radius, color: '#22C55E' }]
                  : []
              }
              className="h-72 w-full overflow-hidden rounded-md border"
            />
            {picked && (
              <p className="text-xs text-muted-foreground">
                Selected: {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={saveSite} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Create site'}
          </Button>
        </CardContent>
      </Card>

      {/* Site list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sites ({sites.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sites yet. Add your first protected location on the left.
            </p>
          ) : (
            <ul className="divide-y">
              {sites.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {s.name}
                      {s.code ? <span className="text-muted-foreground"> · {s.code}</span> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">{s.client}</div>
                    {s.address && <div className="text-sm text-muted-foreground">{s.address}</div>}
                    <div className="text-xs text-muted-foreground">
                      {s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}
                      {s.radius_m ? ` · ${Math.round(s.radius_m)}m geofence` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
