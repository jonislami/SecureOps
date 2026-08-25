import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Route } from 'lucide-react';
import { isStaffRole } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { RoutesManager } from '@/components/patrols/RoutesManager';

export default async function PatrolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.roles.some(isStaffRole)) redirect('/dashboard');

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
          <Route className="h-4 w-4 text-primary" />
          <span className="font-semibold">Patrol Routes</span>
        </div>
      </header>
      <main className="container py-6">
        <RoutesManager />
      </main>
    </div>
  );
}
