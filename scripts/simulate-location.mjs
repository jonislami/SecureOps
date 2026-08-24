#!/usr/bin/env node
/**
 * Location simulator — signs in as a user and pushes a moving GPS position
 * every few seconds through the ingest_locations RPC, so you can watch a dot
 * move on the web live map (/map) before the real mobile GPS exists.
 *
 * Usage:
 *   node scripts/simulate-location.mjs <email> <password> [lng] [lat]
 *   node scripts/simulate-location.mjs guard@company.com pass123
 *
 * Ctrl+C to stop.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const [email, password, lng0, lat0] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/simulate-location.mjs <email> <password> [lng] [lat]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY missing from .env');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
if (signInErr) {
  console.error('Sign-in failed:', signInErr.message);
  process.exit(1);
}
console.log(`Signed in as ${auth.user?.email} (${auth.user?.id}).`);

// Start position (default: central Ferizaj, Kosovo — the company's base).
let lng = lng0 ? Number(lng0) : 21.1553;
let lat = lat0 ? Number(lat0) : 42.3706;
let heading = Math.random() * 360;

const INTERVAL_MS = 3000;
console.log(`Pushing a position every ${INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
console.log('Open the web app -> Live Map (/map) to watch it move.\n');

async function tick() {
  // Random-walk: nudge heading, step ~15 m.
  heading += (Math.random() - 0.5) * 40;
  const stepDeg = 0.00015; // ~15 m
  lng += Math.cos((heading * Math.PI) / 180) * stepDeg;
  lat += Math.sin((heading * Math.PI) / 180) * stepDeg;

  const pings = [
    {
      lng,
      lat,
      accuracyM: 5 + Math.random() * 5,
      speedMps: 1 + Math.random(),
      headingDeg: ((heading % 360) + 360) % 360,
      batteryPct: 85,
      isMoving: true,
      isMock: false,
      recordedAt: new Date().toISOString(),
    },
  ];

  const { data, error } = await supabase.rpc('ingest_locations', { p_pings: pings, p_shift: null });
  if (error) console.error('ingest error:', error.message);
  else
    console.log(
      `→ ${new Date().toLocaleTimeString()}  lng=${lng.toFixed(5)} lat=${lat.toFixed(5)}  ${JSON.stringify(data)}`
    );
}

await tick();
const timer = setInterval(tick, INTERVAL_MS);
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nStopped.');
  process.exit(0);
});
