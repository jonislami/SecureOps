'use server';

import { isStaffRole } from '@sentinel/shared';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Send an Expo push to a dispatched patrol's device. Best-effort: only works
 * once the field app runs as an EAS dev/standalone build (so it has a push
 * token saved on the profile). Staff-gated; reads the token with service_role.
 */
export async function sendResponsePush(patrolId: string, buildingName: string): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.some(isStaffRole)) return;

    const admin = createAdminClient();
    const { data } = await admin.from('profiles').select('push_token').eq('id', patrolId).maybeSingle();
    const token = (data as { push_token?: string } | null)?.push_token;
    if (!token) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: 'Alarm response',
        body: `Respond to ${buildingName} immediately.`,
        priority: 'high',
        sound: 'default',
        channelId: 'default',
      }),
    });
  } catch {
    /* push is best-effort — never block the dispatch */
  }
}
