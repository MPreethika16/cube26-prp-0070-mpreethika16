import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOperatorActionableTask,
  getOrderedOperatorProblems,
} from "../../src/lib/inspection/operator-presentation";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { evaluateManufacturerBarcodeCoverage } from "../../src/lib/compliance/evaluators/manufacturer-barcode-coverage";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";

const BASE_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-CONSISTENCY-TEST",
  unitId: "UNIT-CONSISTENCY",
  sku: "SKU-TEST",
  asin: "B0TESTCONSISTENCY",
  expectedFnsku: "X00DUMMY001",
  requirements: {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "REQUIRED",
    handlingMarks: {
      state: "REQUIRED",
      requiredMarks: ["FRAGILE"],
    },
  },
};

function createBaseObservation(): PrepUnitObservation {
  return {
    unitId: "UNIT-CONSISTENCY",
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on label view",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "VISIBLE",
      packagingType: "POLYBAG",
      sealStatus: "SEALED",
      evidence: [{ imageId: "front", description: "Sealed polybag" }],
    },
    suffocationWarning: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedText: "WARNING: To avoid danger of suffocation...",
      evidence: [{ imageId: "front", description: "Legible warning on polybag" }],
    },
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    manufacturerBarcodeCoverage: {
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [{ imageId: "back", description: "Opaque cover label over UPC" }],
    },
    expiryDate: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "2027-12-31",
      evidence: [{ imageId: "back", description: "Clear expiry date" }],
    },
    handlingMarks: [
      {
        detectedType: "FRAGILE",
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "FRAGILE",
        evidence: [{ imageId: "front", description: "Fragile mark" }],
      },
    ],
    otherVisibleIssues: [],
  };
}

