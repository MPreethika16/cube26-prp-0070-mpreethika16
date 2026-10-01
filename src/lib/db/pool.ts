import { Pool, type PoolConfig } from "pg";

let pool: Pool | null = null;

export function getDatabasePool(configOverride?: PoolConfig): Pool {
  if (pool) return pool;

  const connectionString =
    process.env.DATABASE_URL ||
    "postgresql://prep_app:prep_app_secure_pass_2026@localhost:5434/prep_manager";

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...configOverride,
  });

  pool.on("error", (err) => {
    console.error("[PostgreSQL Pool] Unexpected error on idle client", err);
  });

  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
