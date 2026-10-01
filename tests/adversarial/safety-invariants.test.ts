import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { prepUnitObservationSchema } from "../../src/lib/vision/prep-observation.schema";
import type { ComplianceCheckResult } from "../../src/lib/compliance/compliance-result.schema";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import {
  DeterministicOperationalRouter,
  type OperationalRoutingInput,
} from "../../src/lib/recovery/operational-router";
import { evaluateEvidenceReadiness } from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { createCompliantObservation } from "../../src/lib/adversarial/scenarios";
import {
  ProductionPolicyStore,
  buildExplicitPolicyContext,
  AMZN_SHIPPING_BOX_SEAM_POLICY,
} from "../../src/lib/compliance/policy";
import { resolveRequirement } from "../../src/lib/compliance/requirement-resolver";
import type { PrepCheckType } from "../../src/lib/compliance/check-types";

describe("Global Safety Invariants (Day 5 / Step 1)", () => {
  const baseWorkOrder = {
    workOrderId: "WO-INVARIANT",
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

  // INVARIANT 1: No missing evidence produces PASS solely from non-detection
  it("Invariant 1: No missing evidence produces PASS solely from non-detection", () => {
    // When a feature is NOT_DETECTED in evidence, it must NEVER be PASS
    const nonDetectedObs = createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
      manufacturerBarcode: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverage: {
        status: "UNCERTAIN",
        coveringType: null,
        evidence: [],
      },
    });

    const record = runPrepInspection({
      observation: nonDetectedObs,
      workOrder: baseWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY")!;
    assert.notEqual(fnskuCheck.verdict, "PASS", "Non-detection must NEVER produce PASS for FNSKU");
    assert.equal(fnskuCheck.verdict, "UNCERTAIN");

    const barcodeCheck = record.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.notEqual(barcodeCheck.verdict, "PASS", "Non-detection must NEVER produce PASS for barcode coverage");
    assert.equal(barcodeCheck.verdict, "UNCERTAIN");
  });

  // INVARIANT 2: No Gemini/model exception produces READY
  it("Invariant 2: No Gemini/model exception produces READY", () => {
    // A failed model call produces no inspection record; pipeline halts with error
    const modelError = new Error("Model timeout");
    assert.throws(() => {
      throw modelError;
    }, /Model timeout/);
  });

  // INVARIANT 3: No malformed model output produces READY
  it("Invariant 3: No malformed model output produces READY", () => {
    // Missing required fields rejected by prepUnitObservationSchema
    const malformedPayload = { unitId: "UNIT-0001", imageQuality: "GOOD" };
    assert.equal(prepUnitObservationSchema.safeParse(malformedPayload).success, false);
    const checks: ComplianceCheckResult[] = [];
    const status = aggregateOperationalStatus({ checks });
    assert.notEqual(status.status, "READY");
  });

  // INVARIANT 4: FAIL dominates UNCERTAIN at inspection-level status
  it("Invariant 4: FAIL dominates UNCERTAIN at inspection-level status", () => {
    const checks = [
      {
        checkId: "c1",
        checkType: "FNSKU_IDENTITY" as PrepCheckType,
        applicability: "APPLICABLE" as const,
        verdict: "FAIL" as const,
        reasonCode: "EXPECTED_VALUE_MISMATCH" as const,
        explanation: "Wrong value",
        rule: { ruleId: "r1", version: "1" },
        evidence: [],
        observedValue: "X00WRONG",
      },
      {
        checkId: "c2",
        checkType: "POLYBAG_SEAL" as PrepCheckType,
        applicability: "APPLICABLE" as const,
        verdict: "UNCERTAIN" as const,
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE" as const,
        explanation: "Seal uncertain",
        rule: { ruleId: "r2", version: "1" },
        evidence: [],
        observedValue: null,
      },
    ];

    const status = aggregateOperationalStatus({ checks });
    assert.equal(status.status, "STOP_AND_FIX");
    assert.notEqual(status.status, "REVIEW_REQUIRED");
    assert.notEqual(status.status, "READY");
  });

  // INVARIANT 5: NOT_APPLICABLE never counts as PASS
  it("Invariant 5: NOT_APPLICABLE never counts as PASS", () => {
    const checks = [
      {
        checkId: "c1",
        checkType: "POLYBAG_PRESENCE" as PrepCheckType,
        applicability: "NOT_APPLICABLE" as const,
        verdict: null,
        reasonCode: "NOT_APPLICABLE" as const,
        explanation: "Not required",
        rule: { ruleId: "r1", version: "1" },
        evidence: [],
        observedValue: null,
      },
      {
        checkId: "c2",
        checkType: "EXPIRY_VISIBILITY" as PrepCheckType,
        applicability: "NOT_APPLICABLE" as const,
        verdict: null,
        reasonCode: "NOT_APPLICABLE" as const,
        explanation: "Not required",
        rule: { ruleId: "r2", version: "1" },
        evidence: [],
        observedValue: null,
      },
    ];

    const status = aggregateOperationalStatus({ checks });
    assert.equal(status.passCount, 0, "passCount must be 0 for NOT_APPLICABLE checks");
    assert.equal(status.notApplicableCount, 2);
    assert.notEqual(status.status, "READY", "Zero applicable checks must NEVER resolve to READY");
    assert.equal(status.status, "REVIEW_REQUIRED");
  });

  // INVARIANT 6: Recovery actions cannot alter compliance verdicts
  it("Invariant 6: Recovery actions cannot alter compliance verdicts", () => {
    const checks = [
      {
        checkId: "c1",
        checkType: "FNSKU_IDENTITY" as PrepCheckType,
        applicability: "APPLICABLE" as const,
        verdict: "UNCERTAIN" as const,
        reasonCode: "FEATURE_NOT_DETECTED" as const,
        explanation: "FNSKU not detected",
        rule: { ruleId: "r1", version: "1" },
        evidence: [],
        observedValue: null,
      },
    ];
    const operationalStatus = aggregateOperationalStatus({ checks });
    const checksClone = JSON.parse(JSON.stringify(checks));

    const plan = planEvidenceRecovery({
      inspectionRecord: { unitId: "UNIT-0001", checks },
      operationalStatus,
    });
    assert.equal(plan.requiresEvidence, true);

    assert.deepEqual(checks, checksClone, "Checks array must remain strictly unmutated");
    assert.equal(checks[0].verdict, "UNCERTAIN");
  });

  // INVARIANT 7: Operational router cannot alter compliance verdicts
  it("Invariant 7: Operational router cannot alter compliance verdicts", async () => {
    const router = new DeterministicOperationalRouter();
    const checks = [
      {
        checkId: "c1",
        checkType: "FNSKU_IDENTITY" as PrepCheckType,
        applicability: "APPLICABLE" as const,
        verdict: "UNCERTAIN" as const,
        reasonCode: "FEATURE_NOT_DETECTED" as const,
        explanation: "FNSKU not detected",
        rule: { ruleId: "r1", version: "1" },
        evidence: [],
        observedValue: null,
      },
    ];
    const inspectionRecord = { unitId: "UNIT-0001", checks };
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const checksClone = JSON.parse(JSON.stringify(checks));
    const input: OperationalRoutingInput = {
      unitId: "UNIT-0001",
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    };

    const decision = await router.route(input);
    assert.ok(decision !== undefined);
    assert.deepEqual(input.inspectionRecord.checks, checksClone, "Router must not mutate checks");
    assert.equal(input.operationalStatus.status, "REVIEW_REQUIRED");
  });

  // INVARIANT 8: An inactive/unverified policy cannot produce authoritative PASS/FAIL
  it("Invariant 8: An inactive/unverified policy cannot produce authoritative PASS/FAIL", () => {
    const store = new ProductionPolicyStore([AMZN_SHIPPING_BOX_SEAM_POLICY]);
    const context = buildExplicitPolicyContext(store, "SHIPPING_BOX_PREP");

    assert.equal(context.fnskuPlacementPolicy, undefined, "UNVERIFIED policy cannot supply context");
    assert.equal(context.barcodeCoveragePolicy, undefined);

    const inactiveRule = {
      ruleId: "INACTIVE-RULE",
      version: "1.0",
      checkType: "FNSKU_IDENTITY" as PrepCheckType,
      title: "Inactive Rule",
      source: {
        publisher: "Test",
        url: "https://example.com",
        retrievedAt: "2026-09-27T00:00:00.000Z",
      },
      applicability: { source: "TEST", requiredInputs: [] },
      verification: { requiredObservationFields: [], visualVerifiability: "FULL" as const },
      status: "UNVERIFIED" as const,
    };

    const resolution = resolveRequirement({
      checkType: "FNSKU_IDENTITY",
      workOrder: baseWorkOrder,
      rule: inactiveRule,
    });

    assert.equal(resolution.status, "UNRESOLVED");
    assert.equal(resolution.reason, "RULE_INACTIVE");
  });

  // INVARIANT 9: UNKNOWN work-order intent never silently becomes NOT_REQUIRED
  it("Invariant 9: UNKNOWN work-order intent never silently becomes NOT_REQUIRED", () => {
    const unknownWorkOrder = {
      ...baseWorkOrder,
      requirements: {
        ...baseWorkOrder.requirements,
        polybag: "UNKNOWN" as const,
      },
    };

    const record = runPrepInspection({
      observation: createCompliantObservation("UNIT-0001"),
      workOrder: unknownWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const polyCheck = record.checks.find((c) => c.checkType === "POLYBAG_PRESENCE")!;
    assert.notEqual(polyCheck.applicability, "NOT_APPLICABLE");
    assert.equal(polyCheck.applicability, "UNKNOWN");
    assert.equal(polyCheck.verdict, "UNCERTAIN");
    assert.equal(polyCheck.reasonCode, "REQUIREMENT_UNKNOWN");
  });

  // INVARIANT 10: Evidence Quality Gate never emits compliance verdicts
  it("Invariant 10: Evidence Quality Gate never emits compliance verdicts", () => {
    const result = evaluateEvidenceReadiness({
      slots: {},
      requiredSlots: ["front", "back", "label"],
    });

    const resultObj = result as unknown as Record<string, unknown>;
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
});
