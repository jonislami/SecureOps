import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ROLE_LABELS } from '@sentinel/shared';
import { useAuth } from '../lib/auth';
import { colors } from '../theme';

/**
 * Shown when a signed-in user has ONLY control-center / oversight roles
 * (super_admin, control_operator, dispatcher, supervisor) and no field role.
 * The mobile app is for field work; their tools live in the web control center.
 */
export function ControlCenterScreen() {
  const { session, profile, roles, signOut } = useAuth();
  const name = profile?.full_name ?? session?.user.email ?? 'Operator';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🖥️</Text>
        </View>
        <Text style={styles.title}>Control Center account</Text>
        <Text style={styles.body}>
          Hi {name} — this account has control-center access, which runs in the{' '}
          <Text style={styles.bold}>web app on desktop</Text>, not the field app.
        </Text>

        <View style={styles.rolesBox}>
          <Text style={styles.rolesLabel}>Your roles</Text>
          <View style={styles.chips}>
            {roles.map((r) => (
              <View key={r} style={styles.chip}>
                <Text style={styles.chipText}>{ROLE_LABELS[r]}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.hint}>
          Open the Sentinel control center in a desktop browser to manage the live
          map, staff, dispatch, and emergencies.
        </Text>

        <TouchableOpacity style={styles.button} onPress={signOut}>
          <Text style={styles.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  badge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badgeText: { fontSize: 26 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  bold: { color: colors.text, fontWeight: '700' },
  rolesBox: { marginTop: 20 },
  rolesLabel: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 20 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
