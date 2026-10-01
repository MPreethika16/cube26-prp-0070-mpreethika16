/**
 * ============================================================================
 * REGRESSION TEST — Work-Order State & Context Contamination Prevention
 * ============================================================================
 *
 * Verifies that when switching between units (e.g. Sample C -> REAL-PHONE-001
 * or REAL-PHONE-001 -> Sample B -> REAL-PHONE-001):
 *
 * 1. The work order is a single coherent snapshot used uniformly across:
 *    - API request / route
 *    - runPrepInspection
 *    - Compliance Evaluators
 *    - Operational Decision
 *    - Recovery Planner
 *    - Operator Presentation (getOrderedOperatorProblems / buildOperatorActionableTask)
 *
 * 2. Zero context leakage occurs:
 *    - X00DUMMY003 NEVER appears in any REAL-PHONE-001 result
 *    - Sample C's expiry requirement (REQUIRED) NEVER leaks into REAL-PHONE-001 (NOT_REQUIRED)
 *    - REAL-PHONE-001 NEVER generates "Retake expiry photo"
 *
 * 3. Inverse switching sequence behaves identically and without leakage.
 * 4. API rejects mismatched workOrder payloads (anti-tampering / anti-contamination).
 * ============================================================================
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import { defaultOperationalRouter } from "../../src/lib/recovery/operational-router";
import { getOrderedOperatorProblems } from "../../src/lib/inspection/operator-presentation";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/inspection/route";

function makeNeutralObservation(unitId: string, detectedFnsku: string | null = null): PrepUnitObservation {
  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: detectedFnsku ? "VISIBLE" : "NOT_DETECTED",
      legibility: detectedFnsku ? "LEGIBLE" : "UNCERTAIN",
      valueCompleteness: detectedFnsku ? "COMPLETE" : "UNCERTAIN",
      detectedValue: detectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Centered on box surface",
      evidence: [{ imageId: "label", description: "Label surface" }],
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
      status: "NOT_COVERED",
      coveringType: null,
      evidence: [],
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

describe("Work-Order State / Context Contamination Regression", () => {
  it("A. Switching Sample C -> REAL-PHONE-001 eliminates X00DUMMY003 and expiry requirements from all layers", async () => {
    // 1. Simulate initial selection: Sample C (SAMPLE-03)
    const sampleCWorkOrder = resolveWorkOrderForUnit("SAMPLE-03");
    assert.equal(sampleCWorkOrder.expectedFnsku, "X00DUMMY003");
    assert.equal(sampleCWorkOrder.requirements.expiryDate, "REQUIRED");

    // 2. Simulate switching to REAL-PHONE-001
    const realPhoneWorkOrder = resolveWorkOrderForUnit("REAL-PHONE-001");
    assert.equal(realPhoneWorkOrder.unitId, "REAL-PHONE-001");
    assert.equal(realPhoneWorkOrder.sku, "SKU-INFINIX-SMART8");
    assert.equal(realPhoneWorkOrder.expectedFnsku, "X00REALPHN01");
    assert.equal(realPhoneWorkOrder.requirements.expiryDate, "NOT_REQUIRED");
    assert.equal(realPhoneWorkOrder.requirements.polybag, "NOT_REQUIRED");
    assert.equal(realPhoneWorkOrder.requirements.suffocationWarning, "NOT_REQUIRED");
    assert.equal(realPhoneWorkOrder.requirements.handlingMarks?.state, "NOT_REQUIRED");

    // 3. Observation for REAL-PHONE-001 with an uncertain label
    const phoneObs = makeNeutralObservation("REAL-PHONE-001", null);

    // 4. Downstream Layer 1: runPrepInspection
    const inspectionRecord = runPrepInspection({
      observation: phoneObs,
      workOrder: realPhoneWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
      metadata: {
        inspectedAt: new Date().toISOString(),
        visionModel: "test-model",
        visionRequestCount: 1,
      },
    });

    // Check expiry applicability in REAL-PHONE-001
    const expiryVisCheck = inspectionRecord.checks.find((c) => c.checkType === "EXPIRY_VISIBILITY");
    const expiryLegCheck = inspectionRecord.checks.find((c) => c.checkType === "EXPIRY_LEGIBILITY");
    assert.equal(expiryVisCheck?.applicability, "NOT_APPLICABLE");
    assert.equal(expiryLegCheck?.applicability, "NOT_APPLICABLE");

    // 5. Downstream Layer 2: aggregateOperationalStatus
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    assert.ok(operationalStatus);

    // 6. Downstream Layer 3: Enriched checks
    const enrichedChecks = inspectionRecord.checks.map((c) =>
      buildEnrichedCheck(c, realPhoneWorkOrder, phoneObs, ACTIVE_RULES)
    );

    // 7. Downstream Layer 4: Evidence Recovery Planner
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    // Recovery actions must NEVER contain expiry actions for REAL-PHONE-001
    const expiryRecoveryAction = recoveryPlan.actions.find(
      (a) => a.checkType === "EXPIRY_VISIBILITY" || a.checkType === "EXPIRY_LEGIBILITY"
    );
    assert.equal(
      expiryRecoveryAction,
      undefined,
      "REAL-PHONE-001 recovery plan must NOT contain expiry recovery actions"
    );

    // 8. Downstream Layer 5: Operational Decision Router
    const routingDecision = await defaultOperationalRouter.route({
      unitId: "REAL-PHONE-001",
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });
    assert.ok(routingDecision);

    // 9. Downstream Layer 6: Operator Presentation
    const operatorTasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: realPhoneWorkOrder,
      observation: phoneObs,
      recoveryPlan,
    });

    // 10. String serialization check: X00DUMMY003 must NEVER appear in ANY layer
    const serializedChecks = JSON.stringify(enrichedChecks);
    const serializedPlan = JSON.stringify(recoveryPlan);
    const serializedTasks = JSON.stringify(operatorTasks);
    const serializedInspection = JSON.stringify(inspectionRecord);

    assert.equal(
      serializedChecks.includes("X00DUMMY003"),
      false,
      "X00DUMMY003 must not leak into enriched checks"
    );
    assert.equal(
      serializedPlan.includes("X00DUMMY003"),
      false,
      "X00DUMMY003 must not leak into recovery plan"
    );
    assert.equal(
      serializedTasks.includes("X00DUMMY003"),
      false,
      "X00DUMMY003 must not leak into operator tasks"
    );
    assert.equal(
      serializedInspection.includes("X00DUMMY003"),
      false,
      "X00DUMMY003 must not leak into inspection record"
    );

    // Assert "Retake expiry photo" is absent from operator tasks
    const hasExpiryRetake = operatorTasks.some(
      (t) =>
        t.actionTitle.toLowerCase().includes("expiry") ||
        t.ctaText.toLowerCase().includes("expiry")
    );
    assert.equal(hasExpiryRetake, false, "REAL-PHONE-001 must NEVER prompt to retake expiry photo");
  });

  it("B. Inverse sequence: REAL-PHONE-001 -> Sample B -> REAL-PHONE-001 preserves clean context", () => {
    // Sequence step 1: REAL-PHONE-001
    const wo1 = resolveWorkOrderForUnit("REAL-PHONE-001");
    assert.equal(wo1.expectedFnsku, "X00REALPHN01");

    // Sequence step 2: Sample B (SAMPLE-02)
    const wo2 = resolveWorkOrderForUnit("SAMPLE-02");
    assert.equal(wo2.expectedFnsku, "X00DUMMY002");

    // Sequence step 3: Back to REAL-PHONE-001
    const wo3 = resolveWorkOrderForUnit("REAL-PHONE-001");
    assert.equal(wo3.expectedFnsku, "X00REALPHN01");
    assert.equal(wo3.requirements.expiryDate, "NOT_REQUIRED");

    const phoneObs = makeNeutralObservation("REAL-PHONE-001", "X00REALPHN01");
    const record = runPrepInspection({
      observation: phoneObs,
      workOrder: wo3,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
      metadata: {
        inspectedAt: new Date().toISOString(),
        visionModel: "test-model",
        visionRequestCount: 1,
      },
    });

    const enriched = record.checks.map((c) =>
      buildEnrichedCheck(c, wo3, phoneObs, ACTIVE_RULES)
    );
    const serialized = JSON.stringify(enriched);

    assert.equal(serialized.includes("X00DUMMY002"), false);
    assert.equal(serialized.includes("X00DUMMY003"), false);
  });

  it("C. API rejects inspection request when workOrder.unitId does not match request.unitId", async () => {
    const staleSampleCWorkOrder = resolveWorkOrderForUnit("SAMPLE-03");

    const mockRequest = new NextRequest("http://localhost:3000/api/inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: "REAL-PHONE-001",
        orgId: "org_demo_alpha",
        workOrder: staleSampleCWorkOrder, // Contaminated work order payload!
        images: [
          {
            imageId: "label",
            mimeType: "image/jpeg",
            imageData: "data:image/jpeg;base64,dGVzdA==",
          },
        ],
      }),
    });

    const response = await POST(mockRequest);
    assert.equal(response.status, 400);

    const data = await response.json();
    assert.ok(data.error.includes("Context contamination rejected"));
  });
});
