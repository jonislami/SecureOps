'use server';

import { parseCoordsFromText, type LatLng } from '@/lib/parse-location';

/**
 * Resolve a short Google Maps link (maps.app.goo.gl / goo.gl) to coordinates by
 * following its redirect server-side (CORS blocks this in the browser) and
 * parsing the expanded URL / page. Returns coords or an error message.
 */
export async function resolveMapLink(
  url: string
): Promise<{ ok: true; coords: LatLng } | { ok: false; error: string }> {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    return { ok: false, error: 'That does not look like a link.' };
  }
  try {
    const res = await fetch(clean, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Sentinel/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    // 1. The expanded final URL usually carries the coordinates.
    let coords = parseCoordsFromText(res.url);
    if (!coords) {
      // 2. Fall back to scanning the page body for !3d…!4d or @lat,lng.
      const body = await res.text();
      coords = parseCoordsFromText(body);
    }
    if (!coords) {
      return {
        ok: false,
        error:
          'Could not read coordinates from that link. Open it in Google Maps, long-press the pin, and paste the coordinates instead.',
      };
    }
    return { ok: true, coords };
  } catch {
    return { ok: false, error: 'Could not open that link. Paste the coordinates instead.' };
  }
}
