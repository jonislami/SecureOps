import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ROLE_LABELS, primarySurface } from '@sentinel/shared';
import { useAuth } from '../lib/auth';
import { colors } from '../theme';

/** Feature availability per phase — the field capabilities come later. */
const FIELD_FEATURES = [
  { title: 'My Shift', desc: 'Start / end shift, see your post', phase: 'Phase 3' },
  { title: 'Location', desc: 'Background GPS while on shift', phase: 'Phase 2' },
  { title: 'Attendance', desc: 'Geofenced check-in / check-out', phase: 'Phase 3' },
  { title: 'Patrol', desc: 'Checkpoint scans', phase: 'Phase 4' },
  { title: 'Tasks', desc: 'Work assigned to you', phase: 'Phase 7' },
  { title: 'SOS', desc: 'Emergency panic button', phase: 'Phase 8' },
];

export function HomeScreen() {
  const { session, profile, roles, signOut } = useAuth();

  const name = profile?.full_name ?? session?.user.email ?? 'Field Officer';
  const hasRoles = roles.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Welcome</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your roles</Text>
          {hasRoles ? (
            <View style={styles.chips}>
              {roles.map((r) => (
                <View key={r} style={styles.chip}>
                  <Text style={styles.chipText}>{ROLE_LABELS[r]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.warn}>
              <Text style={styles.warnText}>
                No role assigned yet. Ask an administrator to grant you a role
                before you can go on shift.
              </Text>
            </View>
          )}
          <Text style={styles.surface}>
            Access: {primarySurface(roles)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Field tools</Text>
        <View style={styles.grid}>
          {FIELD_FEATURES.map((f) => (
            <View key={f.title} style={styles.tile}>
              <Text style={styles.tileTitle}>{f.title}</Text>
              <Text style={styles.tileDesc}>{f.desc}</Text>
              <Text style={styles.tilePhase}>{f.phase}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hello: { color: colors.muted, fontSize: 13 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  signOut: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  body: { padding: 20, gap: 12 },
  section: { marginBottom: 8 },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  surface: { color: colors.muted, fontSize: 13, marginTop: 12 },
  warn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.4)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  warnText: { color: colors.warning, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    opacity: 0.85,
  },
  tileTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  tileDesc: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 8 },
  tilePhase: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
