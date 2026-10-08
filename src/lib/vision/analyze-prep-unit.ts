import { GoogleGenAI } from "@google/genai";
import {
  prepUnitObservationSchema,
  type PrepUnitObservation,
} from "./prep-observation.schema";
import { preprocessImages } from "./image-preprocessor";
import { applyObservationGuards } from "./observation-guards";

export interface PrepUnitImageInput {
  imageId: string;
  mimeType: string;
  imageData: Buffer | Uint8Array | string;
}

export interface AnalyzePrepUnitOptions {
  model?: string;
  apiKey?: string;
  /** claude uses ANTHROPIC_API_KEY. gemini is the original path and is not the Round 3 default. */
  provider?: "claude" | "gemini";
}

export interface AnalyzePrepUnitResult {
  observation: PrepUnitObservation;
  metadata: {
    model: string;
    durationMs: number;
    requestCount: number;
    attemptCount?: number;
    preprocessingMs?: number;
    visionRequestMs?: number;
    totalVisionMs?: number;
    preprocessedImages?: Array<{
      imageId: string;
      originalWidth: number;
      originalHeight: number;
      originalByteSize: number;
      processedWidth: number;
      processedHeight: number;
      processedByteSize: number;
    }>;
  };
}

export const SYSTEM_INSTRUCTION = `You are a visual observation agent for physical product preparation in a fulfillment and prep warehouse.
Your role is SOLELY to act as a factual visual observer.

MANDATORY RULES:
- Report only visually supported facts.
- Do NOT determine compliance.
- Do NOT output PASS or FAIL.
- Do NOT invent preparation/Amazon requirements.
- Do NOT infer absence merely because something is not visible.
- NOT_DETECTED means "not detected in supplied evidence", never "does not exist".
- Never phrase evidence as "product has no X", "X is absent", or "no X is stated" unless the visual evidence actually supports such a conclusion.
- Prefer wording such as "X was not detected in the supplied views."
- Use UNCERTAIN when blur, obstruction, angle, crop, glare, resolution, or missing views prevent reliable determination.
- Image quality must reflect INSPECTION USABILITY, not merely whether the photograph looks generally clear.
- A visually attractive image may still be DEGRADED if small labels, barcodes, warnings, dates, seals, or placement cannot be inspected.
- Never guess unreadable text.
- IDENTIFIER COMPLETENESS & ANTI-AUTOCOMPLETE RULES (FNSKU & BARCODES):
  - Carefully inspect whether the barcode and its printed alphanumeric code are fully visible or cropped/truncated by the photograph edge.
  - If a barcode's vertical lines or alphanumeric characters are cut off on the right, left, top, or bottom, or touch the image border:
    valueCompleteness MUST be "PARTIAL" or "UNCERTAIN".
    Under NO CIRCUMSTANCES report valueCompleteness: "COMPLETE" if any barcode bars or characters are cropped, clipped, or cut off by the frame.
  - Never reconstruct missing identifier characters.
  - Never autocomplete a cropped barcode or FNSKU label from partial prefix text (e.g. if you see "X00DU" cut off at the edge, DO NOT fill in "X00DUMMY001").
  - detectedValue may contain only the visibly present fragment (or null if unreadable), and valueCompleteness MUST be "PARTIAL".
  - COMPLETE is permitted ONLY when the barcode has both start and stop margins clearly visible within the frame and EVERY character in detectedValue is 100% visually present without any edge truncation.
  - When unsure, report UNCERTAIN.
- For manufacturerBarcode and manufacturerBarcodeCoverage:
  - If the manufacturer barcode lines and numbers are physically visible and exposed/uncovered, report manufacturerBarcode.visibility as VISIBLE and manufacturerBarcodeCoverage.status as NOT_COVERED.
  - If the manufacturer barcode is physically covered by an opaque label, sticker, or FNSKU label (so the barcode lines are hidden from view), report manufacturerBarcode.visibility as NOT_DETECTED, and manufacturerBarcodeCoverage.status as COVERED with coveringType as "OPAQUE_LABEL" or "FNSKU_LABEL".
  - If no manufacturer barcode is detected in the views and no covering label is seen, report manufacturerBarcode.visibility as NOT_DETECTED and manufacturerBarcodeCoverage.status as UNCERTAIN. NEVER report NOT_COVERED unless the barcode is physically VISIBLE and exposed.
- DISTINGUISH BARCODE ROLES & IDENTIFIERS:
  - Do NOT assume every detected barcode is a manufacturer retail barcode or Amazon FNSKU.
  - Maintain strict semantic distinction between:
    1. Amazon/FNSKU product label: Amazon item label (Code 128, typically starting with 'X00' or 'B0', or labeled as an Amazon item label).
    2. Manufacturer retail product barcode: Original product UPC/EAN/ISBN barcode printed by the manufacturer on the retail packaging.
    3. Shipping / courier barcode: External carrier/courier waybill, delivery routing sticker, tracking code.
    4. QR code / 2D matrix: 2D matrix or regulatory matrix.
    5. Unknown / unclassified barcode: Any barcode whose role cannot be determined.
  - CRITICAL INVARIANTS:
    - UNKNOWN BARCODE != MANUFACTURER BARCODE.
    - UNKNOWN BARCODE != FNSKU.
    - A QR code or 2D matrix MUST NOT be reported as an FNSKU barcode or manufacturer retail barcode.
    - A shipping/courier barcode or tracking sticker MUST NOT be reported as an Amazon FNSKU label or manufacturer retail barcode.
    - If a label does not clearly show an Amazon FNSKU barcode, report fnsku.visibility as NOT_DETECTED (or UNCERTAIN if visual evidence is ambiguous). NEVER populate fnsku.detectedValue with shipping, regulatory, or QR codes.
    - If an observed barcode is a shipping barcode, courier waybill, or QR code, do NOT report it as manufacturerBarcode.visibility = VISIBLE. Report manufacturerBarcode.visibility = NOT_DETECTED.
- Evidence must reference one of the supplied imageIds.
- Evidence descriptions must be short and factual.
- Do not claim properties that cannot be visually established.
- FALSE VISIBLE GUARD: Mark expiryDate.visibility VISIBLE only when a date that is clearly an expiry, best-by, or use-by is readable or partly readable. MFD, MFG, PKD, packed, and a manufacturing month are not expiry. A best-before rule counted from a manufacture date is not a consumer expiry date. If unsure, use NOT_DETECTED or UNCERTAIN, never VISIBLE.
- FALSE VISIBLE GUARD: Mark polybag.visibility VISIBLE only when a bag, sleeve, or plastic overwrap is itself in frame. A window carton, blister window, gloss, or glare is not a polybag. If unsure, use NOT_DETECTED or UNCERTAIN.
- An ISBN, including a 978 or 979 number, is a book barcode. It is never an FNSKU. Do not put it in fnsku.detectedValue.
- Do not cite a back label, back panel, or rear view unless a back image was supplied. A missing back photo is not a back-label read.
- Mark handling marks VISIBLE only when the mark or its words are actually in frame.

You will receive multiple images belonging to a single unit, each tagged with its imageId.
Extract unit visual observations adhering strictly to the JSON schema.

JSON Structure:
{
  "unitId": "<exact unitId requested>",
  "imageQuality": {
    "overall": "GOOD" | "DEGRADED" | "UNUSABLE",
    "issues": ["<factual issues affecting inspection usability, such as glare, blur, poor angle, truncation, or empty array if none>"]
  },
  "polybag": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "sealStatus": "SEALED" | "NOT_SEALED" | "UNCERTAIN",
    "packagingType": "POLYBAG" | "SHRINK_WRAP" | "PLASTIC_OVERWRAP" | "OTHER_PLASTIC" | "NONE_DETECTED" | "UNCERTAIN",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "suffocationWarning": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
    "detectedText": "<exact text if legible, or null>",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "fnsku": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
    "valueCompleteness": "COMPLETE" | "PARTIAL" | "UNCERTAIN",
    "detectedValue": "<barcode text/value if visible and legible, or null>",
    "placement": "FLAT_SURFACE" | "CURVED_SURFACE" | "ACROSS_SEAM" | "OBSTRUCTED" | "OTHER" | "UNCERTAIN",
    "placementDescription": "<short description of placement, or null>",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "manufacturerBarcode": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
    "valueCompleteness": "COMPLETE" | "PARTIAL" | "UNCERTAIN",
    "detectedValue": "<barcode string if visible and legible, or null>",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "manufacturerBarcodeCoverage": {
    "status": "COVERED" | "NOT_COVERED" | "UNCERTAIN",
    "coveringType": "FNSKU_LABEL" | "OPAQUE_LABEL" | "OTHER" | null,
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "expiryDate": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
    "detectedValue": "<expiry date string if visible and legible, or null>",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "handlingMarks": [
    {
      "detectedType": "<type such as fragile, liquid, this_way_up, keep_dry>",
      "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
      "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
      "detectedText": "<text if present, or null>",
      "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
    }
  ],
  "otherVisibleIssues": ["<short, factual description of visible physical issue, e.g. 'liquid leakage detected on bottom corner', 'puncture hole in bag'>"]
}

Rules on NULL vs Value:
- detectedValue/detectedText MUST be null if visibility is NOT_DETECTED or UNCERTAIN, or if legibility is ILLEGIBLE or UNCERTAIN.
- placementDescription MUST be null if fnsku.placement is UNCERTAIN.
- imageQuality.issues MUST be an empty array [] if overall is GOOD and there are no issues.
- otherVisibleIssues MUST be [] if no other physical issues are visible.
- Always include an evidence entry for any feature that is VISIBLE.
- For features that are NOT_DETECTED, evidence may be empty [].

Respond with pure JSON only.`;

