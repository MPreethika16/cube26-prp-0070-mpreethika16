import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEvidenceReadiness,
  type SlotEvidenceInput,
} from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import {
  aggregateOperationalStatus,
  getDeterministicOperatorAction,
} from "../../src/lib/inspection/operational-status";
import { defaultOperationalRouter } from "../../src/lib/recovery/operational-router";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

const VALID_BASE64_JPEG =
  "data:image/jpeg;base64," +
  Buffer.from(new Uint8Array(1024).fill(0xaa)).toString("base64");

function makeMockObservation(
  unitId: string,
  expectedFnsku: string,
  partialObs: Partial<PrepUnitObservation>
): PrepUnitObservation {
  const baseObs: PrepUnitObservation = {
    unitId,
    imageQuality: {
      overall: "GOOD",
      issues: [],
    },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: expectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on label surface",
      evidence: [{ imageId: "label", description: "Legible FNSKU label" }],
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
      evidence: [{ imageId: "back", description: "Opaque cover label over UPC" }],
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

  return {
    ...baseObs,
    ...partialObs,
    ...(partialObs?.fnsku ? { fnsku: { ...baseObs.fnsku, ...partialObs.fnsku } } : {}),
  };
}

describe("Operator Journey Integration Tests (Day 5 / Step 3)", () => {
  const activeRules = ACTIVE_RULES;
  const policyContext = PRODUCTION_POLICY_CONTEXT;

  // A. Evidence missing -> Inspect disabled
  it("Journey A: Missing visual evidence marks inspect as disabled (canInspect = false)", () => {
    const readiness = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", dataUrl: null, mimeType: "image/jpeg" },
        back: { slotId: "back", dataUrl: null, mimeType: "image/jpeg" },
        label: { slotId: "label", dataUrl: null, mimeType: "image/jpeg" },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(readiness.status, "NOT_READY");
    assert.equal(readiness.canInspect, false);
    assert.equal(readiness.missingSlots.length, 3);
  });

  // B. Evidence ready -> Inspect enabled
  it("Journey B: Complete visual evidence marks inspect as enabled (canInspect = true)", () => {
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

    const readiness = evaluateEvidenceReadiness({
      slots,
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(readiness.status, "READY");
    assert.equal(readiness.canInspect, true);
    assert.equal(readiness.warnings.length, 0);
  });

  // C. Positive defect -> STOP_AND_FIX -> FIX_PREP displayed
  it("Journey C: Positive physical defect triggers STOP_AND_FIX with FIX_PREP operational routing", async () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    // Visible uncovered barcode is a positive defect
    const observation = makeMockObservation("UNIT-0001", workOrder.expectedFnsku, {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [{ imageId: "back", description: "UPC barcode exposed" }],
      },
      manufacturerBarcodeCoverage: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [{ imageId: "back", description: "UPC barcode uncovered" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");
    assert.ok(opStatus.failCount >= 1);
    assert.ok(opStatus.blockingCheckTypes.includes("MANUFACTURER_BARCODE_COVERAGE"));

    // Verify recovery plan
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord: record,
      operationalStatus: opStatus,
    });

    // Verify routing
    const routing = await defaultOperationalRouter.route({
      unitId: workOrder.unitId,
      inspectionRecord: record,
      operationalStatus: opStatus,
      recoveryPlan,
    });
    assert.equal(routing, "FIX_PREP");

    // Verify operator directive
    const barcodeCheck = record.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    );
    assert.ok(barcodeCheck);
    const action = getDeterministicOperatorAction(barcodeCheck);
    assert.ok(action && action.includes("Cover the manufacturer barcode"));
  });

  // D. Uncertain evidence -> RECAPTURE action displayed
  it("Journey D: Uncertain observation triggers REVIEW_REQUIRED with targeted RECAPTURE_EVIDENCE plan", async () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");
    // Blurry expiry is uncertain
    const observation = makeMockObservation("DEMO-RECOVERY", workOrder.expectedFnsku, {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurry expiration date text" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
    assert.ok(opStatus.uncertainCheckTypes.includes("EXPIRY_LEGIBILITY"));

    // Verify recovery plan
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord: record,
      operationalStatus: opStatus,
    });
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.actionType === "CAPTURE_CLOSEUP" &&
          a.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY")
      )
    );

    // Verify routing
    const routing = await defaultOperationalRouter.route({
      unitId: workOrder.unitId,
      inspectionRecord: record,
      operationalStatus: opStatus,
      recoveryPlan,
    });
    assert.equal(routing, "RECAPTURE_EVIDENCE");
  });

  // E. Reinspection after better evidence -> new result generated (UNCERTAIN -> PASS transition)
  it("Journey E: Reinspection pass with clear evidence produces clean new result transitioning UNCERTAIN -> PASS", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");

    // Pass 1: Blurry expiry
    const obsPass1 = makeMockObservation("DEMO-RECOVERY", workOrder.expectedFnsku, {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurry expiration text" }],
      },
    });

    const recordPass1 = runPrepInspection({
      observation: obsPass1,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const expiryCheckPass1 = recordPass1.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    );
    assert.equal(expiryCheckPass1?.verdict, "UNCERTAIN");
    const opStatusPass1 = aggregateOperationalStatus(recordPass1);
    assert.equal(opStatusPass1.status, "REVIEW_REQUIRED");

    // Pass 2: Clean re-inspection with sharp macro close-up
    const obsPass2 = makeMockObservation("DEMO-RECOVERY", workOrder.expectedFnsku, {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "08/2027",
        evidence: [{ imageId: "back", description: "Sharp macro expiry date 08/2027" }],
      },
    });

    const recordPass2 = runPrepInspection({
      observation: obsPass2,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const expiryCheckPass2 = recordPass2.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    );
    assert.equal(expiryCheckPass2?.verdict, "PASS");
    const opStatusPass2 = aggregateOperationalStatus(recordPass2);
    assert.equal(opStatusPass2.status, "READY");

    // Verify previous inspection state was not mutated
    assert.equal(expiryCheckPass1?.verdict, "UNCERTAIN");
    assert.equal(opStatusPass1.status, "REVIEW_REQUIRED");
  });

  // F. Model failure -> no READY state
  it("Journey F: Model failure rejects cleanly and never yields a false READY state", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");

    // When vision layer throws an error or returns invalid data
    assert.throws(
      () => {
        // Attempting to run with mismatched unit identity
        const invalidObs = makeMockObservation("WRONG-UNIT", workOrder.expectedFnsku, {});
        runPrepInspection({
          observation: invalidObs,
          workOrder,
          rules: activeRules,
          policyContext,
        });
      },
      (err: Error) => {
        assert.ok(err.message.includes("Unit identity mismatch"));
        return true;
      }
    );
  });

  // G. NOT_APPLICABLE check -> displayed separately from PASS
  it("Journey G: NOT_APPLICABLE checks have verdict = null and are counted separately from PASS", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-COMPLIANT");
    assert.equal(workOrder.requirements.polybag, "NOT_REQUIRED");

    const observation = makeMockObservation(
      "DEMO-COMPLIANT",
      workOrder.expectedFnsku,
      {}
    );

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const polybagCheck = record.checks.find(
      (c) => c.checkType === "POLYBAG_PRESENCE"
    );
    assert.ok(polybagCheck);
    assert.equal(polybagCheck.applicability, "NOT_APPLICABLE");
    assert.equal(polybagCheck.verdict, null);

    const opStatus = aggregateOperationalStatus(record);
    assert.ok(opStatus.notApplicableCount >= 1);
    // Ensure N/A was not tallied into passCount
    assert.equal(
      opStatus.passCount +
        opStatus.failCount +
        opStatus.uncertainCount +
        opStatus.notApplicableCount,
      record.checks.length
    );
  });

  // H. Policy provenance is available in inspection details
  it("Journey H: Enriched check models expose publisher, URL, and retrievalDate provenance", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-COMPLIANT");
    const observation = makeMockObservation(
      "DEMO-COMPLIANT",
      workOrder.expectedFnsku,
      {}
    );

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    for (const check of record.checks) {
      const enriched = buildEnrichedCheck(
        check,
        workOrder,
        observation,
        activeRules
      );

      assert.ok(enriched.policyTitle.length > 0, "Must have policy title");
      assert.ok(enriched.policySource.publisher.length > 0, "Must have publisher");
      assert.ok(enriched.policySource.url.startsWith("http"), "Must have URL");
      assert.ok(
        enriched.policySource.retrievalDate.length > 0,
        "Must have retrieval date"
      );
    }
  });

  // I. No UI component independently derives compliance from raw observations
  it("Journey I: Enriched checks strictly adopt the verdict computed by the rule engine", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const rawObs = makeMockObservation("UNIT-0001", workOrder.expectedFnsku, {});

    // Even if rawObs has certain properties, enrichedCheck MUST strictly take check.verdict
    const complianceCheck = {
      checkId: "chk:barcode_coverage",
      checkType: "MANUFACTURER_BARCODE_COVERAGE" as const,
      applicability: "APPLICABLE" as const,
      verdict: "FAIL" as const,
      reasonCode: "REQUIREMENT_VIOLATED" as const,
      explanation: "Manufacturer barcode is exposed",
      rule: { ruleId: "AMZ-PREP-BC-001", version: "1.0" },
      evidence: [{ imageId: "back", description: "UPC barcode visible" }],
      observedValue: null,
    };

    const enriched = buildEnrichedCheck(complianceCheck, workOrder, rawObs, activeRules);

    assert.equal(enriched.verdict, "FAIL");
    assert.equal(enriched.reasonCode, "REQUIREMENT_VIOLATED");
    assert.equal(enriched.shortReason, "Manufacturer barcode is exposed");
  });
});
