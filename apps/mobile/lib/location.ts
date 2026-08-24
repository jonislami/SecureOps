import * as Location from 'expo-location';
import { ingestLocations, type IngestPing } from '@sentinel/shared';
import { supabase } from './supabase';

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

/**
 * Start sharing the device's foreground location: every ~10 s (or 10 m of
 * movement) send a real GPS ping through the server-authoritative ingest RPC.
 * Foreground-only (Expo Go); true background tracking needs an EAS dev build.
 */
export async function startSharing(
  onUpdate?: (u: ShareUpdate) => void
): Promise<{ ok: boolean; reason?: string }> {
  const granted = await requestForegroundPermission();
  if (!granted) return { ok: false, reason: 'Location permission denied' };
  if (subscription) return { ok: true };

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
      const { error } = await ingestLocations(supabase, [ping], null);
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
}

export function isSharing(): boolean {
  return subscription !== null;
}