/**
 * Executes a batched multimodal visual inspection across supplied images.
 */
export async function analyzePrepUnit(
  unitId: string,
  images: PrepUnitImageInput[],
  options?: AnalyzePrepUnitOptions
): Promise<AnalyzePrepUnitResult> {
  const totalStartTime = Date.now();
  const provider =
    options?.provider ||
    (process.env.PREP_VISION_PROVIDER === "gemini" || process.env.PREP_VISION_PROVIDER === "claude"
      ? process.env.PREP_VISION_PROVIDER
      : process.env.ANTHROPIC_API_KEY
        ? "claude"
        : "gemini");

  if (provider === "claude") {
    const { analyzePrepUnitWithClaude } = await import("./claude-observer");
    return analyzePrepUnitWithClaude(unitId, images, {
      model: options?.model,
      apiKey: options?.apiKey,
    });
  }

  if (!images || images.length === 0) {
    throw new Error(
      `Cannot analyze prep unit "${unitId}": at least one image is required.`
    );
  }

  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Please provide an apiKey option or configure the environment variable."
    );
  }

  const model = options?.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const ai = new GoogleGenAI({ apiKey });

  // 1. Deterministic image preprocessing (aspect ratio preserved, never upscaled, longest edge <= 1280px)
  const preprocessingSummary = await preprocessImages(images);
  const preprocessingMs = preprocessingSummary.preprocessingMs;

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const img of preprocessingSummary.images) {
    parts.push({
      text: `[Image ID: "${img.imageId}", MIME: "${img.mimeType}", Dimensions: ${img.processedWidth}x${img.processedHeight}]`,
    });
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.imageData.toString("base64"),
      },
    });
  }

  const userPrompt = `Unit ID: "${unitId}"
Provided images: ${images.map((i) => `"${i.imageId}"`).join(", ")}

Analyze the provided images of this unit.
Extract factual visual observations adhering strictly to the JSON schema.
Remember:
- Report only visually supported facts.
- Do NOT determine compliance.
- Do NOT output PASS or FAIL.
- Do NOT invent preparation/Amazon requirements.
- Do NOT infer absence merely because something is not visible.
- NOT_DETECTED means "not detected in supplied evidence", never "does not exist".
- Never phrase evidence as "product has no X", "X is absent", or "no X is stated" unless the visual evidence actually supports such a conclusion.
- Prefer wording such as "X was not detected in the supplied views."
- Use UNCERTAIN when blur, obstruction, angle, crop, glare, resolution, or missing views prevent reliable determination.
- Image quality must reflect INSPECTION USABILITY, not merely whether the photograph looks generally clear. A visually attractive image may still be DEGRADED if small labels, barcodes, warnings, dates, seals, or placement cannot be inspected.
- Never guess unreadable text.
- Use ILLEGIBLE or UNCERTAIN for unreadable text.
- Never reconstruct missing identifier characters.
- Never autocomplete a cropped barcode or FNSKU label.
- CRITICAL BARCODE BOUNDARY CHECK: If the barcode bars or alphanumeric code touch the image edge, are cut off, or cropped, valueCompleteness MUST be "PARTIAL" or "UNCERTAIN". Under NO CIRCUMSTANCES report COMPLETE for a cropped barcode.
- If any part of an identifier is outside the image, truncated, cut off, obscured, or blurred, valueCompleteness MUST be PARTIAL or UNCERTAIN.
- Report valueCompleteness as COMPLETE only if every character in detectedValue is directly and clearly visible in the image.
- When unsure whether an identifier is complete, abstain and report UNCERTAIN.
- Report manufacturerBarcodeCoverage.status as COVERED ONLY if visual evidence positively shows an opaque label, FNSKU sticker, or covering physically placed over the original manufacturer barcode location. If the original barcode is visible/exposed, report NOT_COVERED. If unable to verify coverage, report UNCERTAIN. Never guess coverage.
- Evidence must reference one of the supplied imageIds (${images.map((i) => `"${i.imageId}"`).join(", ")}).
- Evidence descriptions must be short and factual.
- Do not claim properties that cannot be visually established.
- Do not mark expiry or a polybag VISIBLE unless that feature itself is clearly in frame. Gloss and lot codes are not enough.

Respond with pure JSON only.`;

  parts.push({ text: userPrompt });

  const visionRequestStartTime = Date.now();
  let responseText: string | undefined;
  let attemptCount = 0;
  const MAX_ATTEMPTS = 4;
  const TIMEOUT_PER_ATTEMPT_MS = 18000;

  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attemptCount = attempt;
      let timer: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Request timed out after ${TIMEOUT_PER_ATTEMPT_MS / 1000}s`
                )
              ),
            TIMEOUT_PER_ATTEMPT_MS
          );
        });
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts,
              },
            ],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
          timeoutPromise,
        ]);
        if (timer) clearTimeout(timer);
        responseText = response.text;

        // Verify JSON parseability before accepting attempt
        let testCleaned = (responseText ?? "").trim();
        if (testCleaned.startsWith("```json")) testCleaned = testCleaned.slice(7);
        else if (testCleaned.startsWith("```")) testCleaned = testCleaned.slice(3);
        if (testCleaned.endsWith("```")) testCleaned = testCleaned.slice(0, -3);
        JSON.parse(testCleaned.trim());

        break;
      } catch (err: unknown) {
        if (timer) clearTimeout(timer);
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isJsonTruncation = msg.includes("JSON") || msg.includes("Unexpected end");
        if (
          (msg.includes("503") ||
            msg.includes("UNAVAILABLE") ||
            msg.includes("high demand") ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("timed out") ||
            isJsonTruncation) &&
          attempt < MAX_ATTEMPTS
        ) {
          const jitter = Math.floor(Math.random() * 800);
          const backoffMs = attempt * 1500 + jitter;
          console.warn(
            `[analyzePrepUnit] Transient error (${msg.slice(0, 50)}) for ${unitId} (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${backoffMs}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        throw err;
      }
    }
    if (!responseText && lastError) {
      throw lastError;
    }
  } catch (apiError: unknown) {
    const message =
      apiError instanceof Error ? apiError.message : String(apiError);
    const sanitized = message.replace(/key=[^&\s]+/gi, "key=REDACTED");
    throw new Error(
      `Gemini multimodal API request failed for unit "${unitId}" using model "${model}": ${sanitized}`
    );
  }

  const visionRequestMs = Date.now() - visionRequestStartTime;
  const totalVisionMs = Date.now() - totalStartTime;

  if (!responseText || !responseText.trim()) {
    throw new Error(
      `Gemini model "${model}" returned an empty response for unit "${unitId}".`
    );
  }

  let cleaned = responseText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(cleaned);
  } catch (jsonErr: unknown) {
    const message =
      jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
    throw new Error(
      `Failed to parse model response as JSON for unit "${unitId}": ${message}. Raw response: ${cleaned.slice(0, 300)}`
    );
  }

  const parseResult = prepUnitObservationSchema.safeParse(rawJson);
  if (!parseResult.success) {
    throw new Error(
      `Validation error: Model observation does not conform to prepUnitObservationSchema for unit "${unitId}": ${parseResult.error.message}`
    );
  }

  return {
    observation: applyObservationGuards(
      parseResult.data,
      images.map((image) => image.imageId)
    ),
    metadata: {
      model,
      durationMs: totalVisionMs,
      requestCount: 1,
      attemptCount,
      preprocessingMs,
      visionRequestMs,
      totalVisionMs,
      preprocessedImages: preprocessingSummary.images.map((img) => ({
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
