#!/usr/bin/env node
/**
 * Auto-migration runner for Supabase (multi-clinic distribution).
 *
 * Reads SQL files from supabase/migrations/, tracks applied ones in
 * public.__applied_migrations, and applies any pending files in alphabetical
 * order inside per-file transactions.
 *
 * Designed to run as part of `next build` so each clinic's Vercel deployment
 * keeps its own Supabase schema in sync automatically.
 *
 * Behavior:
 *   - SUPABASE_DB_URL not set       → skip silently (local dev / PR preview).
 *   - First run on a clinic         → mark all migrations dated before
 *                                     BASELINE_BEFORE as already-applied
 *                                     (assumes they were run manually before
 *                                     this script existed). Only newer files
 *                                     are actually executed.
 *   - Subsequent runs               → only new files get executed.
 *   - Any migration fails           → ROLLBACK that file, abort build.
 *
 * Required env var (set per clinic in Vercel):
 *   SUPABASE_DB_URL  Postgres connection string.
 *                    Format: postgresql://postgres.<project-ref>:<password>@
 *                            aws-0-<region>.pooler.supabase.com:5432/postgres
 *                    (Use the "Session pooler" string from Supabase dashboard
 *                     → Project Settings → Database → Connection string)
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// ── Config ──────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");
const TRACKING_TABLE = "__applied_migrations";

// Migration files dated strictly BEFORE this prefix are treated as
// already-applied on first run (they were applied manually pre-script).
// Bump this only when introducing a new "pre-applied" baseline.
const BASELINE_BEFORE = "20260428010000";

const STATEMENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per migration file

// ── Entry guard ─────────────────────────────────────────
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.log("[migrate] SUPABASE_DB_URL not set — skipping schema migration.");
  console.log("[migrate] (Normal for local dev. In Vercel, set SUPABASE_DB_URL per clinic.)");
  process.exit(0);
}

// ── Main ────────────────────────────────────────────────
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  statement_timeout: STATEMENT_TIMEOUT_MS,
});

main()
  .then(async () => {
    await client.end().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[migrate] FATAL:", err.message);
    if (err.detail) console.error("[migrate] detail:", err.detail);
    if (err.hint) console.error("[migrate] hint:", err.hint);
    if (err.position) console.error("[migrate] position:", err.position);
    await client.end().catch(() => {});
    process.exit(1);
  });

async function main() {
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (allFiles.length === 0) {
    console.log("[migrate] No migration files found, nothing to do.");
    return;
  }

  await client.connect();
  console.log(`[migrate] Connected to ${maskUrl(dbUrl)}`);
  console.log(`[migrate] Found ${allFiles.length} migration file(s) in repo`);

  // 1. Ensure tracking table exists.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${TRACKING_TABLE} (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by TEXT,
      checksum   TEXT
    )
  `);

  // 2. Read which files have already been applied.
  const { rows: appliedRows } = await client.query(
    `SELECT filename FROM public.${TRACKING_TABLE}`
  );
  const applied = new Set(appliedRows.map((r) => r.filename));

  // 3. First-run baseline: if the table is empty, treat older files as
  //    "already applied manually" so we don't re-run 30+ existing migrations.
  if (applied.size === 0) {
    const baselineFiles = allFiles.filter((f) => f < BASELINE_BEFORE);
    if (baselineFiles.length > 0) {
      console.log(
        `[migrate] First run on this DB. Marking ${baselineFiles.length} pre-existing migration(s) as baseline (not re-executed):`
      );
      for (const f of baselineFiles) {
        await client.query(
          `INSERT INTO public.${TRACKING_TABLE} (filename, applied_by) VALUES ($1, 'baseline-import') ON CONFLICT DO NOTHING`,
          [f]
        );
        applied.add(f);
        console.log(`           - ${f} (baseline)`);
      }
    }
  }

  // 4. Compute pending list.
  const pending = allFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("[migrate] ✓ All migrations are up to date");
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s) to apply:`);
  for (const f of pending) console.log(`           - ${f}`);

  // 5. Apply each pending file in its own transaction.
  for (const file of pending) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, "utf-8");
    const checksum = simpleHash(sql);

    console.log(`[migrate] Applying ${file} (${sql.length} bytes)...`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO public.${TRACKING_TABLE} (filename, applied_by, checksum) VALUES ($1, 'auto-build', $2)`,
        [file, checksum]
      );
      await client.query("COMMIT");
      console.log(`[migrate] ✓ ${file}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[migrate] ✗ ${file} failed — rolling back this file`);
      throw err;
    }
  }

  console.log(`[migrate] ✓ Done. Applied ${pending.length} new migration(s).`);
}

// ── Helpers ─────────────────────────────────────────────
function maskUrl(url) {
  return url.replace(/:[^:@/]+@/, ":****@");
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
