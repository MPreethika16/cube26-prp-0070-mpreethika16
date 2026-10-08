import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { toPrepAgentOutput } from "../../src/lib/round3/agent-output";
import { assertPendingEnvelope } from "../../src/lib/round3/envelope";
import { buildHealthReport } from "../../src/lib/round3/health";
import { evidenceFile } from "../../src/lib/round3/persist";
import { handlePrepRound3, unparsedBodyOutput } from "../../src/lib/round3/run";
import { analyzePrepUnitWithClaude } from "../../src/lib/vision/claude-observer";
import { readFile } from "fs/promises";

process.env.PREP_EVIDENCE_DIR = mkdtempSync(path.join(tmpdir(), "prep-r3-"));

const jpegPromise = sharp({
  create: { width: 2, height: 2, channels: 3, background: { r: 180, g: 20, b: 20 } },
}).jpeg().toBuffer();

function workOrder(unitId: string) {
  return {
    workOrderId: `WO-${unitId}`,
    unitId,
    sku: "SKU",
    asin: "ASIN",
    expectedFnsku: "NONE",
    requirements: {
      polybag: "UNKNOWN" as const,
      suffocationWarning: "UNKNOWN" as const,
      expiryDate: "UNKNOWN" as const,
      handlingMarks: { state: "UNKNOWN" as const, requiredMarks: [] as string[] },
    },
  };
}

function input(id: string, extra: Record<string, unknown> = {}) {
  return {
    request_id: id,
    workflow_id: `WF-${id}`,
    stage: "prep",
    subject: { org_id: "org_demo_alpha", subject_id: id },
    inputs: [],
    context: {},
    ...extra,
  };
}

