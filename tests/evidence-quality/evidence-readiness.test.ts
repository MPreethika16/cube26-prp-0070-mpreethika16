import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEvidenceReadiness,
  type SlotEvidenceInput,
} from "../../src/lib/evidence-quality/evaluate-evidence-readiness";

// Sample valid 200x200 1-pixel transparent PNG data (padded) or valid mock base64
const VALID_BASE64_JPEG =
  "data:image/jpeg;base64," +
  Buffer.from(new Uint8Array(1024).fill(0xaa)).toString("base64");

describe("Evidence Quality Gate (Day 4 / Step 3)", () => {
  // Test 1: no images -> NOT_READY
  it("1. no images produces NOT_READY with canInspect = false", () => {
    const result = evaluateEvidenceReadiness({
      slots: {},
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.equal(result.suppliedSlots.length, 0);
    assert.deepEqual(result.missingSlots, ["front", "back", "label"]);
  });

  // Test 2: missing required slot -> NOT_READY
  it("2. missing required slot produces NOT_READY and identifies missing slot", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: VALID_BASE64_JPEG,
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "1",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      // label slot missing!
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.deepEqual(result.missingSlots, ["label"]);
    assert.equal(result.slotStatuses["label"].status, "MISSING");
    assert.equal(result.slotStatuses["front"].status, "READY");
    assert.equal(result.slotStatuses["back"].status, "READY");
  });

  // Test 3: valid front/back/label -> READY
  it("3. valid front, back, and label views produce READY with canInspect = true", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: VALID_BASE64_JPEG + "front",
        mimeType: "image/jpeg",
        width: 1024,
        height: 768,
        byteSize: 5000,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 1024,
        height: 768,
        byteSize: 5000,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 1024,
        height: 768,
        byteSize: 5000,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "READY");
    assert.equal(result.canInspect, true);
    assert.equal(result.missingSlots.length, 0);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.slotStatuses["front"].status, "READY");
    assert.equal(result.slotStatuses["back"].status, "READY");
    assert.equal(result.slotStatuses["label"].status, "READY");
  });

  // Test 4: unsupported MIME rejected
  it("4. unsupported MIME type is rejected as MISSING", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        mimeType: "image/gif", // Unsupported!
        width: 400,
        height: 400,
        byteSize: 1000,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.equal(result.slotStatuses["front"].status, "MISSING");
    assert.ok(
      result.slotStatuses["front"].issues[0].includes("Unsupported image format")
    );
  });

  // Test 5: empty image rejected
  it("5. empty image data is rejected as MISSING", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: "", // Empty string!
        mimeType: "image/jpeg",
        byteSize: 0,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.equal(result.slotStatuses["front"].status, "MISSING");
    assert.ok(
      result.slotStatuses["front"].issues[0].includes("empty (0 bytes)")
    );
  });

  // Test 6: low-resolution image -> WARNING
  it("6. low-resolution image produces WARNING status", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: VALID_BASE64_JPEG + "front",
        mimeType: "image/jpeg",
        width: 150, // Below default 200px threshold!
        height: 150,
        byteSize: 1200,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
      minDimension: 200,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.slotStatuses["front"].status, "WARNING");
    assert.ok(
      result.slotStatuses["front"].issues[0].includes("Low resolution (150x150px)")
    );
  });

  // Test 7: WARNING can still inspect
  it("7. WARNING state can still proceed to inspect (canInspect = true)", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: VALID_BASE64_JPEG + "front",
        mimeType: "image/jpeg",
        width: 100, // Low resolution
        height: 100,
        byteSize: 800,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 600,
        height: 600,
        byteSize: 2000,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 600,
        height: 600,
        byteSize: 2000,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
      minDimension: 200,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(
      result.canInspect,
      true,
      "WARNING status must allow inspection to proceed"
    );
  });

  // Test 8: readiness never produces compliance verdicts
  it("8. evidence readiness contract strictly excludes compliance verdicts", () => {
    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: VALID_BASE64_JPEG + "front",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      back: {
        slotId: "back",
        dataUrl: VALID_BASE64_JPEG + "back",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    const resultObj = result as unknown as Record<string, unknown>;

    // Guarantee that compliance verdict keys do not exist in the output contract
    assert.equal("verdict" in resultObj, false);
    assert.equal("compliance" in resultObj, false);
    assert.equal("passCount" in resultObj, false);
    assert.equal("failCount" in resultObj, false);
    assert.equal("uncertainCount" in resultObj, false);
    assert.notEqual(result.status, "PASS");
    assert.notEqual(result.status, "FAIL");
    assert.notEqual(result.status, "UNCERTAIN");
    assert.notEqual(result.status, "STOP_AND_FIX");
  });

  // Extra check: duplicate image detection across slots
  it("9. duplicate photographs across views produce WARNING", () => {
    const identicalData = VALID_BASE64_JPEG + "identical_photo_across_views";

    const slots: Record<string, SlotEvidenceInput> = {
      front: {
        slotId: "front",
        dataUrl: identicalData,
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      back: {
        slotId: "back",
        dataUrl: identicalData, // Duplicate!
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
      label: {
        slotId: "label",
        dataUrl: VALID_BASE64_JPEG + "label",
        mimeType: "image/jpeg",
        width: 800,
        height: 600,
        byteSize: 2048,
      },
    };

    const result = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.canInspect, true);
    assert.ok(result.warnings.some((w) => w.includes("Duplicate image detected")));
  });
});
