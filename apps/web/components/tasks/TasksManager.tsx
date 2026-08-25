'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
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
interface TaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  assignee: string;
  site: string | null;
}

const TASK_TYPES = ['maintenance', 'inspection', 'response', 'patrol', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  accepted: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-500',
  normal: 'text-slate-600',
  high: 'text-amber-600',
  critical: 'text-red-600',
};

export function TasksManager({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [techs, setTechs] = useState<Person[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState('maintenance');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [siteId, setSiteId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: t }, { data: s }, { data: tk }] = await Promise.all([
      supabase.from('user_roles').select('user_id, profiles(full_name)').eq('role', 'technician'),
      supabase.from('sites').select('id, name').order('name'),
      supabase
        .from('tasks')
        .select('id, title, type, priority, status, profiles(full_name), sites(name)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    setTechs(
      ((t ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.user_id as string,
        full_name: ((r.profiles as { full_name?: string } | null)?.full_name) ?? '—',
      }))
    );
    setSites((s ?? []) as Site[]);
    setTasks(
      ((tk ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        type: r.type as string,
        priority: r.priority as string,
        status: r.status as string,
        assignee: ((r.profiles as { full_name?: string } | null)?.full_name) ?? 'Unassigned',
        site: ((r.sites as { name?: string } | null)?.name) ?? null,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTask() {
    setError(null);
    if (!title.trim()) return setError('Title is required');
    setSaving(true);
    const { error: e } = await supabase.from('tasks').insert({
      type,
      priority,
      status: assignee ? 'assigned' : 'open',
      title: title.trim(),
      description: description.trim() || null,
      site_id: siteId || null,
      assigned_to: assignee || null,
      created_by: currentUserId,
    } as never);
    setSaving(false);
    if (e) return setError(e.message);
    setTitle('');
    setDescription('');
    setSiteId('');
    setAssignee('');
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispatch a task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix camera at main gate" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Site (optional)</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">None</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Assign to technician</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={createTask} disabled={saving} className="w-full">
            {saving ? 'Dispatching…' : 'Dispatch task'}
          </Button>
          {techs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No technician accounts yet — grant someone the &quot;technician&quot; role to assign tasks.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 py-3">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-sm text-muted-foreground">
                      <span className="capitalize">{t.type}</span> ·{' '}
                      <span className={`font-medium capitalize ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                        {t.priority}
                      </span>{' '}
                      · {t.assignee}
                      {t.site ? ` · ${t.site}` : ''}
                    </div>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[t.status] ?? STATUS_COLORS.open
                    }`}
                  >
                    {t.status.replace('_', ' ')}
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