describe("Prep Round 3 failure modes", () => {
  it("keeps a stable content hash when only the clock changes", () => {
    const args = {
      input: input("hash-unit"),
      inspection: {
        inspectionId: "ins",
        checks: [],
        sku: "SKU",
        asin: "ASIN",
        workOrderId: "WO",
        metadata: { inspectedAt: "2026-10-08T00:00:00.000Z" },
      } as never,
      operational: {
        status: "REVIEW_REQUIRED" as const,
        passCount: 0,
        failCount: 0,
        uncertainCount: 0,
        notApplicableCount: 0,
        blockingCheckTypes: [],
        uncertainCheckTypes: [],
      },
      modelName: "none",
      calls: 0,
      latencyMs: 5,
      inputRefs: [],
      failOpen: { message: "held", retryable: true },
    };
    const first = toPrepAgentOutput(args);
    const second = toPrepAgentOutput({ ...args, latencyMs: 99 });
    assert.equal(first.evidence.content_hash, second.evidence.content_hash);
    assert.equal(first.evidence.content_hash.length, 64);
  });

  it("returns a pending envelope for an unparsed body, the wrong stage, and an unknown org", async () => {
    assertPendingEnvelope(unparsedBodyOutput());
    const stage = await handlePrepRound3(input("stage-unit", { stage: "pack" }));
    assert.equal(stage.httpStatus, 200);
    assert.match(assertPendingEnvelope(stage.output).error!.message, /stage must be prep/);
    const org = await handlePrepRound3(input("org-unit", { subject: { org_id: "org_other", subject_id: "org-unit" } }));
    assert.equal(org.httpStatus, 404);
    assert.equal(assertPendingEnvelope(org.output).error!.message, "unknown tenant");
  });

  it("fail-opens before any model call for photos, work orders, and a missing key", async () => {
    const jpeg = await jpegPromise;
    const none = await handlePrepRound3(input("no-photo"));
    assert.match(assertPendingEnvelope(none.output).error!.message, /0 usable photo/);

    const one = await handlePrepRound3(input("one-photo", {
      inputs: [{ ref: "only.jpg", media_type: "image/jpeg", data_base64: jpeg.toString("base64") }],
    }));
    assert.match(assertPendingEnvelope(one.output).error!.message, /1 usable photo/);

    const missingOrder = await handlePrepRound3(input("missing-order", {
      inputs: [1, 2, 3].map((n) => ({ ref: `v${n}.jpg`, media_type: "image/jpeg", data_base64: jpeg.toString("base64") })),
    }));
    assert.match(assertPendingEnvelope(missingOrder.output).error!.message, /No work order/);

    const previousKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const missingKey = await handlePrepRound3(input("missing-key", {
        inputs: [1, 2, 3].map((n) => ({ ref: `k${n}.jpg`, media_type: "image/jpeg", data_base64: jpeg.toString("base64") })),
        context: { work_order: workOrder("missing-key") },
      }));
      assert.match(assertPendingEnvelope(missingKey.output).error!.message, /ANTHROPIC_API_KEY is not set/);
    } finally {
      if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;
    }

    const garbage = await handlePrepRound3(input("garbage", {
      inputs: [{ ref: "notes.txt", data_base64: Buffer.from("this is not an image").toString("base64") }],
    }));
    assert.match(assertPendingEnvelope(garbage.output).error!.message, /not a JPEG/);

    const previousMax = process.env.PREP_MAX_IMAGE_BYTES;
    process.env.PREP_MAX_IMAGE_BYTES = "40";
    try {
      const huge = await handlePrepRound3(input("huge", {
        inputs: [{ ref: "big.jpg", data_base64: jpeg.toString("base64") }],
      }));
      assert.match(assertPendingEnvelope(huge.output).error!.message, /exceeds the 40 byte limit/);
    } finally {
      if (previousMax === undefined) delete process.env.PREP_MAX_IMAGE_BYTES;
      else process.env.PREP_MAX_IMAGE_BYTES = previousMax;
    }
  });

  it("accepts one photo from a file path and treats a dead URL as pending", async () => {
    const jpeg = await jpegPromise;
    const file = path.join(process.env.PREP_EVIDENCE_DIR!, "one.jpg");
    const { writeFile } = await import("fs/promises");
    await writeFile(file, jpeg);
    const fromPath = await handlePrepRound3(input("from-path", { inputs: [{ ref: file, media_type: "image/jpeg" }] }));
    assert.match(assertPendingEnvelope(fromPath.output).error!.message, /1 usable photo/);

    const fromUrl = await handlePrepRound3(input("from-url", { inputs: [{ url: "http://127.0.0.1:1/missing.jpg", ref: "remote.jpg" }] }));
    const urlMessage = assertPendingEnvelope(fromUrl.output).error!.message;
    assert.equal(urlMessage.includes("ANTHROPIC") || urlMessage.includes("Claude"), false);
    assert.ok(urlMessage.length > 8);
  });

  it("is idempotent for the same request and creates a missing evidence directory", async () => {
    const body = input("idem-unit");
    const first = await handlePrepRound3(body);
    const second = await handlePrepRound3(body);
    assert.deepEqual(second.output, first.output);
    const file = evidenceFile(first.output.evidence.record_id);
    const stored = JSON.parse(await readFile(file, "utf8"));
    assert.equal(stored.evidence.content_hash, first.output.evidence.content_hash);
  });

  it("turns Claude timeout, non-JSON, and schema rejection into errors the run can fail-open", async () => {
    const jpeg = await jpegPromise;
    const images = [{ imageId: "front.jpg", mimeType: "image/jpeg", imageData: jpeg }];
    const hang = new Promise<Response>(() => {});
    await assert.rejects(
      () => analyzePrepUnitWithClaude("T", images, { apiKey: "not-a-live-key", timeoutMs: 30, fetchImpl: () => hang }),
      /timed out after 30ms/
    );
    await assert.rejects(
      () => analyzePrepUnitWithClaude("T", images, {
        apiKey: "not-a-live-key",
        fetchImpl: async () => new Response("nope", { status: 200, headers: { "content-type": "text/plain" } }),
      }),
      /non-JSON/
    );
    await assert.rejects(
      () => analyzePrepUnitWithClaude("T", images, {
        apiKey: "not-a-live-key",
        fetchImpl: async () => new Response(JSON.stringify({
          content: [{ type: "tool_use", name: "record_observation", input: { unitId: "T" } }],
        }), { status: 200 }),
      }),
      /did not match the observation schema/
    );
  });

  it("reports health as 200-shaped even when the database is down", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const health = await buildHealthReport();
      assert.equal(health.ok, true);
      assert.equal(health.provider, "claude");
      assert.equal(health.db_reachable, false);
      assert.equal(typeof health.anthropic_key_present, "boolean");
      assert.equal(health.evidence_dir_writable, true);
      assert.equal(health.degraded, true);
    } finally {
      if (previous) process.env.DATABASE_URL = previous;
    }
  });
});
