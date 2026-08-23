#!/usr/bin/env node
/**
 * Minimal, dependency-light migration runner for the Sentinel database.
 *
 * Applies every SQL file in supabase/migrations/ (sorted by filename) that has
 * not yet been recorded in the public.schema_migrations table, each inside its
 * own transaction. Safe to re-run: already-applied migrations are skipped.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres:PW@db.<ref>.supabase.co:5432/postgres" \
 *     node scripts/db-migrate.mjs
 *
 * Or put SUPABASE_DB_URL in .env (gitignored) and run: node scripts/db-migrate.mjs
 *
 * Requires the `pg` package (npm install pg).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

// Load .env if present (no dotenv dependency).
try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* no .env — rely on real env */
}

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    'ERROR: SUPABASE_DB_URL not set.\n' +
      'Get it from Supabase Dashboard -> Settings -> Database -> Connection string (URI),\n' +
      'add it to .env, then re-run.'
  );
  process.exit(1);
}

let pg;
try {
  pg = await import('pg');
} catch {
  console.error('ERROR: the "pg" package is not installed. Run: npm install pg');
  process.exit(1);
}

const { Client } = pg.default ?? pg;
const client = new Client({
  connectionString,
  // Supabase requires TLS; the pooler cert chain is standard.
  ssl: { rejectUnauthorized: false },
});

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

await client.connect();
try {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query('select filename from public.schema_migrations')).rows.map(
      (r) => r.filename
    )
  );

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip   ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    process.stdout.write(`  apply  ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations(filename) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
      count++;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\nMigration ${file} failed:\n${err.message}\n`);
      process.exit(1);
    }
  }
  console.log(`\nDone. ${count} migration(s) applied, ${files.length - count} already up to date.`);
} finally {
  await client.end();
}
