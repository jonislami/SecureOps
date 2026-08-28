import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { ingestLocations, type IngestPing } from '@sentinel/shared';
import { supabase } from './supabase';
import { startBackgroundTracking, stopBackgroundTracking } from './background-location';

const isExpoGo = Constants.appOwnership === 'expo';

export interface ShareUpdate {
  lng: number;
  lat: number;
  accuracyM?: number;
  at: string;
  error: string | null;
}

let subscription: Location.LocationSubscription | null = null;

/** Ask for foreground location permission. Works in Expo Go. */
export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** One-shot current position (for check-in/out). Returns null if denied. */
export async function getCurrentCoords(): Promise<{ lng: number; lat: number } | null> {
  const granted = await requestForegroundPermission();
  if (!granted) return null;
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lng: loc.coords.longitude, lat: loc.coords.latitude };
}

/**
 * Start sharing the device's foreground location: every ~10 s (or 10 m of
 * movement) send a real GPS ping through the server-authoritative ingest RPC.
 * Foreground-only (Expo Go); true background tracking needs an EAS dev build.
 */
export async function startSharing(
  onUpdate?: (u: ShareUpdate) => void,
  shiftId?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const granted = await requestForegroundPermission();
  if (!granted) return { ok: false, reason: 'Location permission denied' };
  if (subscription) return { ok: true };

  // On a dev/standalone build, prefer OS background tracking (keeps sending when
  // the app is backgrounded or the phone is locked). It also delivers while the
  // app is open, so we skip the foreground watch to avoid duplicate pings.
  if (!isExpoGo) {
    const bg = await startBackgroundTracking(shiftId ?? null);
    if (bg.ok) return { ok: true };
    // else fall through to foreground-only
  }

  subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 10,
    },
    async (loc) => {
      const ping: IngestPing = {
        lng: loc.coords.longitude,
        lat: loc.coords.latitude,
        accuracyM: loc.coords.accuracy ?? undefined,
        speedMps: loc.coords.speed ?? undefined,
        headingDeg: loc.coords.heading ?? undefined,
        isMoving: (loc.coords.speed ?? 0) > 0.5,
        isMock: loc.mocked ?? false,
        recordedAt: new Date(loc.timestamp).toISOString(),
      };
      const { error } = await ingestLocations(supabase, [ping], shiftId ?? null);
      onUpdate?.({
        lng: ping.lng,
        lat: ping.lat,
        accuracyM: ping.accuracyM,
        at: ping.recordedAt,
        error: error?.message ?? null,
      });
    }
  );
  return { ok: true };
}

export function stopSharing(): void {
  subscription?.remove();
  subscription = null;
  stopBackgroundTracking().catch(() => {});
}

export function isSharing(): boolean {
  return subscription !== null;
}
