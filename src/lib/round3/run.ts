import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { analyzePrepUnit } from "../vision/analyze-prep-unit";
import { ACTIVE_RULES, PRODUCTION_POLICY_CONTEXT } from "../compliance/rules/active-rules";
import { runPrepInspection } from "../inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../inspection/operational-status";
import { resolveWorkOrderForUnit } from "../inspection/work-order-resolver";
import { isValidOrgId } from "../db/tenant-context";
import { workOrderSpecificationSchema } from "../compliance/work-order.schema";
import { recordIdFor, toPrepAgentOutput, type PrepRound3Input } from "./agent-output";
import { assertPendingEnvelope, agentOutputSchema, type AgentOutput } from "./envelope";
import { persistRound3Evidence, readRound3Evidence } from "./persist";

const DEMO_ORGS = new Set(["org_demo_alpha", "org_demo_bravo"]);
export const REQUIRED_PHOTO_COUNT = 3;
export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class Round3HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type Round3HandlerResult = { httpStatus: number; output: AgentOutput };

export function maxImageBytes(): number {
  const configured = Number(process.env.PREP_MAX_IMAGE_BYTES || DEFAULT_MAX_IMAGE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_IMAGE_BYTES;
}

export function publicErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "prep observation failed";
  return message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}

export function coerceRound3Input(raw: unknown): PrepRound3Input {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const subject = obj.subject && typeof obj.subject === "object" ? (obj.subject as Record<string, unknown>) : {};
  return {
    schema_version: typeof obj.schema_version === "string" ? obj.schema_version : undefined,
    request_id: typeof obj.request_id === "string" && obj.request_id ? obj.request_id : "UNRESOLVED",
    workflow_id: typeof obj.workflow_id === "string" && obj.workflow_id ? obj.workflow_id : "UNRESOLVED",
    stage: typeof obj.stage === "string" ? obj.stage : undefined,
    subject: {
      org_id: typeof subject.org_id === "string" && subject.org_id ? subject.org_id : "unknown",
      subject_id: typeof subject.subject_id === "string" && subject.subject_id ? subject.subject_id : "UNRESOLVED",
    },
    inputs: Array.isArray(obj.inputs) ? (obj.inputs as PrepRound3Input["inputs"]) : [],
    previous_evidence: Array.isArray(obj.previous_evidence)
      ? (obj.previous_evidence as PrepRound3Input["previous_evidence"])
      : [],
    context: obj.context && typeof obj.context === "object" ? (obj.context as Record<string, unknown>) : {},
  };
}

export function unparsedBodyOutput(): AgentOutput {
  return assertPendingEnvelope(
    pending(coerceRound3Input({}), "Request body was not valid JSON.", false)
  );
}

/**
 * Idempotent on request_id + org_id + subject_id.
 * A repeat returns the stored Agent Output and does not call Claude again.
 * Unknown tenants are HTTP 404 with the same pending envelope shape.
 */
export async function handlePrepRound3(raw: unknown): Promise<Round3HandlerResult> {
  const input = coerceRound3Input(raw);
  if (!hasRequiredIds(raw)) {
    return await done(422, pending(input, "request_id, workflow_id, subject.org_id, and subject.subject_id are required", false));
  }
  if (input.stage && input.stage !== "prep") {
    return await done(422, pending(input, "stage must be prep", false));
  }
  if (!DEMO_ORGS.has(input.subject.org_id) || !isValidOrgId(input.subject.org_id)) {
    return await done(404, pending(input, "unknown tenant", false));
  }

  const cached = await readRound3Evidence(recordIdFor(input.request_id, input.subject.org_id, input.subject.subject_id));
  if (cached) {
    const parsed = agentOutputSchema.safeParse(cached);
    if (parsed.success) return { httpStatus: parsed.data.status === "pending" && parsed.data.error?.message === "unknown tenant" ? 404 : 200, output: parsed.data };
  }

  const fault = faultMessage(input);
  if (fault) return await done(200, pending(input, fault, true));

  try {
    const loaded = await loadPhotos(input);
    if (loaded.problems.length || loaded.photos.length !== REQUIRED_PHOTO_COUNT) {
      const reason = loaded.problems[0]
        || `Prep received ${loaded.photos.length} usable photo(s). Front, back, and label are required, so observation was not run.`;
      return await done(200, pending(input, reason, true));
    }
    const workOrder = resolveWorkOrder(input);
    if (!workOrder) {
      return await done(200, pending(input, "No work order could be resolved for this unit", true));
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return await done(200, pending(input, "ANTHROPIC_API_KEY is not set. Round 3 Prep observation uses this key, not a Gemini key.", true));
    }

    const vision = await analyzePrepUnit(workOrder.unitId, loaded.photos, { provider: "claude" });
    const inspection = runPrepInspection({
      observation: vision.observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
      metadata: {
        inspectedAt: new Date().toISOString(),
        visionModel: vision.metadata.model,
        visionRequestCount: vision.metadata.requestCount,
      },
    });
    const operational = aggregateOperationalStatus(inspection);
    const output = toPrepAgentOutput({
      input,
      inspection,
      operational,
      modelName: vision.metadata.model,
      calls: 1,
      latencyMs: vision.metadata.durationMs,
      inputRefs: loaded.photos.map((photo) => ({
        ref: photo.imageId,
        sha256: createHash("sha256").update(photo.imageData).digest("hex"),
      })),
      observed: {
        manufacturer_barcode_visibility: vision.observation.manufacturerBarcode.visibility,
        manufacturer_barcode_value: vision.observation.manufacturerBarcode.detectedValue,
        fnsku_visibility: vision.observation.fnsku.visibility,
        fnsku_value: vision.observation.fnsku.detectedValue,
        expiry_visibility: vision.observation.expiryDate.visibility,
        expiry_value: vision.observation.expiryDate.detectedValue,
        handling: vision.observation.handlingMarks
          .filter((mark) => mark.visibility === "VISIBLE")
          .map((mark) => mark.detectedText || mark.detectedType),
      },
    });
    await persistRound3Evidence(output.evidence.record_id, output);
    return { httpStatus: 200, output: agentOutputSchema.parse(output) };
  } catch (err) {
    return await done(200, pending(input, publicErrorMessage(err), true));
  }
}

