import { prepUnitObservationSchema } from "./prep-observation.schema";
import { preprocessImages } from "./image-preprocessor";
import { SYSTEM_INSTRUCTION, type AnalyzePrepUnitResult, type PrepUnitImageInput } from "./analyze-prep-unit";
import { applyObservationGuards } from "./observation-guards";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";

/**
 * One Claude observation call. Facts only. Compliance stays in the TypeScript evaluators.
 * Uses ANTHROPIC_API_KEY. Does not read GEMINI_API_KEY.
 */
export async function analyzePrepUnitWithClaude(
  unitId: string,
  images: PrepUnitImageInput[],
  options?: { model?: string; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<AnalyzePrepUnitResult> {
  if (!images?.length) {
    throw new Error(`Cannot analyze prep unit "${unitId}": at least one image is required.`);
  }
  const apiKey = options?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Round 3 Prep observation uses this key, not GEMINI_API_KEY.");
  }
  const model = options?.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const totalStart = Date.now();
  const preprocessed = await preprocessImages(images);

  const content: Array<Record<string, unknown>> = [];
  for (const img of preprocessed.images) {
    content.push({
      type: "text",
      text: `[Image ID: "${img.imageId}", MIME: "${img.mimeType}", Dimensions: ${img.processedWidth}x${img.processedHeight}]`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType === "image/jpg" ? "image/jpeg" : img.mimeType,
        data: img.imageData.toString("base64"),
      },
    });
  }
  content.push({
    type: "text",
    text: `Unit ID: "${unitId}". Call record_observation with factual JSON only. Do not decide PASS or FAIL. Do not mark expiry or a polybag VISIBLE unless that feature itself is in frame.`,
  });

  const visionStart = Date.now();
  const timeoutMs = options?.timeoutMs ?? Number(process.env.PREP_CLAUDE_TIMEOUT_MS || 45_000);
  const fetcher = options?.fetchImpl || fetch;
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const abort = new Error(`Claude observation timed out after ${timeoutMs}ms`);
      abort.name = "AbortError";
      reject(abort);
    }, timeoutMs);
  });
  let response: Response;
  try {
    response = await Promise.race([fetcher(ANTHROPIC_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      tools: [
        {
          name: "record_observation",
          description: "Record factual visual observations for one prep unit. No compliance verdicts.",
          input_schema: {
            type: "object",
            additionalProperties: true,
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_observation" },
      messages: [{ role: "user", content }],
    }),
  }), timeout]);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Claude observation timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Claude observation failed (${response.status}): ${detail.slice(0, 400)}`);
  }
  let payload: { model?: string; content?: Array<{ type: string; name?: string; input?: unknown }> };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new Error("Claude observation returned non-JSON");
  }
  const tool = (payload.content || []).find((block) => block.type === "tool_use" && block.name === "record_observation");
  if (!tool?.input || typeof tool.input !== "object") {
    throw new Error("Claude observation returned no record_observation tool call");
  }
  const raw = tool.input as Record<string, unknown>;
  raw.unitId = unitId;
  let observation;
  try {
    observation = applyObservationGuards(
      prepUnitObservationSchema.parse(raw),
      images.map((image) => image.imageId)
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "schema rejected the tool call";
    throw new Error(`Claude observation did not match the observation schema: ${detail.slice(0, 240)}`);
  }
  const visionRequestMs = Date.now() - visionStart;
  return {
    observation,
    metadata: {
      model: payload.model || model,
      durationMs: Date.now() - totalStart,
      requestCount: 1,
      attemptCount: 1,
      preprocessingMs: preprocessed.preprocessingMs,
      visionRequestMs,
      totalVisionMs: Date.now() - totalStart,
      preprocessedImages: preprocessed.images.map((img) => ({
        imageId: img.imageId,
        originalWidth: img.originalWidth,
        originalHeight: img.originalHeight,
        originalByteSize: img.originalByteSize,
        processedWidth: img.processedWidth,
        processedHeight: img.processedHeight,
        processedByteSize: img.processedByteSize,
      })),
    },
  };
}
