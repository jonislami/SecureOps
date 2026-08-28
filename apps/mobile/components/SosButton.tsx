import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { getCurrentCoords } from '../lib/location';
import { colors } from '../theme';

/**
 * Field SOS / panic. Two-step (confirm) to avoid accidental triggers, but never
 * blocked by connectivity or a missing location — safety first.
 */
export function SosButton() {
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    // Best-effort location; SOS still sends without it.
    const coords = await getCurrentCoords().catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase.rpc as any)('raise_sos', {
      p_lng: coords?.lng ?? null,
      p_lat: coords?.lat ?? null,
      p_type: 'sos',
    });
    setSending(false);
    if (e) setError(e.message);
    else setSentAt(new Date());
  }

  function confirm() {
    Alert.alert('Send SOS?', 'This immediately alerts the control center with your location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: send },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.btn} onPress={confirm} disabled={sending} activeOpacity={0.85}>
        {sending ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <Text style={styles.title}>SOS</Text>
            <Text style={styles.sub}>Hold nothing — tap, then confirm</Text>
          </>
        )}
      </TouchableOpacity>
      {sentAt && !error && (
        <Text style={styles.sent}>
          SOS sent at {sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · control center notified. Tap again if still in danger.
        </Text>
      )}
      {error && <Text style={styles.error}>Could not send: {error}. Try again.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  btn: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 3 },
  sub: { color: 'rgba(255,255,255,.85)', fontSize: 11, marginTop: 4 },
  sent: { color: colors.warning, fontSize: 12, marginTop: 8, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
