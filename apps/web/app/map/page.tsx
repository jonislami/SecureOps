import { redirect } from 'next/navigation';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { ROLE_LABELS } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { ControlCenterMap } from '@/components/map/ControlCenterMap';
import './industry.css';

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-barlow' });
const barlowCond = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-barlow-cond' });

export default async function MapPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const name = user.profile?.full_name ?? user.email ?? 'Operator';
  const role = user.roles[0] ? ROLE_LABELS[user.roles[0]] : 'Operator';

  return (
    <div className={`${barlow.variable} ${barlowCond.variable}`} style={{ height: '100vh' }}>
      <ControlCenterMap user={{ name, role }} />
    </div>
  );
}
