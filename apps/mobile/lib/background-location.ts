import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ingestLocations, type IngestPing } from '@sentinel/shared';
import { supabase } from './supabase';

const TASK = 'sentinel-bg-location';
const SHIFT_KEY = 'sentinel.activeShift';

// Runs in a headless JS context when the OS delivers background locations.
// The Supabase client restores the session from AsyncStorage; the ingest RPC
// pins the employee to their auth.uid(), so no user id is needed here.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;
  const shiftId = (await AsyncStorage.getItem(SHIFT_KEY)) || null;
  const pings: IngestPing[] = locations.map((l) => ({
    lng: l.coords.longitude,
    lat: l.coords.latitude,
    accuracyM: l.coords.accuracy ?? undefined,
    speedMps: l.coords.speed ?? undefined,
    headingDeg: l.coords.heading ?? undefined,
    isMoving: (l.coords.speed ?? 0) > 0.5,
    isMock: l.mocked ?? false,
    recordedAt: new Date(l.timestamp).toISOString(),
  }));
  await ingestLocations(supabase, pings, shiftId).catch(() => {});
});

export async function requestBackgroundPermission(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted';
}

/** Start OS background location updates (dev build only). */
export async function startBackgroundTracking(shiftId: string | null): Promise<{ ok: boolean; reason?: string }> {
  const granted = await requestBackgroundPermission();
  if (!granted) return { ok: false, reason: 'Background location not granted' };
  await AsyncStorage.setItem(SHIFT_KEY, shiftId ?? '');
  const already = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (already) return { ok: true };
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 15,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Sentinel — on shift',
      notificationBody: 'Sharing your location with the control center.',
      notificationColor: '#3B82F6',
    },
  });
  return { ok: true };
}

export async function stopBackgroundTracking(): Promise<void> {
  await AsyncStorage.removeItem(SHIFT_KEY);
  const started = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(TASK);
}
