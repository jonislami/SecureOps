import type { SentinelClient } from '../supabase/client';

export interface CheckInResult {
  attendance_id: string;
  status?: string;
  already_checked_in?: boolean;
  checked_in_at?: string;
}
export interface CheckOutResult {
  attendance_id: string;
  checked_out_at?: string;
}

/** Server-verified check-in: fails unless the guard is inside the site geofence. */
export async function checkIn(
  client: SentinelClient,
  shiftId: string,
  lng: number,
  lat: number
): Promise<{ data: CheckInResult | null; error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('check_in', {
    p_shift: shiftId,
    p_lng: lng,
    p_lat: lat,
  });
  return { data: (data as CheckInResult) ?? null, error: error ? { message: error.message } : null };
}

export async function checkOut(
  client: SentinelClient,
  shiftId: string,
  lng: number,
  lat: number
): Promise<{ data: CheckOutResult | null; error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('check_out', {
    p_shift: shiftId,
    p_lng: lng,
    p_lat: lat,
  });
  return { data: (data as CheckOutResult) ?? null, error: error ? { message: error.message } : null };
}
