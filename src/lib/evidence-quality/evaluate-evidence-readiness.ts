import {
  evidenceReadinessEvaluationSchema,
  type EvidenceReadinessEvaluation,
  type SlotValidationResult,
  type SlotReadinessStatus,
} from "./evidence-readiness.schema";

export interface SlotEvidenceInput {
  slotId: string;
  dataUrl?: string | null;
  imageData?: string | Buffer | Uint8Array | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
  byteSize?: number;
}

export interface EvaluateEvidenceReadinessParams {
  slots: Record<string, SlotEvidenceInput> | SlotEvidenceInput[];
  requiredSlots?: string[];
  minDimension?: number;
  minByteSize?: number;
}

export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const DEFAULT_REQUIRED_SLOTS = ["front", "back", "label"] as const;
export const DEFAULT_MIN_DIMENSION = 200; // minimum useful dimension in pixels
export const DEFAULT_MIN_BYTES = 500; // minimum useful payload size

/**
 * Lightweight pure-JS image dimension parser for JPEG and PNG buffers.
 * Does not require any external native libraries or heavy canvas dependencies.
 */
function tryExtractDimensions(
  buffer: Buffer
): { width?: number; height?: number } {
  try {
    if (buffer.length < 24) return {};

    // 1. Check PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // 2. Check JPEG: FF D8
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        // SOF markers: C0 to C3, C5 to C7, C9 to CB, CD to CF
        const isSOF =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);

        if (isSOF) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }
  } catch {
    // Ignore dimension parsing errors; fall back to undefined
  }
  return {};
}

function getBufferAndLength(
  input: SlotEvidenceInput
): { buffer: Buffer | null; byteLength: number; rawBase64: string | null } {
  const raw = input.imageData ?? input.dataUrl;

  let buffer: Buffer | null = null;
  let rawBase64: string | null = null;
  let byteLength = input.byteSize ?? 0;

  if (Buffer.isBuffer(raw)) {
    buffer = raw;
    byteLength = input.byteSize ?? raw.length;
    rawBase64 = raw.toString("base64");
  } else if (raw instanceof Uint8Array) {
    buffer = Buffer.from(raw);
    byteLength = input.byteSize ?? buffer.length;
    rawBase64 = buffer.toString("base64");
  } else if (typeof raw === "string") {
    let base64 = raw.trim();
    if (base64.startsWith("data:")) {
      const comma = base64.indexOf(",");
      if (comma !== -1) {
        base64 = base64.slice(comma + 1);
      }
    }
    rawBase64 = base64;
    if (base64) {
      try {
        buffer = Buffer.from(base64, "base64");
        byteLength = input.byteSize ?? buffer.length;
      } catch {
        byteLength = input.byteSize ?? 0;
      }
    }
  }

  return { buffer, byteLength, rawBase64 };
}

/**
 * Deterministically evaluates evidence readiness across required slots.
 *
 * Checks:
 * - Presence of required slots
 * - Supported MIME type
 * - Non-empty payload (> 0 bytes)
 * - Minimum useful dimensions (emits WARNING if < minDimension)
 * - Duplicate image detection across slots (emits WARNING if duplicates found)
 *
 * CRITICAL SAFETY BOUNDARY:
 * Strictly does NOT infer barcode legibility, FNSKU presence, or packaging compliance.
 */
