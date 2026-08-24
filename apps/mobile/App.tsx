import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { isFieldRole } from '@sentinel/shared';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ControlCenterScreen } from './screens/ControlCenterScreen';
import { colors } from './theme';

function Root() {
  const { session, roles, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  // The mobile app is for field work. A user with roles but NO field role
  // (i.e. control-center / admin only) belongs on the web app.
  const hasField = roles.some(isFieldRole);
  if (roles.length > 0 && !hasField) return <ControlCenterScreen />;

  // Field staff (and users still awaiting a role) get the field home.
  return <HomeScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
