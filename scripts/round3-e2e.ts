import { spawn, type ChildProcess } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { agentOutputSchema } from "../src/lib/round3/envelope";

const PORT = Number(process.env.PREP_E2E_PORT || 3477);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();

type CaseResult = { name: string; http: number; message: string; pending: boolean };

const results: CaseResult[] = [];

function workOrder(unitId: string) {
  return {
    workOrderId: `WO-${unitId}`,
    unitId,
    sku: "SKU-GABANY",
    asin: "UNKNOWN",
    expectedFnsku: "NONE",
    requirements: {
      polybag: "UNKNOWN",
      suffocationWarning: "UNKNOWN",
      expiryDate: "UNKNOWN",
      handlingMarks: { state: "UNKNOWN", requiredMarks: [] },
    },
  };
}

function body(id: string, extra: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    request_id: id,
    workflow_id: `WF-${id}`,
    stage: "prep",
    subject: { org_id: "org_demo_alpha", subject_id: id },
    inputs: [],
    previous_evidence: [],
    context: {},
    ...extra,
  };
}

async function post(payload: unknown, raw?: string): Promise<{ http: number; json: Record<string, unknown> }> {
  const response = await fetch(`${BASE}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(payload),
  });
  const json = (await response.json()) as Record<string, unknown>;
  return { http: response.status, json };
}

function record(name: string, http: number, json: Record<string, unknown>, expectHttp = 200) {
  const parsed = agentOutputSchema.parse(json);
  const pending = parsed.status === "pending" && parsed.verdict === "UNCERTAIN" && parsed.evidence.decision.outcome === "review_required";
  if (!pending) throw new Error(`${name} was not a pending envelope`);
  if (!parsed.error?.message) throw new Error(`${name} had no error message`);
  if (http !== expectHttp) throw new Error(`${name} HTTP ${http}, expected ${expectHttp}`);
  results.push({ name, http, message: parsed.error.message, pending });
}

async function waitForHealth(child: ChildProcess) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) throw new Error(`Next server exited ${child.exitCode}. ${last}`);
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.status === 200) return (await response.json()) as Record<string, unknown>;
      last = `health ${response.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : "starting";
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`health did not return 200. ${last}`);
}

function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  const bin = path.join(ROOT, "node_modules", ".bin", "next");
  return spawn(bin, ["dev", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function childEnv(withKey: boolean, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.GEMINI_API_KEY;
  delete env.GOOGLE_API_KEY;
  if (!withKey) delete env.ANTHROPIC_API_KEY;
  return env;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function failureServer(jpeg: Buffer) {
  const child = startServer(childEnv(false, { PREP_E2E_FAULTS: "1", PREP_MAX_IMAGE_BYTES: "800" }));
  child.stdout?.on("data", () => undefined);
  child.stderr?.on("data", () => undefined);
  try {
    const health = await waitForHealth(child);
    if (health.provider !== "claude") throw new Error("health provider was not claude");
    if (health.anthropic_key_present !== false) throw new Error("failure server saw a key");
    if (health.ok !== true) throw new Error("health ok was not true");
    results.push({ name: "health degraded without key", http: 200, message: `degraded=${health.degraded} db=${health.db_reachable}`, pending: true });

    const bad = await post(null, "{");
    record("malformed JSON", bad.http, bad.json);

    const stage = await post(body("e2e-stage", { stage: "pack" }));
    record("wrong stage", stage.http, stage.json);

    const org = await post(body("e2e-org", { subject: { org_id: "org_other", subject_id: "e2e-org" } }));
    record("unknown org", org.http, org.json, 404);

    const three = [1, 2, 3].map((n) => ({ ref: `v${n}.jpg`, media_type: "image/jpeg", data_base64: jpeg.toString("base64") }));
    const order = await post(body("e2e-no-order", { inputs: three }));
    record("unknown work order", order.http, order.json);

    const zero = await post(body("e2e-zero"));
    record("zero photos", zero.http, zero.json);

    const one64 = await post(body("e2e-b64", { inputs: [{ ref: "only.jpg", media_type: "image/jpeg", data_base64: jpeg.toString("base64") }] }));
    record("one photo data_base64", one64.http, one64.json);

    const photoPath = path.join(ROOT, "public", "round3-pixel.jpg");
    const onePath = await post(body("e2e-path-pixel", { inputs: [{ ref: photoPath, media_type: "image/jpeg" }] }));
    record("one photo file path", onePath.http, onePath.json);

    const oneUrl = await post(body("e2e-url", { inputs: [{ ref: "pixel.jpg", url: `${BASE}/round3-pixel.jpg` }] }));
    record("one photo url", oneUrl.http, oneUrl.json);

    const padded = Buffer.concat([jpeg, Buffer.alloc(900)]);
    const oversized = await post(body("e2e-big", { inputs: [{ ref: "big.jpg", data_base64: padded.toString("base64") }] }));
    record("oversized photo", oversized.http, oversized.json);

    const text = await post(body("e2e-text", { inputs: [{ ref: "notes.txt", data_base64: Buffer.from("this is not an image").toString("base64") }] }));
    record("non-image bytes", text.http, text.json);

    const missingKey = await post(body("e2e-key", { inputs: three, context: { work_order: workOrder("e2e-key") } }));
    record("missing API key", missingKey.http, missingKey.json);

    for (const fault of ["claude_timeout", "claude_non_json", "claude_zod"] as const) {
      const faulted = await post(body(`e2e-${fault}`, { context: { round3_fault: fault } }));
      record(fault, faulted.http, faulted.json);
    }
  } finally {
    await stop(child);
  }
}

async function liveServer() {
  if (process.env.PREP_E2E_SKIP_LIVE === "1") {
    console.log(JSON.stringify({ failure_cases: results, live: "skipped" }, null, 2));
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const child = startServer(childEnv(true));
  child.stdout?.on("data", () => undefined);
  child.stderr?.on("data", () => undefined);
  try {
    const health = await waitForHealth(child);
    if (health.provider !== "claude" || health.anthropic_key_present !== true) {
      throw new Error("live health did not report claude with a key present");
    }
    const dir = path.join(ROOT, "fixtures", "prep", "real", "PRODUCT-13");
    const inputs = [];
    for (const name of ["front.jpeg", "back.jpeg", "label.jpeg"]) {
      inputs.push({
        ref: name,
        media_type: "image/jpeg",
        data_base64: (await readFile(path.join(dir, name))).toString("base64"),
      });
    }
    const request = body("PRODUCT-13", {
      workflow_id: "WF-org_demo_alpha-PRODUCT-13",
      context: { work_order: workOrder("PRODUCT-13") },
      inputs,
    });
    const live = await post(request);
    const output = agentOutputSchema.parse(live.json);
    if (live.http !== 200) throw new Error(`live HTTP ${live.http}`);
    if (output.error) throw new Error(`live call fail-opened: ${output.error.message}`);
    if (output.model.calls !== 1) throw new Error(`expected 1 model call, got ${output.model.calls}`);
    const recordPath = path.join(ROOT, "data", "round3-evidence", `${output.evidence.record_id}.json`);
    const before = await stat(recordPath);
    const stored = agentOutputSchema.parse(JSON.parse(await readFile(recordPath, "utf8")));
    if (stored.evidence.content_hash !== output.evidence.content_hash) throw new Error("disk content_hash does not match");
    const again = await post(request);
    const second = agentOutputSchema.parse(again.json);
    if (second.evidence.record_id !== output.evidence.record_id || second.evidence.content_hash !== output.evidence.content_hash) {
      throw new Error("duplicate request was not idempotent");
    }
    const after = await stat(recordPath);
    if (after.mtimeMs !== before.mtimeMs) throw new Error("duplicate request rewrote the evidence file");
    const observed = (output.evidence as { payload?: { observed?: unknown } }).payload?.observed;
    console.log(JSON.stringify({
      failure_cases: results,
      live: {
        http: live.http,
        status: output.status,
        verdict: output.verdict,
        outcome: output.evidence.decision.outcome,
        model: output.model.name,
        version: output.model.version,
        calls: output.model.calls,
        checks: output.evidence.checks.length,
        record_id: output.evidence.record_id,
        content_hash: output.evidence.content_hash,
        observed,
        health,
      },
    }, null, 2));
  } finally {
    await stop(child);
  }
}

async function main() {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 20, b: 20 } },
  }).jpeg().toBuffer();
  if (jpeg.length >= 800) throw new Error("pixel jpeg unexpectedly large");
  await mkdir(path.join(ROOT, "public"), { recursive: true });
  await writeFile(path.join(ROOT, "public", "round3-pixel.jpg"), jpeg);
  await failureServer(jpeg);
  await liveServer();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "e2e failed");
  if (results.length) console.error(JSON.stringify(results, null, 2));
  process.exit(1);
});
