import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { getCurrentCoords } from '../lib/location';
import { colors } from '../theme';

interface RouteRow {
  id: string;
  name: string;
  count: number;
}
interface Checkpoint {
  id: string;
  name: string;
  seq: number;
}
interface ActiveSession {
  id: string;
  route_id: string;
  route_name: string;
}

export function PatrolCard({ userId, shiftId }: { userId: string; shiftId?: string | null }) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCheckpoints = useCallback(async (routeId: string, sessionId: string) => {
    const [{ data: cps }, { data: scans }] = await Promise.all([
      supabase.from('checkpoints').select('id, name, seq').eq('route_id', routeId).order('seq'),
      supabase.from('checkpoint_scans').select('checkpoint_id').eq('session_id', sessionId),
    ]);
    setCheckpoints((cps ?? []) as Checkpoint[]);
    setScanned(new Set(((scans ?? []) as Array<{ checkpoint_id: string }>).map((s) => s.checkpoint_id)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('patrol_sessions')
      .select('id, route_id, patrol_routes(name)')
      .eq('employee_id', userId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const row = data as unknown as Record<string, unknown>;
      const active: ActiveSession = {
        id: row.id as string,
        route_id: row.route_id as string,
        route_name: ((row.patrol_routes as { name?: string } | null)?.name) ?? 'Route',
      };
      setSession(active);
      await loadCheckpoints(active.route_id, active.id);
    } else {
      setSession(null);
      const { data: rts } = await supabase
        .from('patrol_routes')
        .select('id, name, checkpoints(count)')
        .eq('is_active', true)
        .order('name');
      setRoutes(
        ((rts ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          count: ((r.checkpoints as Array<{ count?: number }> | null)?.[0]?.count as number) ?? 0,
        }))
      );
    }
    setLoading(false);
  }, [userId, loadCheckpoints]);

  useEffect(() => {
    load();
  }, [load]);

  async function startPatrol(routeId: string) {
    setBusy(routeId);
    setError(null);
    const { error: e } = await supabase.from('patrol_sessions').insert({
      route_id: routeId,
      employee_id: userId,
      shift_id: shiftId ?? null,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    } as never);
    setBusy(null);
    if (e) return setError(e.message);
    await load();
  }

  async function scan(checkpointId: string) {
    if (!session) return;
    setBusy(checkpointId);
    setError(null);
    const coords = await getCurrentCoords();
    if (!coords) {
      setBusy(null);
      return setError('Location permission needed to scan');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).rpc('scan_checkpoint', {
      p_session: session.id,
      p_checkpoint: checkpointId,
      p_lng: coords.lng,
      p_lat: coords.lat,
      p_method: 'geofence',
    });
    setBusy(null);
    if (e) return setError(e.message);
    setScanned((prev) => new Set(prev).add(checkpointId));
  }

  async function endPatrol() {
    if (!session) return;
    setBusy('end');
    setError(null);
    const { error: e } = await supabase
      .from('patrol_sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() } as never)
      .eq('id', session.id);
    setBusy(null);
    if (e) return setError(e.message);
    await load();
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Active patrol → checkpoint list.
  if (session) {
    return (
      <View style={[styles.card, styles.cardActive]}>
        <Text style={styles.label}>PATROL IN PROGRESS</Text>
        <Text style={styles.title}>{session.route_name}</Text>
        <Text style={styles.subtitle}>
          {scanned.size}/{checkpoints.length} checkpoints scanned
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ marginTop: 8 }}>
          {checkpoints.map((cp) => {
            const done = scanned.has(cp.id);
            return (
              <View key={cp.id} style={styles.cpRow}>
                <Text style={[styles.cpName, done && styles.cpDone]}>
                  {done ? '✓ ' : ''}
                  {cp.seq}. {cp.name}
                </Text>
                {!done && (
                  <TouchableOpacity
                    style={styles.scanBtn}
                    onPress={() => scan(cp.id)}
                    disabled={busy === cp.id}
                  >
                    {busy === cp.id ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Text style={styles.scanText}>Scan</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={[styles.btn, styles.btnEnd]} onPress={endPatrol} disabled={busy === 'end'}>
          {busy === 'end' ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.btnText}>End patrol</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // No active patrol → route picker.
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Patrols</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {routes.length === 0 ? (
        <Text style={styles.subtitle}>No patrol routes assigned yet.</Text>
      ) : (
        routes.map((r) => (
          <View key={r.id} style={styles.cpRow}>
            <Text style={styles.cpName}>
              {r.name} <Text style={styles.muted}>· {r.count} checkpoints</Text>
            </Text>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => startPatrol(r.id)}
              disabled={busy === r.id}
            >
              {busy === r.id ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.scanText}>Start</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
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
  muted: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cpName: { color: colors.text, fontSize: 14, flex: 1 },
  cpDone: { color: colors.muted, textDecorationLine: 'line-through' },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  scanText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  btn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnEnd: { backgroundColor: colors.danger },
  btnText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
});
