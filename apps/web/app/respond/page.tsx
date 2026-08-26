import { redirect } from 'next/navigation';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { isStaffRole } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { RespondConsole } from '@/components/respond/RespondConsole';
import '../map/industry.css';

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-barlow' });
const barlowCond = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-barlow-cond' });

export default async function RespondPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.roles.some(isStaffRole)) redirect('/dashboard');

  return (
    <div className={`${barlow.variable} ${barlowCond.variable}`} style={{ height: '100vh' }}>
      <RespondConsole email={user.email ?? ''} />
    </div>
  );
}
