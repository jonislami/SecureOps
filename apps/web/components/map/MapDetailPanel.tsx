'use client';

import { useEffect, useMemo, useState } from 'react';
import { Phone, X, User, Building2, Clock } from 'lucide-react';
import { ROLE_LABELS, type AppRole } from '@sentinel/shared';
import { createClient } from '@/lib/supabase/client';

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const shell =
  'absolute left-3 top-3 z-10 w-72 rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur';

export function GuardDetailsPanel({
  employeeId,
  onClose,
}: {
  employeeId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{
    name: string;
    phone: string | null;
    roles: AppRole[];
    shiftSite: string | null;
    onShift: boolean;
    lastSeen: string | null;
    moving: boolean | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: prof }, { data: roleRows }, { data: shift }, { data: loc }] = await Promise.all([
        supabase.from('profiles').select('full_name, phone').eq('id', employeeId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', employeeId),
        supabase
          .from('shifts')
          .select('status, sites(name)')
          .eq('employee_id', employeeId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('current_location')
          .select('updated_at, is_moving')
          .eq('employee_id', employeeId)
          .maybeSingle(),
      ]);
      if (!active) return;
      const p = prof as { full_name?: string; phone?: string | null } | null;
      const sh = shift as { sites?: { name?: string } | null } | null;
      const l = loc as { updated_at?: string; is_moving?: boolean | null } | null;
      setData({
        name: p?.full_name ?? employeeId.slice(0, 8),
        phone: p?.phone ?? null,
        roles: ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role),
        shiftSite: sh?.sites?.name ?? null,
        onShift: !!sh,
        lastSeen: l?.updated_at ?? null,
        moving: l?.is_moving ?? null,
      });
    })();
    return () => {
      active = false;
    };
  }, [supabase, employeeId]);

  return (
    <div className={shell}>
      <button onClick={onClose} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </span>
            <div>
              <div className="font-semibold leading-tight">{data.name}</div>
              <div className="text-xs text-muted-foreground">
                {data.moving ? 'Moving' : 'Stationary'} · seen {relTime(data.lastSeen)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {data.roles.length ? (
              data.roles.map((r) => (
                <span key={r} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {ROLE_LABELS[r]}
                </span>
              ))
            ) : (
              <span className="text-xs text-amber-600">no role</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {data.onShift ? (
              <span>
                On shift{data.shiftSite ? <> @ <strong>{data.shiftSite}</strong></> : null}
              </span>
            ) : (
              <span className="text-muted-foreground">Off shift</span>
            )}
          </div>

          {data.phone ? (
            <a
              href={`tel:${data.phone}`}
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Phone className="h-4 w-4" /> Call {data.phone}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No phone number on file.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteDetailsPanel({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{
    name: string;
    address: string | null;
    client: string | null;
    radius: number | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: site } = await supabase
        .from('sites')
        .select('name, address, clients(name), geofences(radius_m)')
        .eq('id', siteId)
        .maybeSingle();
      if (!active) return;
      const s = site as unknown as Record<string, unknown> | null;
      setData({
        name: (s?.name as string) ?? 'Site',
        address: (s?.address as string | null) ?? null,
        client: ((s?.clients as { name?: string } | null)?.name) ?? null,
        radius: ((s?.geofences as Array<{ radius_m?: number }> | null)?.[0]?.radius_m as number) ?? null,
      });
    })();
    return () => {
      active = false;
    };
  }, [supabase, siteId]);

  return (
    <div className={shell}>
      <button onClick={onClose} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15">
              <Building2 className="h-4 w-4 text-amber-600" />
            </span>
            <div>
              <div className="font-semibold leading-tight">{data.name}</div>
              {data.client && <div className="text-xs text-muted-foreground">{data.client}</div>}
            </div>
          </div>
          {data.address && <p className="text-sm text-muted-foreground">{data.address}</p>}
          {data.radius ? (
            <p className="text-xs text-muted-foreground">Geofence radius: {Math.round(data.radius)} m</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
