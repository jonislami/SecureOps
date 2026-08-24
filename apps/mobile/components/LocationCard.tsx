import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { startSharing, stopSharing, type ShareUpdate } from '../lib/location';
import { colors } from '../theme';

/**
 * Foreground location sharing. While ON, the device sends its real GPS to the
 * control center every ~10 s. Works in Expo Go (foreground only); background
 * tracking needs an EAS dev build.
 */
export function LocationCard({ shiftId }: { shiftId?: string | null }) {
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ShareUpdate | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSharing();
    };
  }, []);

  async function toggle() {
    setError(null);
    if (sharing) {
      stopSharing();
      setSharing(false);
      return;
    }
    setBusy(true);
    const res = await startSharing((u) => {
      if (!mounted.current) return;
      setLast(u);
      setCount((c) => c + 1);
      if (u.error) setError(u.error);
    }, shiftId);
    setBusy(false);
    if (res.ok) setSharing(true);
    else setError(res.reason ?? 'Could not start location sharing');
  }

  return (
    <View style={[styles.card, sharing && styles.cardActive]}>
      <View style={styles.row}>
        <View style={styles.dotWrap}>
          <View style={[styles.dot, { backgroundColor: sharing ? colors.primary : colors.muted }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Location sharing</Text>
          <Text style={styles.subtitle}>
            {sharing ? 'On — control center can see you' : 'Off — you are not visible'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.btn, sharing ? styles.btnStop : styles.btnStart]}
          onPress={toggle}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.btnText}>{sharing ? 'Stop' : 'Share'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {last && !error && (
        <Text style={styles.status}>
          Sent {count} · {last.lat.toFixed(5)}, {last.lng.toFixed(5)}
          {last.accuracyM ? ` · ±${Math.round(last.accuracyM)}m` : ''}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.hint}>
        Foreground only in Expo Go. Keep this screen open while sharing.
      </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dotWrap: { width: 16, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, minWidth: 78, alignItems: 'center' },
  btnStart: { backgroundColor: colors.primary },
  btnStop: { backgroundColor: colors.danger },
  btnText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  status: { color: colors.text, fontSize: 12, marginTop: 12 },
  error: { color: colors.danger, fontSize: 12, marginTop: 12 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 10 },
});
