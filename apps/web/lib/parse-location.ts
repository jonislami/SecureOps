/**
 * Parse a pasted location into { lat, lng }. Accepts, in priority order:
 *   1. Google Maps URL data: `!3d<lat>!4d<lng>` (the exact pin)
 *   2. Google Maps URL `@lat,lng`
 *   3. URL query coords: `?q=lat,lng`, `ll=`, `query=`, `destination=`
 *   4. DMS with hemisphere: `42°22'14.2"N 21°09'19.1"E`
 *   5. Decimal degrees with hemisphere: `42.37° N, 21.15° E`
 *   6. Plain decimal pair: `42.370611, 21.155306`
 * Short links (maps.app.goo.gl / goo.gl) contain no coords — detect with
 * isShortMapLink() and resolve them server-side first.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function isShortMapLink(s: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|app\.goo\.gl)/i.test(s.trim());
}

export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function parseDmsOrDecimalDir(s: string): LatLng | null {
  // DMS: 42°22'14.2"N   (seconds optional)
  const dms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′]\s*([\d.]+)?\s*["″]?\s*([NSEW])/gi)];
  const collect = (arr: { deg: number; dir: string }[]): LatLng | null => {
    let lat: number | undefined;
    let lng: number | undefined;
    for (const p of arr) {
      if (p.dir === 'N') lat = p.deg;
      else if (p.dir === 'S') lat = -p.deg;
      else if (p.dir === 'E') lng = p.deg;
      else if (p.dir === 'W') lng = -p.deg;
    }
    return lat != null && lng != null ? valid(lat, lng) : null;
  };
  if (dms.length >= 2) {
    return collect(dms.map((m) => ({ deg: +m[1] + +m[2] / 60 + +(m[3] || 0) / 3600, dir: m[4].toUpperCase() })));
  }
  // Decimal degrees with hemisphere: 42.37° N or 42.37 N
  const dd = [...s.matchAll(/(-?\d+(?:\.\d+)?)\s*[°º]?\s*([NSEW])/gi)];
  if (dd.length >= 2) {
    return collect(dd.map((m) => ({ deg: Math.abs(+m[1]), dir: m[2].toUpperCase() })));
  }
  return null;
}

export function parseCoordsFromText(text: string): LatLng | null {
  const s = text.trim();
  if (!s) return null;

  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return valid(+m[1], +m[2]);

  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return valid(+m[1], +m[2]);

  m = s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
  if (m) return valid(+m[1], +m[2]);

  const dir = parseDmsOrDecimalDir(s);
  if (dir) return dir;

  // Plain decimal pair (not a URL) — "42.37, 21.15" or "42.37 21.15"
  if (!looksLikeUrl(s)) {
    m = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (m) return valid(+m[1], +m[2]);
  }
  return null;
}
