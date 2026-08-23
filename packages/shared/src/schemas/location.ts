import { z } from 'zod';

/** A single GPS ping as sent from the device (before server enrichment). */
export const locationPingSchema = z.object({
  /** Client-generated for idempotent offline sync. */
  clientRef: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().nonnegative().optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  batteryPct: z.number().int().min(0).max(100).optional(),
  isMoving: z.boolean().optional(),
  isMock: z.boolean().optional(),
  /** ISO timestamp from the device clock. */
  recordedAt: z.string().datetime(),
});

export type LocationPingInput = z.infer<typeof locationPingSchema>;

/** A batch of pings — the ingest Edge Function payload. */
export const locationBatchSchema = z.object({
  shiftId: z.string().uuid().nullable().optional(),
  pings: z.array(locationPingSchema).min(1).max(100),
});

export type LocationBatchInput = z.infer<typeof locationBatchSchema>;
