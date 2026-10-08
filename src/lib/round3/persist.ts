import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { constants } from "fs";

export function evidenceDir(): string {
  return process.env.PREP_EVIDENCE_DIR || path.join(process.cwd(), "data", "round3-evidence");
}

export function evidenceFile(recordId: string): string {
  const safe = recordId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(evidenceDir(), `${safe}.json`);
}

/** Creates the directory when it is missing. A database failure must not block this write. */
export async function persistRound3Evidence(recordId: string, body: unknown): Promise<string> {
  const dir = evidenceDir();
  await mkdir(dir, { recursive: true });
  const file = evidenceFile(recordId);
  await writeFile(file, JSON.stringify(body, null, 2));
  await noteDatabaseCopy(recordId);
  return file;
}

export async function readRound3Evidence(recordId: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(evidenceFile(recordId), "utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function evidenceDirWritable(): Promise<boolean> {
  try {
    const dir = evidenceDir();
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function noteDatabaseCopy(recordId: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { getDatabasePool } = await import("../db/pool");
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      await client.query(
        "INSERT INTO round3_evidence (record_id, body) VALUES ($1, $2::jsonb) ON CONFLICT (record_id) DO NOTHING",
        [recordId, JSON.stringify({ record_id: recordId })]
      );
    } finally {
      client.release();
    }
  } catch {
    /* Disk already has the record. Postgres is optional. */
  }
}
