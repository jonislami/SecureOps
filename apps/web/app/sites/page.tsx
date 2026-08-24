import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { SitesManager } from '@/components/sites/SitesManager';

export default async function SitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Site management is admin-only (the RPC enforces this too).
  if (!user.roles.includes('super_admin')) redirect('/dashboard');

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
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-semibold">Sites &amp; Geofences</span>
        </div>
      </header>
      <main className="container py-6">
        <SitesManager />
      </main>
    </div>
  );
}
