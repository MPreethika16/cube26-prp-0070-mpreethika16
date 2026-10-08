import { readFileSync } from "fs";
import path from "path";
import { PREP_AGENT_ID } from "./agent-output";
import { evidenceDirWritable } from "./persist";

export const PREP_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export async function isDatabaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 800,
    });
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  } catch {
    return false;
  }
}

export async function buildHealthReport() {
  const anthropicKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY);
  const [dbReachable, writable] = await Promise.all([isDatabaseReachable(), evidenceDirWritable()]);
  const version = readPackageVersion();
  const degraded = !anthropicKeyPresent || !dbReachable || !writable;
  return {
    ok: true,
    degraded,
    stage: "prep",
    agent_id: PREP_AGENT_ID,
    version,
    provider: "claude",
    model: PREP_MODEL,
    anthropic_key_present: anthropicKeyPresent,
    db_reachable: dbReachable,
    evidence_dir_writable: writable,
    round3: { run: "/run", also: "/api/run", contract: "agent-output/evidence v1.0" },
  };
}

function readPackageVersion(): string {
  try {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return raw.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
