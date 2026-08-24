import type { SentinelClient } from '../supabase/client';

/** A GPS ping in the shape the ingest_locations RPC expects. */
export interface IngestPing {
  lng: number;
  lat: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
  batteryPct?: number;
  isMoving?: boolean;
  isMock?: boolean;
  /** ISO 8601 device timestamp. */
  recordedAt: string;
}

export interface IngestResult {
  accepted: number;
  lng?: number;
  lat?: number;
  events?: number;
}

/**
 * Call the server-authoritative ingest_locations RPC. The employee is pinned to
 * the caller's auth.uid() server-side, so a client can only submit its own
 * positions. The RPC isn't in the generated Function types yet, so the untyped
 * rpc call is contained here behind a typed surface.
 */
export async function ingestLocations(
  client: SentinelClient,
  pings: IngestPing[],
  shiftId?: string | null
): Promise<{ data: IngestResult | null; error: { message: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('ingest_locations', {
    p_pings: pings,
    p_shift: shiftId ?? null,
  });
  return { data: (data as IngestResult) ?? null, error: error ? { message: error.message } : null };
}
