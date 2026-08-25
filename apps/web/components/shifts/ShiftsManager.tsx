'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Person {
  id: string;
  full_name: string;
}
interface Site {
  id: string;
  name: string;
}
interface ShiftRow {
  id: string;
  employee: string;
  site: string;
  starts_at: string;
  ends_at: string;
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  missed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShiftsManager({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<Person[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: s }, { data: sh }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').is('deleted_at', null).order('full_name'),
      supabase.from('sites').select('id, name').order('name'),
      supabase
        .from('shifts')
        .select(
          'id, starts_at, ends_at, status, profiles(full_name), sites(name), attendance(check_in_at, check_out_at)'
        )
        .order('starts_at', { ascending: false })
        .limit(50),
    ]);
    setPeople((p ?? []) as Person[]);
    setSites((s ?? []) as Site[]);
    setShifts(
      ((sh ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        employee: ((row.profiles as { full_name?: string } | null)?.full_name) ?? '—',
        site: ((row.sites as { name?: string } | null)?.name) ?? '—',
        starts_at: row.starts_at as string,
        ends_at: row.ends_at as string,
        status: row.status as string,
        checkedInAt:
          ((row.attendance as Array<{ check_in_at?: string }> | null)?.[0]?.check_in_at as string) ??
          null,
        checkedOutAt:
          ((row.attendance as Array<{ check_out_at?: string }> | null)?.[0]?.check_out_at as string) ??
          null,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function createShift() {
    setError(null);
    if (!employeeId) return setError('Choose a guard');
    if (!siteId) return setError('Choose a site');
    if (!startAt || !endAt) return setError('Set start and end times');
    if (new Date(endAt) <= new Date(startAt)) return setError('End must be after start');

    setSaving(true);
    const { error: e } = await supabase.from('shifts').insert({
      employee_id: employeeId,
      site_id: siteId,
      starts_at: new Date(startAt).toISOString(),
      ends_at: new Date(endAt).toISOString(),
      status: 'scheduled',
      created_by: currentUserId,
    } as never);
    setSaving(false);
    if (e) return setError(e.message);
    setEmployeeId('');
    setSiteId('');
    setStartAt('');
    setEndAt('');
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign a shift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Guard</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select a guard…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Site / post</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Starts</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ends</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={createShift} disabled={saving} className="w-full">
            {saving ? 'Assigning…' : 'Assign shift'}
          </Button>
          {sites.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No sites yet — add posts on the Sites page first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shifts ({shifts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts scheduled yet.</p>
          ) : (
            <ul className="divide-y">
              {shifts.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {s.employee} <span className="text-muted-foreground">@ {s.site}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {fmt(s.starts_at)} → {fmt(s.ends_at)}
                    </div>
                    {s.checkedInAt && (
                      <div className="text-xs text-emerald-600">
                        ✓ Checked in {fmt(s.checkedInAt)}
                        {s.checkedOutAt ? ` · out ${fmt(s.checkedOutAt)}` : ''}
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[s.status] ?? STATUS_COLORS.scheduled
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
