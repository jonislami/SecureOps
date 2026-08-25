'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@sentinel/shared';
import {
  createWorker,
  setWorkerRoles,
  updateWorkerProfile,
  setWorkerStatus,
  resetWorkerPassword,
} from '@/app/admin/actions';
import type { Worker } from '@/app/admin/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function RolePicker({
  value,
  onChange,
}: {
  value: AppRole[];
  onChange: (roles: AppRole[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {APP_ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            className={`rounded-full border px-3 py-1 text-sm ${
              on
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-accent'
            }`}
          >
            {ROLE_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

export function WorkersManager({
  workers,
  currentUserId,
}: {
  workers: Worker[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Add form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [roles, setRoles] = useState<AppRole[]>(['guard']);
  const [method, setMethod] = useState<'password' | 'invite'>('password');
  const [password, setPassword] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onErr: (m: string) => void,
    onOk?: () => void
  ) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) onErr(res.error ?? 'Something went wrong');
    else {
      onErr('');
      onOk?.();
      router.refresh();
    }
  }

  function submitAdd() {
    setAddError(null);
    setAddOk(null);
    run(
      () => createWorker({ fullName, email, phone, employeeCode: code, roles, method, password }),
      (m) => setAddError(m || null),
      () => {
        setAddOk(`Created ${email}`);
        setFullName('');
        setEmail('');
        setPhone('');
        setCode('');
        setPassword('');
        setRoles(['guard']);
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Add worker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Add a worker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Arben Krasniqi" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="arben@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+383 4x xxx xxx" />
            </div>
            <div className="space-y-2">
              <Label>Employee code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EMP-001" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            <RolePicker value={roles} onChange={setRoles} />
          </div>

          <div className="space-y-2">
            <Label>Access</Label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={method === 'password'} onChange={() => setMethod('password')} />
                Set a temporary password
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={method === 'invite'} onChange={() => setMethod('invite')} />
                Email an invite link
              </label>
            </div>
            {method === 'password' && (
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Temporary password (min 8 chars)"
              />
            )}
            {method === 'invite' && (
              <p className="text-xs text-muted-foreground">
                Requires email/SMTP configured in Supabase. The worker sets their own password via the link.
              </p>
            )}
          </div>

          {addError && <p className="text-sm text-destructive">{addError}</p>}
          {addOk && <p className="text-sm text-emerald-600">{addOk}</p>}
          <Button onClick={submitAdd} disabled={pending}>
            {pending ? 'Working…' : 'Create worker'}
          </Button>
        </CardContent>
      </Card>

      {/* Directory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workers ({workers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {workers.map((w) => (
              <li key={w.id}>
                <div className="flex items-center gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{w.full_name}</span>
                      {w.status === 'suspended' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
                          suspended
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {w.email}
                      {w.phone ? ` · ${w.phone}` : ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.roles.length ? (
                        w.roles.map((r) => (
                          <span key={r} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {ROLE_LABELS[r]}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-amber-600">no role</span>
                      )}
                      <span className="text-xs text-muted-foreground">· seen {relTime(w.last_seen)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                  >
                    Manage
                    {expanded === w.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
                {expanded === w.id && (
                  <WorkerEditor worker={w} isSelf={w.id === currentUserId} onDone={() => router.refresh()} />
                )}
              </li>
            ))}
            {workers.length === 0 && (
              <li className="px-6 py-6 text-sm text-muted-foreground">No workers yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkerEditor({
  worker,
  isSelf,
  onDone,
}: {
  worker: Worker;
  isSelf: boolean;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>(worker.roles);
  const [fullName, setFullName] = useState(worker.full_name);
  const [phone, setPhone] = useState(worker.phone ?? '');
  const [code, setCode] = useState(worker.employee_code ?? '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setErr(null);
    setMsg(null);
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) setErr(res.error ?? 'Failed');
    else {
      setMsg(okMsg);
      onDone();
    }
  }

  return (
    <div className="space-y-4 border-t bg-muted/30 px-6 py-4">
      <div className="space-y-2">
        <Label>Roles</Label>
        <RolePicker value={roles} onChange={setRoles} />
        <Button size="sm" disabled={pending} onClick={() => act(() => setWorkerRoles(worker.id, roles), 'Roles updated')}>
          Save roles
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          act(() => updateWorkerProfile(worker.id, { fullName, phone, employeeCode: code }), 'Profile updated')
        }
      >
        Save profile
      </Button>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Reset password</Label>
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || pw.length < 8}
          onClick={() => act(() => resetWorkerPassword(worker.id, pw), 'Password reset')}
        >
          Reset
        </Button>
        {!isSelf &&
          (worker.status === 'suspended' ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setWorkerStatus(worker.id, 'active'), 'Reactivated')}>
              Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => act(() => setWorkerStatus(worker.id, 'suspended'), 'Suspended')}>
              Suspend
            </Button>
          ))}
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
    </div>
  );
}
