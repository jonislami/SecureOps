import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { isStaffRole } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { ShiftsManager } from '@/components/shifts/ShiftsManager';

export default async function ShiftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Scheduling is for oversight roles (admin, control operator, dispatcher, supervisor).
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
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="font-semibold">Shifts</span>
        </div>
      </header>
      <main className="container py-6">
        <ShiftsManager currentUserId={user.id} />
      </main>
    </div>
  );
}