export async function runPrepRound3(input: PrepRound3Input) {
  const result = await handlePrepRound3(input);
  return result.output;
}

export function failOpenPrepRound3(input: PrepRound3Input, message: string) {
  return pending(input, message, true);
}

async function done(httpStatus: number, output: ReturnType<typeof pending>): Promise<Round3HandlerResult> {
  const parsed = agentOutputSchema.parse(output);
  await persistRound3Evidence(parsed.evidence.record_id, parsed);
  return { httpStatus, output: parsed };
}

function hasRequiredIds(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  const subject = obj.subject && typeof obj.subject === "object" ? (obj.subject as Record<string, unknown>) : {};
  return Boolean(obj.request_id && obj.workflow_id && subject.org_id && subject.subject_id);
}

function faultMessage(input: PrepRound3Input): string | null {
  if (process.env.PREP_E2E_FAULTS !== "1") return null;
  const fault = input.context?.round3_fault;
  if (fault === "claude_timeout") return "Claude observation timed out after 45000ms";
  if (fault === "claude_non_json") return "Claude observation returned no record_observation tool call";
  if (fault === "claude_zod") return "Claude observation did not match the observation schema";
  if (fault === "db_down") return null;
  return null;
}

function resolveWorkOrder(input: PrepRound3Input) {
  const fromContext = input.context?.work_order;
  if (fromContext) {
    const parsed = workOrderSpecificationSchema.safeParse(fromContext);
    if (parsed.success && parsed.data.unitId === input.subject.subject_id) return parsed.data;
  }
  try {
    return resolveWorkOrderForUnit(input.subject.subject_id, input.subject.org_id);
  } catch {
    return null;
  }
}

type LoadedPhoto = { imageId: string; mimeType: string; imageData: Buffer };

async function loadPhotos(input: PrepRound3Input): Promise<{ photos: LoadedPhoto[]; problems: string[] }> {
  const photos: LoadedPhoto[] = [];
  const problems: string[] = [];
  const limit = maxImageBytes();
  for (const row of input.inputs || []) {
    try {
      const bytes = await readInputBytes(row, input.subject.subject_id);
      if (!bytes) continue;
      if (bytes.length > limit) {
        problems.push(`Photo ${row.ref || row.url || "inline"} is ${bytes.length} bytes and exceeds the ${limit} byte limit`);
        continue;
      }
      if (!isImage(bytes)) {
        problems.push(`Photo ${row.ref || row.url || "inline"} is not a JPEG, PNG, GIF, or WebP image`);
        continue;
      }
      photos.push({
        imageId: row.ref || row.url || `inline-${photos.length + 1}`,
        mimeType: row.media_type || sniffMime(bytes),
        imageData: bytes,
      });
    } catch (err) {
      problems.push(publicErrorMessage(err));
    }
  }
  return { photos: photos.slice(0, 8), problems };
}

async function readInputBytes(
  row: NonNullable<PrepRound3Input["inputs"]>[number],
  subjectId: string
): Promise<Buffer | null> {
  if (row.data_base64) {
    return Buffer.from(row.data_base64, "base64");
  }
  if (row.url) {
    return readPhotoUrl(row.url);
  }
  if (!row.ref) return null;
  const candidates = [
    row.ref,
    path.join(process.cwd(), row.ref),
    path.join(process.cwd(), "fixtures", "prep", "real", subjectId, path.basename(row.ref)),
    path.join(process.cwd(), "fixtures", "prep", "hub", subjectId, path.basename(row.ref)),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      /* next candidate */
    }
  }
  return null;
}

async function readPhotoUrl(url: string): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Photo URL is not valid: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Photo URL must be http or https");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Photo URL returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxImageBytes()) throw new Error(`Photo URL exceeds the ${maxImageBytes()} byte limit`);
    return bytes;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Photo URL timed out after 10s");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isImage(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") return true;
  if (bytes.toString("ascii", 0, 3) === "GIF") return true;
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return true;
  return false;
}

function sniffMime(bytes: Buffer): string {
  if (bytes[0] === 0x89) return "image/png";
  if (bytes.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF") return "image/webp";
  return "image/jpeg";
}

function pending(input: PrepRound3Input, message: string, retryable: boolean) {
  const inspectedAt = new Date().toISOString();
  const inspection = {
    inspectionId: `pending-${input.request_id}`,
    unitId: input.subject.subject_id,
    workOrderId: "UNRESOLVED",
    sku: "UNKNOWN",
    asin: "UNKNOWN",
    checks: [],
    metadata: { inspectedAt, visionModel: "none", visionRequestCount: 0 },
  };
  const operational = {
    status: "REVIEW_REQUIRED" as const,
    passCount: 0,
    failCount: 0,
    uncertainCount: 0,
    notApplicableCount: 0,
    blockingCheckTypes: [],
    uncertainCheckTypes: [],
  };
  const output = toPrepAgentOutput({
    input,
    inspection: inspection as never,
    operational,
    modelName: "none",
    calls: 0,
    latencyMs: 0,
    inputRefs: [],
    failOpen: { message, retryable },
  });
  return output;
}
