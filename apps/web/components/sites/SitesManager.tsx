'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAP_DEFAULT } from '@/lib/env';
import { parseCoordsFromText, isShortMapLink, looksLikeUrl } from '@/lib/parse-location';
import { resolveMapLink } from '@/app/sites/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveMap } from '@/components/map/LiveMap';

interface ClientRow { id: string; name: string }
interface SiteRow {
  id: string; name: string; code: string | null; address: string | null;
  lng: number | null; lat: number | null; client: string; radius_m: number | null;
  type: string; source_url: string | null;
}

const SITE_TYPES = ['home', 'office', 'warehouse', 'retail', 'industrial', 'bank', 'other'] as const;

export function SitesManager() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // form
  const [editId, setEditId] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<string>('other');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(100);
  const [picked, setPicked] = useState<{ lng: number; lat: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newClient, setNewClient] = useState('');

  // smart location input
  const [locInput, setLocInput] = useState('');
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = supabase
      .from('sites')
      .select('id, name, code, address, lng, lat, site_type, source_url, clients(name), geofences(radius_m)')
      .order('name')
      .limit(300);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      search.trim() ? q.ilike('name', `%${search.trim()}%`) : q,
    ]);
    setClients((c ?? []) as ClientRow[]);
    setSites(((s ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string, name: r.name as string,
      code: (r.code as string | null) ?? null, address: (r.address as string | null) ?? null,
      lng: (r.lng as number | null) ?? null, lat: (r.lat as number | null) ?? null,
      client: ((r.clients as { name?: string } | null)?.name) ?? '—',
      radius_m: ((r.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
      type: (r.site_type as string) ?? 'other', source_url: (r.source_url as string | null) ?? null,
    })));
    setLoading(false);
  }, [supabase, search]);

  useEffect(() => { load(); }, [load]);

  async function addClient() {
    if (!newClient.trim()) return;
    const { error: e } = await supabase.from('clients').insert({ name: newClient.trim() } as never);
    if (e) return setError(e.message);
    setNewClient('');
    await load();
  }

  async function locate() {
    setLocMsg(null); setError(null);
    const text = locInput.trim();
    if (!text) return;
    const direct = parseCoordsFromText(text);
    if (direct) { setPicked({ lng: direct.lng, lat: direct.lat }); setLocMsg(`Pinned: ${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`); return; }
    if (looksLikeUrl(text) && isShortMapLink(text)) {
      setLocating(true);
      const res = await resolveMapLink(text);
      setLocating(false);
      if (res.ok) { setPicked({ lng: res.coords.lng, lat: res.coords.lat }); setLocMsg(`Pinned from link: ${res.coords.lat.toFixed(5)}, ${res.coords.lng.toFixed(5)}`); }
      else setLocMsg(res.error);
      return;
    }
    setLocMsg('Could not read a location. Paste coordinates like "42.37, 21.15" or a Google Maps link.');
  }

  function resetForm() {
    setEditId(null); setClientId(''); setName(''); setCode(''); setType('other');
    setAddress(''); setRadius(100); setPicked(null); setLocInput(''); setLocMsg(null); setError(null);
  }

  function startEdit(s: SiteRow) {
    setEditId(s.id); setName(s.name); setCode(s.code ?? ''); setType(s.type);
    setAddress(s.address ?? ''); setRadius(s.radius_m ?? 100);
    setPicked(s.lng != null && s.lat != null ? { lng: s.lng, lat: s.lat } : null);
    setLocInput(s.source_url ?? ''); setLocMsg(null); setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Site name is required');
    if (!picked) return setError('Set the location (paste coordinates/link or click the map)');
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpc = supabase.rpc as any;
    const { error: e } = editId
      ? await rpc('admin_update_site', { p_id: editId, p_name: name.trim(), p_type: type, p_address: address.trim(), p_lng: picked.lng, p_lat: picked.lat, p_radius_m: radius })
      : await (async () => {
          if (!clientId) { setSaving(false); setError('Choose a client'); return { error: { message: '' } }; }
          return rpc('admin_create_site', { p_client: clientId, p_name: name.trim(), p_code: code.trim(), p_address: address.trim(), p_lng: picked.lng, p_lat: picked.lat, p_radius_m: radius, p_source_url: locInput.trim() || null, p_type: type });
        })();
    setSaving(false);
    if (e && e.message) return setError(e.message);
    if (e && !e.message) return; // client validation already surfaced
    resetForm();
    await load();
  }

  async function remove(s: SiteRow) {
    if (!confirm(`Delete "${s.name}"? This removes the building and its geofence.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase.rpc as any)('admin_delete_site', { p_id: s.id });
    if (e) return setError(e.message);
    if (editId === s.id) resetForm();
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{editId ? 'Edit building' : 'Add a building'}</span>
            {editId && <Button variant="ghost" size="sm" onClick={resetForm}><X className="h-4 w-4" /> Cancel</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editId && (
            <div className="space-y-2">
              <Label>Client</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <div className="flex gap-2">
                <Input placeholder="…or add a new client" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
                <Button type="button" variant="outline" onClick={addClient}><Plus className="h-4 w-4" /> Add</Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Building name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ferizaj HQ" /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize" value={type} onChange={(e) => setType(e.target.value)}>
                {SITE_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!editId && <div className="space-y-2"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HQ-1" /></div>}
            <div className="space-y-2" style={{ gridColumn: editId ? 'span 2' : undefined }}><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" /></div>
          </div>
          <div className="space-y-2">
            <Label>Geofence radius (m): {radius}</Label>
            <input type="range" min={30} max={500} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label>Paste Google Maps coordinates or link</Label>
            <div className="flex gap-2">
              <Input value={locInput} onChange={(e) => setLocInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); locate(); } }} placeholder='42.3706, 21.1553  ·  42°22′14″N 21°09′19″E  ·  maps.app.goo.gl/…' />
              <Button type="button" variant="outline" onClick={locate} disabled={locating}>{locating ? 'Locating…' : 'Locate'}</Button>
            </div>
            {locMsg && <p className="text-xs text-muted-foreground">{locMsg}</p>}
          </div>

          <div className="space-y-2">
            <Label>…or click the map to place it</Label>
            <LiveMap
              center={picked ? [picked.lng, picked.lat] : MAP_DEFAULT.center}
              flyTo={picked ? [picked.lng, picked.lat] : undefined}
              onClick={(lng, lat) => setPicked({ lng, lat })}
              markers={picked ? [{ id: 'picked', lng: picked.lng, lat: picked.lat, color: '#22C55E' }] : []}
              circles={picked ? [{ id: 'r', lng: picked.lng, lat: picked.lat, radiusM: radius, color: '#22C55E' }] : []}
              className="h-72 w-full overflow-hidden rounded-md border"
            />
            {picked && <p className="text-xs text-muted-foreground">Selected: {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : editId ? 'Save changes' : 'Create building'}</Button>
        </CardContent>
      </Card>

      {/* list */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Buildings ({sites.length}{sites.length >= 300 ? '+' : ''})</CardTitle>
          <Input placeholder="Search buildings by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">{search ? 'No buildings match your search.' : 'No buildings yet. Add your first on the left.'}</p>
          ) : (
            <ul className="divide-y">
              {sites.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs capitalize text-secondary-foreground">{s.type}</span>
                      {s.code ? <span className="text-xs text-muted-foreground">{s.code}</span> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">{s.client}</div>
                    {s.address && <div className="text-sm text-muted-foreground">{s.address}</div>}
                    <div className="text-xs text-muted-foreground">{s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}{s.radius_m ? ` · ${Math.round(s.radius_m)}m` : ''}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="sm" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
