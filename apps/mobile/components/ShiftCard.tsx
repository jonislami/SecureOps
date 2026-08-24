import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export interface Shift {
  id: string;
  site_id: string | null;
  site_name: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShiftCard({ shift, onChanged }: { shift: Shift | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: 'active' | 'completed') {
    if (!shift) return;
    setBusy(true);
    setError(null);
    const patch =
      status === 'active'
        ? { status, started_at: new Date().toISOString() }
        : { status, ended_at: new Date().toISOString() };
    const { error: e } = await supabase.from('shifts').update(patch as never).eq('id', shift.id);
    setBusy(false);
    if (e) setError(e.message);
    else onChanged();
  }

  if (!shift) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>No shift assigned</Text>
        <Text style={styles.subtitle}>
          When a supervisor assigns you a post, it shows up here.
        </Text>
      </View>
    );
  }

  const active = shift.status === 'active';

  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <Text style={styles.label}>{active ? 'ON SHIFT' : 'NEXT SHIFT'}</Text>
      <Text style={styles.title}>{shift.site_name ?? 'Assigned post'}</Text>
      <Text style={styles.subtitle}>
        {fmt(shift.starts_at)} → {fmt(shift.ends_at)}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {shift.status === 'scheduled' && (
        <TouchableOpacity style={[styles.btn, styles.btnStart]} onPress={() => setStatus('active')} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.btnText}>Start shift</Text>}
        </TouchableOpacity>
      )}
      {active && (
        <TouchableOpacity style={[styles.btn, styles.btnEnd]} onPress={() => setStatus('completed')} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.btnText}>End shift</Text>}
        </TouchableOpacity>
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
  label: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  btn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnStart: { backgroundColor: colors.primary },
  btnEnd: { backgroundColor: colors.danger },
  btnText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
});
