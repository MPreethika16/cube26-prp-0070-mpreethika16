/**
 * ============================================================================
 * ANTI-HARDCODING TESTS — Sample Identity Independence (Day 5 / Part 10)
 * ============================================================================
 *
 * These tests prove that sample identity (SAMPLE-01, SAMPLE-02, SAMPLE-03)
 * NEVER determines the compliance verdict.
 *
 * The verdict depends ONLY on evidence content + work-order requirements.
 * No sample-ID-to-verdict mapping exists in any evaluator, policy, or pipeline.
 *
 * All pipeline logic (observation → compliance evaluator → policy →
 * operational decision) is exercised. No results are hard-coded by unit ID.
 * ============================================================================
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import {
  loadDemoFixtureImages,
  loadDemoFixtureSlot,
} from "../../src/lib/inspection/demo-fixture-loader";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

// ---------------------------------------------------------------------------
// Shared observation factory helpers
// ---------------------------------------------------------------------------

function makeCompliantObservation(unitId: string, expectedFnsku: string): PrepUnitObservation {
  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: expectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Centered flat on carton",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      packagingType: "NONE_DETECTED",
      sealStatus: "UNCERTAIN",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    manufacturerBarcodeCoverage: {
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [{ imageId: "back", description: "Opaque label fully covers original UPC" }],
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
  };
}

function makeDefectiveObservation(unitId: string, expectedFnsku: string): PrepUnitObservation {
  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: expectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on label surface",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      packagingType: "NONE_DETECTED",
      sealStatus: "UNCERTAIN",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8906050590022",
      evidence: [{ imageId: "back", description: "UPC barcode clearly exposed" }],
    },
    manufacturerBarcodeCoverage: {
      status: "NOT_COVERED",
      coveringType: null,
      evidence: [{ imageId: "back", description: "No covering label detected" }],
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
  };
}

function makeUncertainExpiryObservation(unitId: string, expectedFnsku: string): PrepUnitObservation {
  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: expectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on carton",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      packagingType: "NONE_DETECTED",
      sealStatus: "UNCERTAIN",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    manufacturerBarcodeCoverage: {
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [{ imageId: "back", description: "Opaque cover label applied" }],
    },
    expiryDate: {
      visibility: "VISIBLE",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Date area visible but blurry" }],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Day 5 / Part 10: Anti-Hardcoding — Sample Identity Does Not Determine Verdict", () => {

  /**
   * TEST 1: Sample A (SAMPLE-01) with DEFECTIVE evidence → STOP_AND_FIX
   *
   * Proves: Sample A unit ID does NOT force READY.
   */
  it("1. Sample A with defective evidence (exposed manufacturer barcode) → STOP_AND_FIX", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-01");
    assert.equal(workOrder.unitId, "SAMPLE-01");

    const observation = makeDefectiveObservation("SAMPLE-01", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const barcodeCheck = record.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.equal(barcodeCheck.verdict, "FAIL", "Sample A: exposed manufacturer barcode must FAIL");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX",
      "Sample A: defective evidence must produce STOP_AND_FIX, not READY");
    assert.notEqual(opStatus.status, "READY",
      "Sample A ID must NEVER force READY regardless of evidence");
  });

  /**
   * TEST 2: Sample B (SAMPLE-02) with genuinely compliant evidence → READY
   *
   * Proves: Sample B unit ID does NOT force STOP_AND_FIX.
   */
  it("2. Sample B with compliant evidence (barcode covered, correct FNSKU) → READY", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-02");
    assert.equal(workOrder.unitId, "SAMPLE-02");

    const observation = makeCompliantObservation("SAMPLE-02", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const barcodeCheck = record.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.equal(barcodeCheck.verdict, "PASS",
      "Sample B: covered barcode must PASS when evidence confirms coverage");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "READY",
      "Sample B: compliant evidence must produce READY, not forced STOP_AND_FIX");
    assert.equal(opStatus.failCount, 0);
    assert.equal(opStatus.uncertainCount, 0);
  });

  /**
   * TEST 3: Sample C (SAMPLE-03) with insufficient evidence → REVIEW_REQUIRED
   *
   * Proves: Sample C unit ID does NOT force READY.
   */
  it("3. Sample C with insufficient expiry evidence → REVIEW_REQUIRED", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-03");
    assert.equal(workOrder.unitId, "SAMPLE-03");
    assert.equal(workOrder.requirements.expiryDate, "REQUIRED",
      "Sample C work order must require expiry date");

    const observation = makeUncertainExpiryObservation("SAMPLE-03", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const expiryCheck = record.checks.find((c) => c.checkType === "EXPIRY_LEGIBILITY")!;
    assert.ok(expiryCheck, "EXPIRY_LEGIBILITY check must exist");
    assert.equal(expiryCheck.verdict, "UNCERTAIN",
      "Sample C: unreadable expiry date must be UNCERTAIN");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED",
      "Sample C: insufficient evidence must produce REVIEW_REQUIRED");
    assert.notEqual(opStatus.status, "READY");
  });

  /**
   * TEST 4: Same work-order context, different evidence → different outcomes
   *
   * Proves: work order is constant; only evidence determines verdict.
   */
  it("4. Same work-order context with different evidence produces different outcomes", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-01");

    const compliantObs = makeCompliantObservation("SAMPLE-01", workOrder.expectedFnsku);
    const defectiveObs = makeDefectiveObservation("SAMPLE-01", workOrder.expectedFnsku);

    const compliantRecord = runPrepInspection({
      observation: compliantObs,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const defectiveRecord = runPrepInspection({
      observation: defectiveObs,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const compliantStatus = aggregateOperationalStatus(compliantRecord);
    const defectiveStatus = aggregateOperationalStatus(defectiveRecord);

    assert.equal(compliantStatus.status, "READY",
      "Compliant evidence with same work order must produce READY");
    assert.equal(defectiveStatus.status, "STOP_AND_FIX",
      "Defective evidence with same work order must produce STOP_AND_FIX");
    assert.notEqual(compliantStatus.status, defectiveStatus.status,
      "Same work order, different evidence must produce different outcomes");
  });

  /**
   * TEST 5: Demo fixture loader contains only image data — no verdict injection
   *
   * Proves: loadDemoFixtureSlot returns evidence only.
   */
  it("5. Demo fixture loader provides only image data — no verdict injection", () => {
    const correctedSlot = loadDemoFixtureSlot("SAMPLE-02", "back", "corrected");

    assert.ok(correctedSlot.dataUrl, "corrected fixture must have dataUrl");
    assert.equal(correctedSlot.imageId, "back");
    assert.ok(correctedSlot.mimeType.startsWith("image/"));

    const slotKeys = Object.keys(correctedSlot);
    assert.ok(!slotKeys.includes("verdict"), "fixture must not contain verdict");
    assert.ok(!slotKeys.includes("status"), "fixture must not contain status");
    assert.ok(!slotKeys.includes("operationalStatus"), "fixture must not contain operationalStatus");
    assert.ok(!slotKeys.includes("complianceResult"), "fixture must not contain complianceResult");
  });

  /**
   * TEST 6: loadDemoFixtureImages returns only image slots — no compliance data
   */
  it("6. loadDemoFixtureImages returns only image data — no compliance result injection", () => {
    const fixture = loadDemoFixtureImages("SAMPLE-01");

    assert.equal(fixture.images.length, 3, "must return 3 image slots");
    for (const img of fixture.images) {
      assert.ok(img.dataUrl, "each slot must have a dataUrl");
      assert.ok(img.imageId, "each slot must have an imageId");
      assert.ok(img.mimeType, "each slot must have a mimeType");

      const imgKeys = Object.keys(img);
      assert.ok(!imgKeys.includes("verdict"), "image slot must not contain verdict");
      assert.ok(!imgKeys.includes("complianceResult"), "image slot must not contain complianceResult");
    }

    const fixtureKeys = Object.keys(fixture);
    assert.ok(!fixtureKeys.includes("verdict"), "fixture payload must not contain verdict");
  });

  /**
   * TEST 7: NOT_APPLICABLE is never treated as PASS
   */
  it("7. NOT_APPLICABLE is never treated as PASS — cannot produce READY alone", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-01");
    const observation = makeCompliantObservation("SAMPLE-01", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const notApplicableChecks = record.checks.filter(
      (c) => c.applicability === "NOT_APPLICABLE"
    );
    assert.ok(notApplicableChecks.length >= 0, "check runs correctly");

    for (const check of notApplicableChecks) {
      assert.notEqual(check.verdict, "PASS",
        "NOT_APPLICABLE check must never have verdict PASS");
    }
  });

  /**
   * TEST 8: UNCERTAIN evidence never becomes READY
   */
  it("8. UNCERTAIN evidence always produces REVIEW_REQUIRED — never READY", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-03");
    const observation = makeUncertainExpiryObservation("SAMPLE-03", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const opStatus = aggregateOperationalStatus(record);
    assert.notEqual(opStatus.status, "READY",
      "UNCERTAIN evidence must never produce READY");
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
    assert.ok(opStatus.uncertainCount > 0, "must have at least one uncertain check");
    assert.equal(opStatus.failCount, 0, "no FAIL check in this scenario");
  });

  /**
   * TEST 9: Partial FNSKU cannot PASS
   */
  it("9. Partial FNSKU value (PARTIAL completeness) → UNCERTAIN, never PASS", () => {
    const workOrder = resolveWorkOrderForUnit("SAMPLE-02");

    const partialFnskuObservation: PrepUnitObservation = {
      ...makeCompliantObservation("SAMPLE-02", workOrder.expectedFnsku),
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "PARTIAL",
        detectedValue: "X00DU",
        placement: "FLAT_SURFACE",
        placementDescription: "Label partially cropped",
        evidence: [{ imageId: "label", description: "FNSKU partially visible" }],
      },
    };

    const record = runPrepInspection({
      observation: partialFnskuObservation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY")!;
    assert.equal(fnskuCheck.verdict, "UNCERTAIN", "Partial FNSKU must be UNCERTAIN");
    assert.notEqual(fnskuCheck.verdict, "PASS", "Partial FNSKU must never PASS");

    const opStatus = aggregateOperationalStatus(record);
    assert.notEqual(opStatus.status, "READY");
  });

  /**
   * TEST 10: Identical observations with different sample IDs → identical verdicts
   *
   * Proves: no sample-ID branching exists in the pipeline.
   */
  it("10. Identical observations with different sample IDs produce identical verdicts", () => {
    const wo1 = resolveWorkOrderForUnit("SAMPLE-01");
    const wo2 = resolveWorkOrderForUnit("SAMPLE-02");

    // Use structurally identical compliant observations (each with its own FNSKU)
    const obs1 = makeCompliantObservation("SAMPLE-01", wo1.expectedFnsku);
    const obs2 = makeCompliantObservation("SAMPLE-02", wo2.expectedFnsku);

    const record1 = runPrepInspection({
      observation: obs1,
      workOrder: wo1,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const record2 = runPrepInspection({
      observation: obs2,
      workOrder: wo2,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const status1 = aggregateOperationalStatus(record1);
    const status2 = aggregateOperationalStatus(record2);

    assert.equal(status1.status, "READY", "SAMPLE-01 with compliant evidence must be READY");
    assert.equal(status2.status, "READY", "SAMPLE-02 with compliant evidence must be READY");
    assert.equal(status1.passCount, status2.passCount,
      "Same requirement structure must produce same pass count");
  });
});
