import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { checkIn, checkOut } from '@sentinel/shared';
import { supabase } from '../lib/supabase';
import { getCurrentCoords } from '../lib/location';
import { colors } from '../theme';

interface OpenAttendance {
  id: string;
  check_in_at: string | null;
}

/**
 * Geofenced attendance for the active shift. Check-in is server-verified: it
 * fails unless the guard is physically inside the site perimeter.
 */
export function AttendanceCard({ shiftId }: { shiftId: string }) {
  const [open, setOpen] = useState<OpenAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('attendance')
      .select('id, check_in_at')
      .eq('shift_id', shiftId)
      .is('check_out_at', null)
      .order('check_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpen((data as OpenAttendance | null) ?? null);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => {
    load();
  }, [load]);

  async function doCheckIn() {
    setBusy(true);
    setError(null);
    const coords = await getCurrentCoords();
    if (!coords) {
      setBusy(false);
      return setError('Location permission needed to check in');
    }
    const { error: e } = await checkIn(supabase, shiftId, coords.lng, coords.lat);
    setBusy(false);
    if (e) return setError(e.message);
    await load();
  }

  async function doCheckOut() {
    setBusy(true);
    setError(null);
    const coords = await getCurrentCoords();
    if (!coords) {
      setBusy(false);
      return setError('Location permission needed to check out');
    }
    const { error: e } = await checkOut(supabase, shiftId, coords.lng, coords.lat);
    setBusy(false);
    if (e) return setError(e.message);
    await load();
  }

  const checkedIn = !!open;

  return (
    <View style={[styles.card, checkedIn && styles.cardActive]}>
      <Text style={styles.title}>Attendance</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : (
        <>
          <Text style={styles.subtitle}>
            {checkedIn
              ? `Checked in${open?.check_in_at ? ` at ${new Date(open.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
              : 'Not checked in. Check in when you reach your post.'}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {checkedIn ? (
            <TouchableOpacity style={[styles.btn, styles.btnOut]} onPress={doCheckOut} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.btnText}>Check out</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnIn]} onPress={doCheckIn} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.btnText}>Check in</Text>}
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>Check-in is confirmed only inside the site perimeter.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  cardActive: { borderColor: colors.primary },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  btn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnIn: { backgroundColor: colors.primary },
  btnOut: { backgroundColor: colors.danger },
  btnText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 11, marginTop: 10 },
});
