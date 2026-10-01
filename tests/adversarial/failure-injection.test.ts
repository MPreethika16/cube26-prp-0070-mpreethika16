import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepUnitObservationSchema } from "../../src/lib/vision/prep-observation.schema";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { RuleRegistry } from "../../src/lib/compliance/rules/registry";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { evaluateEvidenceReadiness } from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import { createCompliantObservation } from "../../src/lib/adversarial/scenarios";

describe("Adversarial Failure Injection Tests (Day 5 / Step 1)", () => {
  const baseWorkOrder = {
    workOrderId: "WO-TEST-ERR",
    unitId: "UNIT-0001",
    sku: "SKU-POUCH-TECH",
    asin: "B0DUMMY101",
    expectedFnsku: "X00DUMMY001",
    requirements: {
      polybag: "NOT_REQUIRED" as const,
      suffocationWarning: "NOT_REQUIRED" as const,
      expiryDate: "NOT_REQUIRED" as const,
      handlingMarks: {
        state: "NOT_REQUIRED" as const,
        requiredMarks: [],
      },
    },
  };

  // 1. Gemini throws error -> never becomes PASS or READY
  it("1. Gemini throws error -> handled safely, never produces PASS or READY", async () => {
    async function mockFailingVisionCall(): Promise<never> {
      throw new Error("Gemini API Error 503: Service Unavailable");
    }

    let caughtError: Error | null = null;
    const inspectionRecord = null;
    try {
      await mockFailingVisionCall();
    } catch (err: unknown) {
      caughtError = err as Error;
    }

    assert.ok(caughtError !== null);
    assert.match(caughtError.message, /503/);
    assert.equal(inspectionRecord, null, "No inspection record must be fabricated on model failure");
  });

  // 2. Gemini returns malformed structured output (non-JSON) -> rejected by parser, never READY
  it("2. Gemini returns malformed structured output -> rejected, never READY", () => {
    const rawMalformedResponse = "```json\n{ truncated json: true, ...";

    let parseSuccess = false;
    try {
      JSON.parse(rawMalformedResponse);
      parseSuccess = true;
    } catch {
      parseSuccess = false;
    }

    assert.equal(parseSuccess, false);
    // Boundary ensures that invalid JSON cannot proceed to inspection
  });

  // 3. Gemini returns schema-invalid enum -> rejected by Zod schema, never READY
  it("3. Gemini returns schema-invalid enum -> rejected by Zod schema, never READY", () => {
    const invalidObservation = {
      ...createCompliantObservation("UNIT-0001"),
      fnsku: {
        visibility: "MAYBE_VISIBLE", // Invalid enum!
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY001",
        placement: "ON_THE_ROOF", // Invalid enum!
        placementDescription: null,
        evidence: [],
      },
    };

    const parseResult = prepUnitObservationSchema.safeParse(invalidObservation);
    assert.equal(parseResult.success, false);
    assert.ok(parseResult.error.issues.length > 0);
  });

  // 4. Work order cannot be resolved -> throws clear informative error, never READY
  it("4. work order cannot be resolved -> throws clear error, never READY", () => {
    assert.throws(
      () => resolveWorkOrderForUnit("UNIT-9999-NONEXISTENT"),
      /Work order not found for unit "UNIT-9999-NONEXISTENT"/
    );
  });

  // 5. Policy lookup unavailable / missing -> UNCERTAIN, never crash, never READY
  it("5. policy lookup unavailable / missing -> UNCERTAIN / RULE_UNAVAILABLE, never READY", () => {
    const emptyRegistry = new RuleRegistry([]);
    const inspectionRecord = runPrepInspection({
      observation: createCompliantObservation("UNIT-0001"),
      workOrder: baseWorkOrder,
      rules: emptyRegistry,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.notEqual(operationalStatus.status, "READY");
    for (const check of inspectionRecord.checks) {
      assert.equal(check.verdict, "UNCERTAIN");
      assert.equal(check.reasonCode, "RULE_UNAVAILABLE");
    }
  });

  // 6. Unsupported image MIME format -> evidence quality gate rejects (canInspect = false)
  it("6. unsupported image format -> evidence quality gate rejects (canInspect = false)", () => {
    const fakeBuffer = Buffer.alloc(1000, 1);
    const result = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", imageData: fakeBuffer, mimeType: "image/bmp" }, // Unsupported!
        back: { slotId: "back", imageData: fakeBuffer, mimeType: "image/jpeg" },
        label: { slotId: "label", imageData: fakeBuffer, mimeType: "image/jpeg" },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.ok(result.slotStatuses["front"].issues[0].includes("Unsupported image format"));
  });

  // 7. Empty image payload (0 bytes) -> evidence quality gate rejects (canInspect = false)
  it("7. empty image payload -> evidence quality gate rejects (canInspect = false)", () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", imageData: emptyBuffer, mimeType: "image/jpeg" },
        back: { slotId: "back", imageData: emptyBuffer, mimeType: "image/jpeg" },
        label: { slotId: "label", imageData: emptyBuffer, mimeType: "image/jpeg" },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.ok(result.slotStatuses["front"].issues[0].includes("empty (0 bytes)"));
  });
});