describe("Adversarial UI Consistency & Evidence Integrity Tests (Final Audit)", () => {
  // 1. FAIL task cannot use an unrelated evidence image
  it("1. FAIL task cannot use an unrelated evidence image", () => {
    const obs = createBaseObservation();
    // Barcode defect is explicitly observed on the 'back' view
    obs.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "012345678905",
      evidence: [{ imageId: "back", description: "Uncovered barcode on back" }],
    };
    obs.manufacturerBarcodeCoverage = {
      status: "NOT_COVERED",
      coveringType: null,
      evidence: [{ imageId: "back", description: "UPC barcode is exposed" }],
    };

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const barcodeCheck = enriched.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.equal(barcodeCheck.verdict, "FAIL");

    const task = buildOperatorActionableTask({
      enrichedCheck: barcodeCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.ok(task !== null);
    assert.equal(task.internalVerdict, "FAIL");
    assert.equal(
      task.evidenceSlot,
      "back",
      "Defect on back must bind to 'back' evidence slot"
    );
    assert.notEqual(
      task.evidenceSlot,
      "front",
      "Defect on back cannot show unrelated 'front' image"
    );
    assert.notEqual(
      task.evidenceSlot,
      "label",
      "Defect on back cannot show unrelated 'label' image"
    );
  });

  // 2. UNCERTAIN barcode coverage cannot say 'Cover old barcode.'
  it("2. UNCERTAIN barcode coverage cannot say 'Cover old barcode.'", () => {
    const obs = createBaseObservation();
    obs.manufacturerBarcode = {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    };
    obs.manufacturerBarcodeCoverage = {
      status: "UNCERTAIN",
      coveringType: null,
      evidence: [],
    };

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const barcodeCheck = enriched.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.equal(barcodeCheck.verdict, "UNCERTAIN");

    const task = buildOperatorActionableTask({
      enrichedCheck: barcodeCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.ok(task !== null);
    assert.equal(task.internalVerdict, "UNCERTAIN");
    assert.notEqual(
      task.actionTitle,
      "Cover old barcode",
      "UNCERTAIN barcode check must not command worker to cover old barcode"
    );
    assert.notEqual(
      task.humanObservation,
      "The old barcode is still visible.",
      "UNCERTAIN barcode check must not state barcode is visible when evidence does not support it"
    );
    assert.ok(
      task.actionTitle.includes("photo") || task.actionTitle.includes("barcode area"),
      "Action title must be photo-recovery oriented"
    );
    assert.ok(
      task.humanObservation.includes("can't verify") ||
        task.humanObservation.includes("can't confirm") ||
        task.humanObservation.includes("clearer photo"),
      "Observation must reflect inability to verify coverage"
    );
  });

  // 3. Manufacturer barcode NOT_DETECTED cannot produce barcode-coverage PASS solely from non-detection
  it("3. Manufacturer barcode NOT_DETECTED cannot produce barcode-coverage PASS solely from non-detection", () => {
    const res = evaluateManufacturerBarcodeCoverage({
      ruleRequiresBarcodeCoverage: true,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverageObservation: null, // No positive cover label verified
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(
      res.verdict,
      "UNCERTAIN",
      "NOT_DETECTED without positive coverage evidence must yield UNCERTAIN, never PASS"
    );
    assert.equal(res.reasonCode, "FEATURE_NOT_DETECTED");
  });

  // 4. Physical correction task must originate from FAIL
  it("4. Physical correction task must originate from FAIL", () => {
    const obs = createBaseObservation();
    obs.polybag.sealStatus = "NOT_SEALED";

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const sealCheck = enriched.find((c) => c.checkType === "POLYBAG_SEAL")!;
    assert.equal(sealCheck.verdict, "FAIL");

    const task = buildOperatorActionableTask({
      enrichedCheck: sealCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.ok(task !== null);
    assert.equal(task.internalVerdict, "FAIL");
    assert.equal(task.headline, "🔴 FIX NEEDED");
    assert.equal(task.humanVerdictLabel, "Fix needed");
    assert.equal(task.ctaText, "TAKE NEW PHOTO");
  });

  // 5. Evidence-recovery task must originate from UNCERTAIN
  it("5. Evidence-recovery task must originate from UNCERTAIN", () => {
    const obs = createBaseObservation();
    obs.expiryDate.legibility = "ILLEGIBLE";
    obs.expiryDate.detectedValue = null;

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const expiryCheck = enriched.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    )!;
    assert.equal(expiryCheck.verdict, "UNCERTAIN");

    const task = buildOperatorActionableTask({
      enrichedCheck: expiryCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.ok(task !== null);
    assert.equal(task.internalVerdict, "UNCERTAIN");
    assert.equal(task.headline, "📷 TAKE THIS PHOTO AGAIN");
    assert.equal(task.humanVerdictLabel, "Need a clearer photo");
    assert.ok(task.ctaText.includes("RETAKE"));
  });

  // 6. PASS must not create corrective tasks
  it("6. PASS must not create corrective tasks", () => {
    const obs = createBaseObservation(); // fully compliant
    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );

    const passCheck = enriched.find((c) => c.verdict === "PASS")!;
    assert.ok(passCheck !== undefined);

    const task = buildOperatorActionableTask({
      enrichedCheck: passCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.equal(task, null, "PASS check must return null task");

    const problems = getOrderedOperatorProblems({
      enrichedChecks: enriched,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });
    assert.equal(problems.length, 0, "Compliant unit must produce 0 operator tasks");
  });

  // 7. NOT_APPLICABLE must not create corrective tasks
  it("7. NOT_APPLICABLE must not create corrective tasks", () => {
    const noPolybagWO: WorkOrderSpecification = {
      ...BASE_WORK_ORDER,
      requirements: {
        ...BASE_WORK_ORDER.requirements,
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
      },
    };

    const obs = createBaseObservation();
    const record = runPrepInspection({
      observation: obs,
      workOrder: noPolybagWO,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, noPolybagWO, obs, ACTIVE_RULES)
    );

    const naCheck = enriched.find((c) => c.applicability === "NOT_APPLICABLE")!;
    assert.ok(naCheck !== undefined);

    const task = buildOperatorActionableTask({
      enrichedCheck: naCheck,
      workOrder: noPolybagWO,
      observation: obs,
    });

    assert.equal(task, null, "NOT_APPLICABLE check must return null task");
  });

  // 8. Evidence image ID must resolve to the displayed slot
  it("8. Evidence image ID must resolve to the displayed slot", () => {
    const obs = createBaseObservation();
    // Simulate FNSKU identity mismatch defect explicitly seen on 'label'
    obs.fnsku.detectedValue = "X00WRONG999";
    obs.fnsku.evidence = [{ imageId: "label", description: "Label clearly showing wrong FNSKU" }];

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const fnskuCheck = enriched.find((c) => c.checkType === "FNSKU_IDENTITY")!;
    assert.equal(fnskuCheck.verdict, "FAIL");

    const task = buildOperatorActionableTask({
      enrichedCheck: fnskuCheck,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    assert.ok(task !== null);
    assert.equal(task.evidenceSlot, "label");
    assert.equal(task.evidenceSlotDisplay, "LABEL");
  });

  // 9. Cropped/partial FNSKU cannot produce READY
  it("9. Cropped/partial FNSKU cannot produce READY", () => {
    const obs = createBaseObservation();
    obs.fnsku.valueCompleteness = "PARTIAL";
    obs.fnsku.detectedValue = "X00DU"; // partial cropped value

    const record = runPrepInspection({
      observation: obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY")!;
    assert.equal(fnskuCheck.verdict, "UNCERTAIN");
    assert.equal(fnskuCheck.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");

    const opStatus = aggregateOperationalStatus(record);
    assert.notEqual(opStatus.status, "READY");
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
  });

  // 10. Reinspection must use newly captured evidence rather than stale observations
  it("10. Reinspection must use newly captured evidence rather than stale observations", () => {
    // Pass 1: Blurry expiry date
    const pass1Obs = createBaseObservation();
    pass1Obs.expiryDate.legibility = "ILLEGIBLE";
    pass1Obs.expiryDate.detectedValue = null;

    const recordPass1 = runPrepInspection({
      observation: pass1Obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const statusPass1 = aggregateOperationalStatus(recordPass1);
    assert.equal(statusPass1.status, "REVIEW_REQUIRED");
    assert.equal(statusPass1.uncertainCount, 2); // Expiry visibility & legibility

    // Pass 2: Re-inspection with fresh sharp close-up observation
    const pass2Obs = createBaseObservation();
    pass2Obs.expiryDate.legibility = "LEGIBLE";
    pass2Obs.expiryDate.detectedValue = "2027-12-31";
    pass2Obs.expiryDate.evidence = [
      { imageId: "back_closeup", description: "Sharp macro close-up of expiry stamp" },
    ];

    const recordPass2 = runPrepInspection({
      observation: pass2Obs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const statusPass2 = aggregateOperationalStatus(recordPass2);
    assert.equal(
      statusPass2.status,
      "READY",
      "Clean fresh evidence must resolve uncertainty to READY"
    );
    assert.equal(statusPass2.uncertainCount, 0);
    assert.equal(statusPass2.failCount, 0);

    // Verify operator problems list becomes empty
    const enrichedPass2 = recordPass2.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, pass2Obs, ACTIVE_RULES)
    );
    const problemsPass2 = getOrderedOperatorProblems({
      enrichedChecks: enrichedPass2,
      workOrder: BASE_WORK_ORDER,
      observation: pass2Obs,
    });
    assert.equal(problemsPass2.length, 0);
  });
});
