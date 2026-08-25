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

  const workers = await listWorkers();

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
        <WorkersManager workers={workers} currentUserId={user.id} />
      </main>
    </div>
  );
}
