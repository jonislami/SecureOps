'use server';

import { revalidatePath } from 'next/cache';
import type { AppRole } from '@sentinel/shared';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateWorkerInput {
  fullName: string;
  email: string;
  phone?: string;
  employeeCode?: string;
  roles: AppRole[];
  method: 'password' | 'invite';
  password?: string;
}

export async function createWorker(input: CreateWorkerInput): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const admin = createAdminClient();

    if (!input.fullName.trim()) return { ok: false, error: 'Full name is required' };
    if (!input.email.trim()) return { ok: false, error: 'Email is required' };

    let userId: string;
    if (input.method === 'invite') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email.trim(), {
        data: { full_name: input.fullName.trim() },
      });
      if (error) return { ok: false, error: error.message };
      userId = data.user.id;
    } else {
      if (!input.password || input.password.length < 8) {
        return { ok: false, error: 'Password must be at least 8 characters' };
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email.trim(),
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.fullName.trim() },
      });
      if (error) return { ok: false, error: error.message };
      userId = data.user.id;
    }

    await admin
      .from('profiles')
      .upsert({
        id: userId,
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        employee_code: input.employeeCode?.trim() || null,
      } as never);

    if (input.roles.length) {
      await admin
        .from('user_roles')
        .upsert(
          input.roles.map((role) => ({ user_id: userId, role })) as never,
          { onConflict: 'user_id,role', ignoreDuplicates: true }
        );
    }

    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create worker' };
  }
}

export async function setWorkerRoles(userId: string, roles: AppRole[]): Promise<ActionResult> {
  try {
    const me = await requireSuperAdmin();
    if (userId === me.id && !roles.includes('super_admin')) {
      return { ok: false, error: 'You cannot remove super_admin from your own account' };
    }
    const admin = createAdminClient();
    await admin.from('user_roles').delete().eq('user_id', userId);
    if (roles.length) {
      await admin.from('user_roles').insert(roles.map((role) => ({ user_id: userId, role })) as never);
    }
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to set roles' };
  }
}

export async function updateWorkerProfile(
  userId: string,
  patch: { fullName: string; phone?: string; employeeCode?: string }
): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    const admin = createAdminClient();
    await admin
      .from('profiles')
      .update({
        full_name: patch.fullName.trim(),
        phone: patch.phone?.trim() || null,
        employee_code: patch.employeeCode?.trim() || null,
      } as never)
      .eq('id', userId);
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update worker' };
  }
}

export async function setWorkerStatus(
  userId: string,
  status: 'active' | 'suspended'
): Promise<ActionResult> {
  try {
    const me = await requireSuperAdmin();
    if (userId === me.id && status === 'suspended') {
      return { ok: false, error: 'You cannot suspend your own account' };
    }
    const admin = createAdminClient();
    await admin.from('profiles').update({ status } as never).eq('id', userId);
    // Also block / unblock sign-in at the auth layer.
    await admin.auth.admin.updateUserById(userId, {
      ban_duration: status === 'suspended' ? '876000h' : 'none',
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to change status' };
  }
}

export async function resetWorkerPassword(userId: string, password: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin();
    if (!password || password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters' };
    }
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reset password' };
  }
}
