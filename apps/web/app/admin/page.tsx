import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { listWorkers } from './data';
import { WorkersManager } from '@/components/admin/WorkersManager';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.roles.includes('super_admin')) redirect('/dashboard');

  let workers = [] as Awaited<ReturnType<typeof listWorkers>>;
  let loadError: string | null = null;
  try {
    workers = await listWorkers();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load workers';
  }

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <span className="text-border">|</span>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="font-semibold">Workers &amp; Roles</span>
        </div>
      </header>
      <main className="container py-6">
        {loadError ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">Admin panel isn&apos;t configured yet.</p>
            <p className="mt-1">{loadError}</p>
            <p className="mt-2">
              <strong>Local:</strong> ensure <code>SUPABASE_SERVICE_ROLE_KEY</code> is in{' '}
              <code>apps/web/.env.local</code>, then <strong>restart the dev server</strong> (stop it and
              run <code>pnpm --filter @sentinel/web dev</code> again — Next.js only reads env at startup).
            </p>
            <p className="mt-1">
              <strong>Vercel:</strong> add <code>SUPABASE_SERVICE_ROLE_KEY</code> as a non-public
              Environment Variable and redeploy.
            </p>
          </div>
        ) : (
          <WorkersManager workers={workers} currentUserId={user.id} />
        )}
      </main>
    </div>
  );
}