export function evaluateEvidenceReadiness(
  params: EvaluateEvidenceReadinessParams
): EvidenceReadinessEvaluation {
  const requiredSlots = params.requiredSlots ?? [...DEFAULT_REQUIRED_SLOTS];
  const minDimension = params.minDimension ?? DEFAULT_MIN_DIMENSION;
  const minByteSize = params.minByteSize ?? DEFAULT_MIN_BYTES;

  // Normalize input slots to map
  const slotList: SlotEvidenceInput[] = Array.isArray(params.slots)
    ? params.slots
    : Object.values(params.slots);

  const slotMap = new Map<string, SlotEvidenceInput>();
  for (const s of slotList) {
    slotMap.set(s.slotId.toLowerCase(), s);
  }

  const slotStatuses: Record<string, SlotValidationResult> = {};
  const suppliedSlots: string[] = [];
  const missingSlots: string[] = [];
  const globalWarnings: string[] = [];

  // Track raw data for duplicate detection
  const payloadToSlots = new Map<string, string[]>();

  // Validate each required slot + any extra supplied slots
  const allSlotIds = new Set<string>([
    ...requiredSlots.map((s) => s.toLowerCase()),
    ...Array.from(slotMap.keys()),
  ]);

  for (const slotId of allSlotIds) {
    const input = slotMap.get(slotId);
    const issues: string[] = [];

    // Case 1: Slot has no input or is null/undefined
    if (
      !input ||
      (input.dataUrl === undefined &&
        input.imageData === undefined &&
        input.byteSize === undefined) ||
      (input.dataUrl === null && input.imageData === null)
    ) {
      slotStatuses[slotId] = {
        slotId,
        status: "MISSING",
        issues: ["No photographic evidence supplied for this view."],
      };
      if (requiredSlots.map((s) => s.toLowerCase()).includes(slotId)) {
        missingSlots.push(slotId);
      }
      continue;
    }

    // Check payload
    const { buffer, byteLength, rawBase64 } = getBufferAndLength(input);

    // Case 2: Empty file
    if (input.dataUrl === "" || input.imageData === "" || byteLength === 0) {
      slotStatuses[slotId] = {
        slotId,
        status: "MISSING",
        issues: ["Supplied image file is empty (0 bytes)."],
        byteSize: 0,
      };
      if (requiredSlots.map((s) => s.toLowerCase()).includes(slotId)) {
        missingSlots.push(slotId);
      }
      continue;
    }

    // Case 3: Supported MIME type
    const mime = input.mimeType?.toLowerCase().trim();
    if (
      mime &&
      !SUPPORTED_MIME_TYPES.includes(mime as (typeof SUPPORTED_MIME_TYPES)[number])
    ) {
      slotStatuses[slotId] = {
        slotId,
        status: "MISSING",
        issues: [
          `Unsupported image format '${mime}'. Supported formats: JPEG, PNG, WEBP.`,
        ],
        byteSize: byteLength,
      };
      if (requiredSlots.map((s) => s.toLowerCase()).includes(slotId)) {
        missingSlots.push(slotId);
      }
      continue;
    }

    // Check dimensions
    let width = input.width;
    let height = input.height;

    if ((width === undefined || height === undefined) && buffer) {
      const dims = tryExtractDimensions(buffer);
      if (dims.width !== undefined) width = dims.width;
      if (dims.height !== undefined) height = dims.height;
    }

    let status: SlotReadinessStatus = "READY";

    // Quality check: Low resolution
    if (
      width !== undefined &&
      height !== undefined &&
      (width < minDimension || height < minDimension)
    ) {
      status = "WARNING";
      issues.push(
        `Low resolution (${width}x${height}px). Minimum recommended is ${minDimension}x${minDimension}px for reliable inspection.`
      );
      globalWarnings.push(
        `View '${slotId}' is low resolution (${width}x${height}px).`
      );
    }

    // Quality check: Very small file
    if (byteLength < minByteSize) {
      status = "WARNING";
      issues.push(
        `Unusually small image file (${byteLength} bytes); may have severe compression artifacts.`
      );
    }

    // Duplicate detection tracking (check first 256 chars of base64 if very long)
    if (rawBase64 && rawBase64.length > 50) {
      const fingerprint = `${rawBase64.length}:${rawBase64.slice(0, 128)}:${rawBase64.slice(-128)}`;
      const existing = payloadToSlots.get(fingerprint) ?? [];
      existing.push(slotId);
      payloadToSlots.set(fingerprint, existing);
    }

    slotStatuses[slotId] = {
      slotId,
      status,
      issues,
      width,
      height,
      byteSize: byteLength,
    };

    suppliedSlots.push(slotId);
  }

  // Check duplicate fingerprints
  for (const [, matchingSlots] of payloadToSlots.entries()) {
    if (matchingSlots.length > 1) {
      const names = matchingSlots.join(" and ");
      const warnMsg = `Duplicate image detected across slots: ${names}.`;
      globalWarnings.push(warnMsg);
      for (const sId of matchingSlots) {
        if (slotStatuses[sId]) {
          slotStatuses[sId].status = "WARNING";
          slotStatuses[sId].issues.push(
            `Duplicate image: identical photograph supplied for ${names}.`
          );
        }
      }
    }
  }

  // Overall status resolution
  let overallStatus: "READY" | "WARNING" | "NOT_READY";
  let canInspect: boolean;

  if (suppliedSlots.length === 0) {
    overallStatus = "NOT_READY";
    canInspect = false;
  } else if (missingSlots.length > 0) {
    overallStatus = "NOT_READY";
    canInspect = false;
  } else {
    // All required slots supplied
    const hasWarnings =
      globalWarnings.length > 0 ||
      Object.values(slotStatuses).some((s) => s.status === "WARNING");

    if (hasWarnings) {
      overallStatus = "WARNING";
      canInspect = true; // WARNING can still inspect
    } else {
      overallStatus = "READY";
      canInspect = true;
    }
  }

  return evidenceReadinessEvaluationSchema.parse({
    status: overallStatus,
    slotStatuses,
    suppliedSlots,
    missingSlots,
    warnings: globalWarnings,
    canInspect,
  });
}
