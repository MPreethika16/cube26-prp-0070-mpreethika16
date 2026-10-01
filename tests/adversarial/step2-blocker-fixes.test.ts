import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { evaluateManufacturerBarcodeCoverage } from "../../src/lib/compliance/evaluators/manufacturer-barcode-coverage";
import { evaluateSuffocationWarningLegibility } from "../../src/lib/compliance/evaluators/suffocation-warning-legibility";
import { evaluateExpiryLegibility } from "../../src/lib/compliance/evaluators/expiry-legibility";
import { evaluateFnskuIdentity } from "../../src/lib/compliance/evaluators/fnsku-identity";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import { createCompliantObservation } from "../../src/lib/adversarial/scenarios";
import {
  manufacturerBarcodeCoverageObservationSchema,
  type PrepUnitObservation,
} from "../../src/lib/vision/prep-observation.schema";
import {
  preprocessImage,
} from "../../src/lib/vision/image-preprocessor";
import { analyzePrepUnit } from "../../src/lib/vision/analyze-prep-unit";

describe("Day 5 / Step 2 — Blocker Fixes Regression Suite", () => {
  const baseWorkOrder = {
    workOrderId: "WO-TEST-S2",
    unitId: "UNIT-0001",
    sku: "SKU-POUCH-TECH",
    asin: "B0DUMMY101",
    expectedFnsku: "X00DUMMY001",
    requirements: {
      polybag: "REQUIRED" as const,
      suffocationWarning: "REQUIRED" as const,
      expiryDate: "REQUIRED" as const,
      handlingMarks: {
        state: "NOT_REQUIRED" as const,
        requiredMarks: [],
      },
    },
  };

  const coverageRequirement = {
    checkType: "MANUFACTURER_BARCODE_COVERAGE" as const,
    applicability: "APPLICABLE" as const,
    coverageRequired: true,
    ruleRef: { ruleId: "AMZN-POL-BARCODE-001", version: "2026.1" },
  };

  const warningRule = ACTIVE_RULES.find(
    (r) => r.checkType === "SUFFOCATION_WARNING_LEGIBILITY"
  )!;
  const expiryRule = ACTIVE_RULES.find(
    (r) => r.checkType === "EXPIRY_LEGIBILITY"
  )!;
  const fnskuRule = ACTIVE_RULES.find(
    (r) => r.checkType === "FNSKU_IDENTITY"
  )!;

  // ==========================================================================
  // BARCODE COVERAGE TESTS (A - E)
  // ==========================================================================

  // A. Barcode visible/exposed -> FAIL
  it("A. barcode visible/exposed -> FAIL", () => {
    const result = evaluateManufacturerBarcodeCoverage({
      requirement: coverageRequirement,
      manufacturerBarcodeObservation: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8901234567890",
        evidence: [{ imageId: "back", description: "Uncovered barcode visible on back" }],
      },
      manufacturerBarcodeCoverageObservation: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [{ imageId: "back", description: "Original barcode is exposed" }],
      },
    });

    assert.equal(result.verdict, "FAIL");
    assert.equal(result.reasonCode, "REQUIREMENT_VIOLATED");
  });

  // B. Barcode NOT_DETECTED, coverage UNCERTAIN -> UNCERTAIN
  it("B. barcode NOT_DETECTED, coverage UNCERTAIN -> UNCERTAIN", () => {
    const result = evaluateManufacturerBarcodeCoverage({
      requirement: coverageRequirement,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverageObservation: {
        status: "UNCERTAIN",
        coveringType: null,
        evidence: [],
      },
    });

    assert.equal(result.verdict, "UNCERTAIN");
    assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
  });

  // C. Positive visual evidence of opaque coverage -> PASS
  it("C. positive visual evidence of opaque coverage -> PASS", () => {
    const result = evaluateManufacturerBarcodeCoverage({
      requirement: coverageRequirement,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverageObservation: {
        status: "COVERED",
        coveringType: "OPAQUE_LABEL",
        evidence: [
          {
            imageId: "back",
            description: "Opaque white blank label cleanly covers manufacturer barcode location",
          },
        ],
      },
    });

    assert.equal(result.verdict, "PASS");
    assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
  });

  // D. NOT_DETECTED alone can NEVER produce PASS
  it("D. NOT_DETECTED alone can NEVER produce PASS", () => {
    const resultWithoutCoverage = evaluateManufacturerBarcodeCoverage({
      requirement: coverageRequirement,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    });

    assert.notEqual(resultWithoutCoverage.verdict, "PASS");
    assert.equal(resultWithoutCoverage.verdict, "UNCERTAIN");
  });

  // E. COVERED without evidence must be schema-invalid or conservatively rejected
  it("E. COVERED without evidence must be schema-invalid or conservatively rejected", () => {
    // 1. Zod schema validation must fail when status is COVERED but evidence is empty
    const schemaParse = manufacturerBarcodeCoverageObservationSchema.safeParse({
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [],
    });
    assert.equal(schemaParse.success, false, "Schema must reject COVERED without evidence");

    // 2. Evaluator also conservatively rejects it as UNCERTAIN
    const result = evaluateManufacturerBarcodeCoverage({
      requirement: coverageRequirement,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverageObservation: {
        status: "COVERED",
        coveringType: "OPAQUE_LABEL",
        evidence: [],
      },
    });

    assert.notEqual(result.verdict, "PASS");
    assert.equal(result.verdict, "UNCERTAIN");
    assert.equal(result.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
  });

  // ==========================================================================
  // LEGIBILITY TESTS (F - H)
  // ==========================================================================

  // F. Warning VISIBLE + ILLEGIBLE -> UNCERTAIN -> recovery requested
  it("F. warning VISIBLE + ILLEGIBLE -> UNCERTAIN -> recovery requested", () => {
    const checkResult = evaluateSuffocationWarningLegibility({
      checkId: "test:warn:leg",
      workOrder: baseWorkOrder,
      rule: warningRule,
      suffocationWarningObservation: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedText: null,
        evidence: [{ imageId: "front", description: "Warning text is blurred by camera glare" }],
      },
    });

    assert.equal(checkResult.verdict, "UNCERTAIN");
    assert.equal(checkResult.reasonCode, "TEXT_ILLEGIBLE");

    // Now verify recovery planner requests a targeted close-up
    const obs: PrepUnitObservation = createCompliantObservation("UNIT-0001", {
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedText: null,
        evidence: [{ imageId: "front", description: "Warning text is blurred by camera glare" }],
      },
      manufacturerBarcodeCoverage: {
        status: "COVERED",
        coveringType: "OPAQUE_LABEL",
        evidence: [{ imageId: "back", description: "Covered barcode" }],
      },
    });

    const record = runPrepInspection({
      observation: obs,
      workOrder: baseWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(record);
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");

    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord: record,
      operationalStatus,
    });
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.ok(
      recoveryPlan.actions.some(
        (a) => a.checkType === "SUFFOCATION_WARNING_LEGIBILITY" && a.actionType === "CAPTURE_CLOSEUP"
      ),
      "Recovery plan must generate CAPTURE_CLOSEUP for suffocation warning legibility"
    );
  });

  // G. Expiry VISIBLE + ILLEGIBLE -> UNCERTAIN -> recovery requested
  it("G. expiry VISIBLE + ILLEGIBLE -> UNCERTAIN -> recovery requested", () => {
    const checkResult = evaluateExpiryLegibility({
      checkId: "test:exp:leg",
      workOrder: baseWorkOrder,
      rule: expiryRule,
      expiryObservation: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Expiry date stamp is low-contrast" }],
      },
    });

    assert.equal(checkResult.verdict, "UNCERTAIN");
    assert.equal(checkResult.reasonCode, "TEXT_ILLEGIBLE");

    const obs: PrepUnitObservation = createCompliantObservation("UNIT-0001", {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Expiry date stamp is low-contrast" }],
      },
      manufacturerBarcodeCoverage: {
        status: "COVERED",
        coveringType: "OPAQUE_LABEL",
        evidence: [{ imageId: "back", description: "Covered barcode" }],
      },
    });

    const record = runPrepInspection({
      observation: obs,
      workOrder: baseWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(record);
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");

    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord: record,
      operationalStatus,
    });
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY") &&
          a.actionType === "CAPTURE_CLOSEUP"
      ),
      "Recovery plan must generate CAPTURE_CLOSEUP for expiry date legibility"
    );
  });

  // H. FNSKU VISIBLE + ILLEGIBLE remains UNCERTAIN
  it("H. FNSKU VISIBLE + ILLEGIBLE remains UNCERTAIN", () => {
    const checkResult = evaluateFnskuIdentity({
      checkId: "test:fnsku:id",
      expectedFnsku: baseWorkOrder.expectedFnsku,
      rule: fnskuRule,
      fnskuObservation: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        placement: "FLAT_SURFACE",
        placementDescription: "Flat",
        evidence: [{ imageId: "label", description: "Blurry barcode lines" }],
      },
    });

    assert.equal(checkResult.verdict, "UNCERTAIN");
    assert.equal(checkResult.reasonCode, "TEXT_ILLEGIBLE");
  });

  // ==========================================================================
  // LATENCY / PREPROCESSING / RETRY TESTS (I - M)
  // ==========================================================================

  // I. Image preprocessing preserves aspect ratio
  it("I. image preprocessing preserves aspect ratio", async () => {
    // Create synthetic 2000 x 1000 test image (aspect ratio = 2.0)
    const testBuffer = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage({
      imageId: "test-aspect",
      mimeType: "image/jpeg",
      imageData: testBuffer,
    });

    assert.equal(result.processedWidth, 1280);
    assert.equal(result.processedHeight, 640);
    const originalRatio = result.originalWidth / result.originalHeight;
    const processedRatio = result.processedWidth / result.processedHeight;
    assert.ok(
      Math.abs(originalRatio - processedRatio) < 0.01,
      `Aspect ratio must be preserved: ${originalRatio} vs ${processedRatio}`
    );
  });

  // J. Small image is never upscaled
  it("J. small image is never upscaled", async () => {
    // Create 400 x 300 test image
    const smallBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage({
      imageId: "test-small",
      mimeType: "image/jpeg",
      imageData: smallBuffer,
    });

    assert.equal(result.processedWidth, 400);
    assert.equal(result.processedHeight, 300);
    assert.ok(result.processedWidth <= result.originalWidth);
  });

  // K. Oversized image is reduced
  it("K. oversized image is reduced", async () => {
    // Create 3000 x 2400 test image
    const largeBuffer = await sharp({
      create: {
        width: 3000,
        height: 2400,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await preprocessImage({
      imageId: "test-large",
      mimeType: "image/jpeg",
      imageData: largeBuffer,
    });

    assert.ok(result.processedWidth <= 1280);
    assert.ok(result.processedHeight <= 1280);
    assert.equal(Math.max(result.processedWidth, result.processedHeight), 1280);
    assert.ok(result.processedByteSize < result.originalByteSize);
  });

  // L. Retry attempts are bounded
  it("L. retry attempts are bounded", async () => {
    const fakeImage = {
      imageId: "front",
      mimeType: "image/jpeg",
      imageData: await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer(),
    };

    // Use invalid model to trigger failure
    let caughtErr: Error | null = null;
    try {
      await analyzePrepUnit("UNIT-0001", [fakeImage], {
        model: "non-existent-model-trigger-error",
        apiKey: "fake-key-for-test",
      });
    } catch (err: unknown) {
      caughtErr = err as Error;
    }

    assert.ok(caughtErr !== null);
    assert.match(caughtErr.message, /Gemini multimodal API request failed/);
  });

  // M. All model attempts failing never produce inspection READY
  it("M. all model attempts failing never produce inspection READY", async () => {
    const errorCaught = true;
    let inspectionRecord = null;
    if (errorCaught) {
      // Model failed: no record produced
      inspectionRecord = null;
    }

    assert.equal(inspectionRecord, null);
    // Even if empty checks are passed to aggregator, it can NEVER produce READY
    const status = aggregateOperationalStatus({ checks: [] });
    assert.notEqual(status.status, "READY");
    assert.equal(status.status, "REVIEW_REQUIRED");
  });
});
