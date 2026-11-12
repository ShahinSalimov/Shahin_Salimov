import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = join(import.meta.dirname, "..", "..");

function requireUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start a database with `scripts/test-db.sh start` and run " +
        "`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db`.",
    );
  }
  return url;
}

/** Creates a fresh database, applies the Supabase shim and every migration in order. */
export async function createTestDatabase(name: string): Promise<pg.Pool> {
  const adminUrl = new URL(requireUrl());
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 4 });

  await pool.query(readFileSync(join(ROOT, "tests/db/supabase-shim.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
  return pool;
}

export async function createAuthUser(pool: pg.Pool, email: string, fullName = email.split("@")[0]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id",
    [email, fullName],
  );
  return rows[0]!.id;
}

type Query = <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<pg.QueryResult<R>>;

/**
 * Runs `fn` inside a transaction as the Supabase `authenticated` role with the
 * given user id in the JWT claims — exactly how PostgREST executes requests.
 * The transaction is rolled back unless `commit` is true.
 */
export async function asUser<T>(pool: pg.Pool, userId: string | null, fn: (q: Query) => Promise<T>, commit = true): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const result = await fn((sql, params) => client.query(sql, params as unknown[]));
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Same as asUser but expects the callback to fail with a Postgres error; returns the error. */
export async function expectDbError(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("Expected a database error, but the operation succeeded");
}
