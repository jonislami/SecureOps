import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck, MapPin, Users, ClipboardList, AlertTriangle, Building2, Route, UserCog } from 'lucide-react';
import { ROLE_LABELS, primarySurface } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from './sign-out-button';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const displayName = user.profile?.full_name ?? user.email ?? 'Unknown user';
  const hasRoles = user.roles.length > 0;
  const surface = primarySurface(user.roles);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Sentinel</span>
            <span className="text-sm text-muted-foreground">Control Center</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="container space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {displayName}</h1>
          <p className="text-muted-foreground">
            You are signed in to the Sentinel control center.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasRoles ? (
              <div className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                  >
                    {ROLE_LABELS[role]}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">No role assigned yet</p>
                  <p>
                    Your account has no role. An administrator must grant one
                    before you can access operational features. (See{' '}
                    <code>scripts/grant-role.mjs</code>.)
                  </p>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Primary surface:{' '}
              <span className="font-medium text-foreground">{surface}</span>
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {user.roles.includes('super_admin') && (
            <FeatureTile
              icon={UserCog}
              title="Workers & Roles"
              desc="Accounts & permissions"
              phase="Admin"
              href="/admin"
            />
          )}
          <FeatureTile
            icon={MapPin}
            title="Live Map"
            desc="Real-time field locations"
            phase="Open map"
            href="/map"
          />
          <FeatureTile
            icon={Building2}
            title="Sites & Geofences"
            desc="Protected locations"
            phase="Manage sites"
            href="/sites"
          />
          <FeatureTile
            icon={Users}
            title="Shifts"
            desc="Assign guards to posts"
            phase="Manage shifts"
            href="/shifts"
          />
          <FeatureTile
            icon={Route}
            title="Patrol Routes"
            desc="Routes & checkpoints"
            phase="Manage routes"
            href="/patrols"
          />
          <FeatureTile
            icon={ClipboardList}
            title="Tasks & Dispatch"
            desc="Assign and track work"
            phase="Dispatch"
            href="/tasks"
          />
          <FeatureTile
            icon={AlertTriangle}
            title="Emergencies"
            desc="SOS & incident response"
            phase="Phase 8"
          />
        </div>
      </main>
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  desc,
  phase,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  phase: string;
  href?: string;
}) {
  const card = (
    <Card className={cn('h-full transition-colors', href ? 'hover:border-primary' : 'opacity-70')}>
      <CardContent className="space-y-2 p-5">
        <Icon className="h-6 w-6 text-primary" />
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {phase}
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}
