import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import {
  DeterministicOperationalRouter,
  type OperationalRoutingInput,
} from "../../src/lib/recovery/operational-router";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../../src/lib/compliance/compliance-result.schema";
import type { PrepCheckType } from "../../src/lib/compliance/check-types";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";

function makeCheck(params: {
  checkType: PrepCheckType;
  applicability: "APPLICABLE" | "NOT_APPLICABLE";
  verdict: "PASS" | "FAIL" | "UNCERTAIN" | null;
  reasonCode?:
    | "REQUIREMENT_SATISFIED"
    | "REQUIREMENT_VIOLATED"
    | "INSUFFICIENT_VISUAL_EVIDENCE"
    | "FEATURE_NOT_DETECTED"
    | "TEXT_ILLEGIBLE"
    | "EXPECTED_VALUE_MISMATCH"
    | "PLACEMENT_INVALID"
    | "NOT_APPLICABLE";
  explanation?: string;
}): ComplianceCheckResult {
  return complianceCheckResultSchema.parse({
    checkId: `test:${params.checkType}`,
    checkType: params.checkType,
    applicability: params.applicability,
    verdict: params.verdict,
    reasonCode:
      params.reasonCode ??
      (params.applicability === "NOT_APPLICABLE"
        ? "NOT_APPLICABLE"
        : params.verdict === "PASS"
        ? "REQUIREMENT_SATISFIED"
        : params.verdict === "FAIL"
        ? "REQUIREMENT_VIOLATED"
        : "INSUFFICIENT_VISUAL_EVIDENCE"),
    explanation: params.explanation ?? `Evaluation of ${params.checkType}`,
    rule: {
      ruleId: `RULE-TEST-${params.checkType}`,
      version: "1.0",
    },
    evidence: [],
    observedValue: null,
  });
}

