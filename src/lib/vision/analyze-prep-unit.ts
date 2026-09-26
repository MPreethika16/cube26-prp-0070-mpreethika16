import { GoogleGenAI } from "@google/genai";
import {
  prepUnitObservationSchema,
  type PrepUnitObservation,
} from "./prep-observation.schema";

export interface PrepUnitImageInput {
  imageId: string;
  mimeType: string;
  imageData: Buffer | Uint8Array | string;
}

export interface AnalyzePrepUnitOptions {
  model?: string;
  apiKey?: string;
}

export interface AnalyzePrepUnitResult {
  observation: PrepUnitObservation;
  metadata: {
    model: string;
    durationMs: number;
    requestCount: number;
  };
}

const SYSTEM_INSTRUCTION = `You are a visual observation agent for physical product preparation in a fulfillment and prep warehouse.
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
- Use ILLEGIBLE or UNCERTAIN for unreadable text.
- Evidence must reference one of the supplied imageIds.
- Evidence descriptions must be short and factual.
- Do not claim properties that cannot be visually established.

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
    "detectedValue": "<barcode text/value if visible and legible, or null>",
    "placement": "FLAT_SURFACE" | "CURVED_SURFACE" | "ACROSS_SEAM" | "OBSTRUCTED" | "OTHER" | "UNCERTAIN",
    "placementDescription": "<short description of placement, or null>",
    "evidence": [{ "imageId": "<imageId>", "description": "<factual evidence description>" }]
  },
  "manufacturerBarcode": {
    "visibility": "VISIBLE" | "NOT_DETECTED" | "UNCERTAIN",
    "legibility": "LEGIBLE" | "ILLEGIBLE" | "UNCERTAIN",
    "detectedValue": "<barcode string if visible and legible, or null>",
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
  "otherVisibleIssues": ["<short factual note about any other visual anomaly, or empty array if none>"]
}

Important details:
- If a feature is not detected in any image (e.g. polybag not detected in the supplied views), mark visibility as "NOT_DETECTED", sealStatus as "UNCERTAIN", and note what was observed in evidence or leave evidence empty.
- If a barcode is a manufacturer EAN/UPC barcode (e.g. on the retail packaging), record it under manufacturerBarcode, NOT fnsku.
- Do NOT confuse manufacture date with expiry date unless an expiration or best-before is explicitly stated.`;

function toBase64String(imageData: Buffer | Uint8Array | string): string {
  if (typeof imageData === "string") {
    const commaIndex = imageData.indexOf(",");
    if (imageData.startsWith("data:") && commaIndex !== -1) {
      return imageData.slice(commaIndex + 1);
    }
    return imageData;
  }
  if (Buffer.isBuffer(imageData)) {
    return imageData.toString("base64");
  }
  return Buffer.from(imageData).toString("base64");
}

/**
 * Perform a single batched multimodal observation pass over all images for a unit.
 * Does NOT evaluate compliance or emit PASS/FAIL.
 */
export async function analyzePrepUnit(
  unitId: string,
  images: PrepUnitImageInput[],
  options?: AnalyzePrepUnitOptions
): Promise<AnalyzePrepUnitResult> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "Missing GEMINI_API_KEY in environment or options. Visual observation requires a valid Gemini API key."
    );
  }

  if (!unitId || !unitId.trim()) {
    throw new Error("Missing required 'unitId' parameter.");
  }

  if (!images || images.length === 0) {
    throw new Error(
      `No images provided for unitId "${unitId}". At least one image is required.`
    );
  }

  for (const [idx, img] of images.entries()) {
    if (!img.imageId || !img.imageId.trim()) {
      throw new Error(`Image at index ${idx} is missing required 'imageId'.`);
    }
    if (!img.imageData) {
      throw new Error(`Image '${img.imageId}' is missing image data.`);
    }
    if (!img.mimeType || !img.mimeType.trim()) {
      throw new Error(`Image '${img.imageId}' is missing required 'mimeType'.`);
    }
  }

  const model = options?.model || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const img of images) {
    parts.push({
      text: `[Image ID: "${img.imageId}", MIME: "${img.mimeType}"]`,
    });
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: toBase64String(img.imageData),
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
- Evidence must reference one of the supplied imageIds (${images.map((i) => `"${i.imageId}"`).join(", ")}).
- Evidence descriptions must be short and factual.
- Do not claim properties that cannot be visually established.

Respond with pure JSON only.`;

  parts.push({ text: userPrompt });

  const startTime = Date.now();
  let responseText: string | undefined;

  try {
    const response = await ai.models.generateContent({
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
      },
    });
    responseText = response.text;
  } catch (apiError: unknown) {
    const message =
      apiError instanceof Error ? apiError.message : String(apiError);
    throw new Error(
      `Gemini multimodal API request failed for unit "${unitId}" using model "${model}": ${message}`
    );
  }

  const durationMs = Date.now() - startTime;

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
    observation: parseResult.data,
    metadata: {
      model,
      durationMs,
      requestCount: 1,
    },
  };
}
