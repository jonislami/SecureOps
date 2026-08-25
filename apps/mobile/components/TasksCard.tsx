import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

interface TaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  site_name: string | null;
}

// The next action + resulting status for each current status.
const NEXT: Record<string, { label: string; to: string } | undefined> = {
  assigned: { label: 'Accept', to: 'accepted' },
  accepted: { label: 'Start', to: 'in_progress' },
  in_progress: { label: 'Complete', to: 'completed' },
};

const PRIORITY_COLOR: Record<string, string> = {
  low: colors.muted,
  normal: colors.muted,
  high: colors.warning,
  critical: colors.danger,
};

export function TasksCard({ userId }: { userId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, type, priority, status, sites(name)')
      .eq('assigned_to', userId)
      .in('status', ['assigned', 'accepted', 'in_progress'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });
    setTasks(
      ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        type: r.type as string,
        priority: r.priority as string,
        status: r.status as string,
        site_name: ((r.sites as { name?: string } | null)?.name) ?? null,
      }))
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function advance(taskId: string, to: string) {
    setBusy(taskId);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).rpc('advance_task', { p_task: taskId, p_to: to });
    setBusy(null);
    if (e) return setError(e.message);
    await load();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>My tasks</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : tasks.length === 0 ? (
        <Text style={styles.subtitle}>No open tasks assigned to you.</Text>
      ) : (
        tasks.map((t) => {
          const next = NEXT[t.status];
          return (
            <View key={t.id} style={styles.row}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <Text style={styles.meta}>
                  <Text style={{ textTransform: 'capitalize' }}>{t.type}</Text>
                  {'  ·  '}
                  <Text style={{ color: PRIORITY_COLOR[t.priority] ?? colors.muted, textTransform: 'capitalize' }}>
                    {t.priority}
                  </Text>
                  {t.site_name ? `  ·  ${t.site_name}` : ''}
                </Text>
                <Text style={styles.status}>{t.status.replace('_', ' ')}</Text>
              </View>
              {next && (
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => advance(t.id, next.to)}
                  disabled={busy === t.id}
                >
                  {busy === t.id ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : (
                    <Text style={styles.btnText}>{next.label}</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })
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
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
  },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  status: { color: colors.muted, fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 84,
    alignItems: 'center',
  },
  btnText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
});
