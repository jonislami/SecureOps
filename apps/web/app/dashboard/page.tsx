import { redirect } from 'next/navigation';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { getCurrentUser } from '@/lib/auth';
import { DashboardHome } from '@/components/dashboard/DashboardHome';
import '../map/industry.css';

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-barlow' });
const barlowCond = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-barlow-cond' });

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className={`${barlow.variable} ${barlowCond.variable}`}>
      <DashboardHome
        user={{
          name: user.profile?.full_name ?? user.email ?? 'Operator',
          email: user.email ?? '',
          roles: user.roles,
          isAdmin: user.roles.includes('super_admin'),
        }}
      />
    </div>
  );
}