describe("Evidence Recovery Agent (Day 4 / Step 2)", () => {
  // 1. uncertain FNSKU identity -> label close-up
  it("1. uncertain FNSKU identity produces CAPTURE_CLOSEUP targeting FNSKU label", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.checkType, "FNSKU_IDENTITY");
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.target, "FNSKU label");
    assert.deepEqual(action.resolvesCheckTypes, ["FNSKU_IDENTITY"]);
  });

  // 2. uncertain FNSKU placement -> label/surface close-up
  it("2. uncertain FNSKU placement produces CAPTURE_CLOSEUP targeting label and surface", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.checkType, "FNSKU_PLACEMENT");
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(
      action.target,
      "full FNSKU label and surrounding package surface"
    );
    assert.deepEqual(action.resolvesCheckTypes, ["FNSKU_PLACEMENT"]);
  });

  // 3. both FNSKU uncertainties deduplicate
  it("3. co-occurring FNSKU identity and placement uncertainties deduplicate into 1 high-priority action", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      }),
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(
      plan.actions.length,
      1,
      "FNSKU identity and placement must deduplicate into 1 action"
    );
    const action = plan.actions[0];
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.priority, "HIGH");
    assert.deepEqual(action.resolvesCheckTypes, [
      "FNSKU_IDENTITY",
      "FNSKU_PLACEMENT",
    ]);
  });

  // 4. uncertain barcode coverage -> barcode evidence request
  it("4. uncertain barcode coverage produces barcode evidence recapture action", () => {
    const checks = [
      makeCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.actionType, "RECAPTURE_BACK");
    assert.equal(action.target, "manufacturer barcode area");
    assert.deepEqual(action.resolvesCheckTypes, [
      "MANUFACTURER_BARCODE_COVERAGE",
    ]);
  });

  // 5. uncertain seal -> closure close-up
  it("5. uncertain polybag seal produces closure close-up action", () => {
    const checks = [
      makeCheck({
        checkType: "POLYBAG_SEAL",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.target, "complete bag closure");
    assert.deepEqual(action.resolvesCheckTypes, ["POLYBAG_SEAL"]);
  });

  // 6. uncertain warning -> warning close-up
  it("6. uncertain suffocation warning presence/legibility produces warning close-up", () => {
    const checks = [
      makeCheck({
        checkType: "SUFFOCATION_WARNING_PRESENCE",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
      makeCheck({
        checkType: "SUFFOCATION_WARNING_LEGIBILITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "TEXT_ILLEGIBLE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1, "Warning checks must deduplicate");
    const action = plan.actions[0];
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.target, "suffocation warning text");
    assert.equal(action.priority, "HIGH");
  });

  // 7. uncertain expiry -> expiry close-up
  it("7. uncertain expiry visibility/legibility produces expiry close-up", () => {
    const checks = [
      makeCheck({
        checkType: "EXPIRY_VISIBILITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
      makeCheck({
        checkType: "EXPIRY_LEGIBILITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "TEXT_ILLEGIBLE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1, "Expiry checks must deduplicate");
    const action = plan.actions[0];
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.target, "expiry/date area");
    assert.equal(action.priority, "HIGH");
  });

  // 8. uncertain handling marks -> full package
  it("8. uncertain handling marks produces CAPTURE_FULL_PACKAGE", () => {
    const checks = [
      makeCheck({
        checkType: "HANDLING_MARKS",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, true);
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.actionType, "CAPTURE_FULL_PACKAGE");
    assert.equal(action.target, "all packaging surfaces");
    assert.deepEqual(action.resolvesCheckTypes, ["HANDLING_MARKS"]);
  });

  // 9. FAIL does not create recapture request
  it("9. FAIL checks do not create recovery recapture requests", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "FAIL",
        reasonCode: "EXPECTED_VALUE_MISMATCH",
      }),
      makeCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "FAIL",
        reasonCode: "REQUIREMENT_VIOLATED",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    assert.equal(operationalStatus.status, "STOP_AND_FIX");

    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, false);
    assert.equal(plan.actions.length, 0);
  });

  // 10. PASS does not create recapture request
  it("10. PASS checks do not create recovery recapture requests", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    assert.equal(operationalStatus.status, "READY");

    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, false);
    assert.equal(plan.actions.length, 0);
  });

  // 11. NOT_APPLICABLE does not create recapture request
  it("11. NOT_APPLICABLE checks do not create recovery recapture requests", () => {
    const checks = [
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
      makeCheck({
        checkType: "SUFFOCATION_WARNING_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });

    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.requiresEvidence, false);
    assert.equal(plan.actions.length, 0);
  });

  // 12. recovery actions never modify verdicts
  it("12. recovery actions never modify compliance verdicts or operational status", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      }),
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
    ];
    const inspectionRecord = { unitId: "UNIT-0001", checks };
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    const checksSnapshot = JSON.stringify(checks);
    const statusSnapshot = JSON.stringify(operationalStatus);

    planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    assert.equal(
      JSON.stringify(inspectionRecord.checks),
      checksSnapshot,
      "Inspection record checks must remain unaltered"
    );
    assert.equal(
      JSON.stringify(operationalStatus),
      statusSnapshot,
      "Operational status must remain unaltered"
    );
  });

  // 13. priority ordering deterministic
  it("13. priority ordering is strictly deterministic (HIGH precedes MEDIUM)", () => {
    const checks = [
      makeCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      }),
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      }),
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });

    assert.equal(plan.actions.length, 2);
    // HIGH priority (deduplicated FNSKU resolving 2 checks) must be first
    assert.equal(plan.actions[0].priority, "HIGH");
    assert.deepEqual(plan.actions[0].resolvesCheckTypes, [
      "FNSKU_IDENTITY",
      "FNSKU_PLACEMENT",
    ]);
    // MEDIUM priority (barcode coverage) must be second
    assert.equal(plan.actions[1].priority, "MEDIUM");
    assert.deepEqual(plan.actions[1].resolvesCheckTypes, [
      "MANUFACTURER_BARCODE_COVERAGE",
    ]);
  });

  // 14. re-inspection invokes normal pipeline
  it("14. re-inspection pass executes the clean deterministic compliance pipeline", () => {
    const workOrder: WorkOrderSpecification = {
      workOrderId: "WO-3000",
      unitId: "UNIT-0002",
      sku: "SKU-CANDLE-3",
      asin: "B0DUMMY964",
      expectedFnsku: "X00DUMMY002",
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "REQUIRED",
          requiredMarks: ["fragile"],
        },
      },
    };

    // Initial observation: FNSKU label NOT_DETECTED
    const initialObs: PrepUnitObservation = {
      unitId: "UNIT-0002",
      imageQuality: { overall: "GOOD", issues: [] },
      polybag: { visibility: "NOT_DETECTED", sealStatus: "UNCERTAIN", evidence: [] },
      suffocationWarning: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [],
      },
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [],
      },
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      handlingMarks: [
        {
          detectedType: "fragile",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "FRAGILE",
          evidence: [],
        },
      ],
      otherVisibleIssues: [],
    };

    const initialInspection = runPrepInspection({
      observation: initialObs,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const initialStatus = aggregateOperationalStatus(initialInspection);

    // Initial status has UNCERTAIN for FNSKU_IDENTITY
    const fnskuCheck1 = initialInspection.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheck1.verdict, "UNCERTAIN");

    // Re-inspection observation: clearer photo supplied, FNSKU is detected
    const recapturedObs: PrepUnitObservation = {
      ...initialObs,
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY002",
        placement: "FLAT_SURFACE",
        placementDescription: "Affixed flat on side of carton",
        evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
      },
    };

    const reInspection = runPrepInspection({
      observation: recapturedObs,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const reStatus = aggregateOperationalStatus(reInspection);

    // Re-inspection FNSKU check evaluates cleanly to PASS
    const fnskuCheck2 = reInspection.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheck2.verdict, "PASS");
    assert.notEqual(
      initialStatus.passCount,
      reStatus.passCount,
      "Re-inspection updates pass count via normal pipeline execution"
    );
  });

  // 15. router interface cannot alter compliance results
  it("15. operational router provides decision without altering compliance results", async () => {
    const router = new DeterministicOperationalRouter();

    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      }),
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
    ];
    const inspectionRecord = { unitId: "UNIT-0001", checks };
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const input: OperationalRoutingInput = {
      unitId: "UNIT-0001",
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    };

    const decision = await router.route(input);

    assert.equal(decision, "RECAPTURE_EVIDENCE");
    // Ensure all verdicts, reasonCodes, and counts are intact
    assert.equal(input.operationalStatus.status, "REVIEW_REQUIRED");
    assert.equal(input.inspectionRecord.checks[0].verdict, "UNCERTAIN");
    assert.equal(input.inspectionRecord.checks[1].verdict, "PASS");
  });
});
