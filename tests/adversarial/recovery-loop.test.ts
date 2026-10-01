import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import { DeterministicOperationalRouter } from "../../src/lib/recovery/operational-router";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { createCompliantObservation } from "../../src/lib/adversarial/scenarios";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

describe("Recovery Loop Tests (Day 5 / Step 1)", () => {
  const router = new DeterministicOperationalRouter();

  const baseWorkOrder = {
    workOrderId: "WO-RECOVERY-01",
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

  const expiryWorkOrder = {
    workOrderId: "WO-RECOVERY-EXPIRY",
    unitId: "UNIT-0004",
    sku: "SKU-PROT-1KG",
    asin: "B0DUMMY357",
    expectedFnsku: "X00DUMMY004",
    requirements: {
      polybag: "NOT_REQUIRED" as const,
      suffocationWarning: "NOT_REQUIRED" as const,
      expiryDate: "REQUIRED" as const,
      handlingMarks: {
        state: "NOT_REQUIRED" as const,
        requiredMarks: [],
      },
    },
  };

  // SCENARIO 1: Two-pass successful recovery (FNSKU not detected -> detected + matching)
  it("Recovery Loop: Pass 1 FNSKU not detected -> Pass 2 FNSKU resolved to PASS", async () => {
    // PASS 1: FNSKU not detected
    const pass1Obs: PrepUnitObservation = createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
    });

    const pass1Record = runPrepInspection({
      observation: pass1Obs,
      workOrder: baseWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const pass1Status = aggregateOperationalStatus(pass1Record);
    const pass1Plan = planEvidenceRecovery({
      inspectionRecord: pass1Record,
      operationalStatus: pass1Status,
    });
    const pass1Decision = await router.route({
      unitId: baseWorkOrder.unitId,
      inspectionRecord: pass1Record,
      operationalStatus: pass1Status,
      recoveryPlan: pass1Plan,
    });

    const fnskuCheckPass1 = pass1Record.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheckPass1.verdict, "UNCERTAIN");
    assert.equal(pass1Status.status, "REVIEW_REQUIRED");
    assert.equal(pass1Plan.requiresEvidence, true);
    assert.equal(pass1Decision, "RECAPTURE_EVIDENCE");

    // PASS 2: Recaptured evidence with clear matching FNSKU
    const pass2Obs: PrepUnitObservation = {
      ...pass1Obs,
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001", // Exact match
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat back surface",
        evidence: [
          {
            imageId: "label_recaptured",
            description: "High resolution close-up of FNSKU barcode",
          },
        ],
      },
    };

    const pass2Record = runPrepInspection({
      observation: pass2Obs,
      workOrder: baseWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const pass2Status = aggregateOperationalStatus(pass2Record);

    const fnskuCheckPass2 = pass2Record.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheckPass2.verdict, "PASS");
    assert.equal(fnskuCheckPass2.reasonCode, "REQUIREMENT_SATISFIED");
    assert.notEqual(pass1Status.passCount, pass2Status.passCount);
  });

  // SCENARIO 2: Two-pass unresolved recovery (Pass 1 expiry uncertain -> Pass 2 expiry STILL uncertain)
  it("Recovery Loop: Pass 1 expiry uncertain -> Pass 2 expiry STILL uncertain (never forces false resolution)", async () => {
    // PASS 1: Expiry unreadable
    const pass1Obs: PrepUnitObservation = createCompliantObservation("UNIT-0004", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY004",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat back surface",
        evidence: [
          {
            imageId: "label",
            description: "Clear FNSKU barcode on back panel",
          },
        ],
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurred stamp" }],
      },
    });

    const pass1Record = runPrepInspection({
      observation: pass1Obs,
      workOrder: expiryWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const pass1Status = aggregateOperationalStatus(pass1Record);
    const pass1Plan = planEvidenceRecovery({
      inspectionRecord: pass1Record,
      operationalStatus: pass1Status,
    });

    const expCheckPass1 = pass1Record.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    )!;
    assert.equal(expCheckPass1.verdict, "UNCERTAIN");
    assert.equal(pass1Plan.requiresEvidence, true);

    // PASS 2: Recaptured photo is still blurry
    const pass2Obs: PrepUnitObservation = {
      ...pass1Obs,
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN", // Still uncertain!
        detectedValue: null,
        evidence: [{ imageId: "back_retry", description: "Still blurry stamp" }],
      },
    };

    const pass2Record = runPrepInspection({
      observation: pass2Obs,
      workOrder: expiryWorkOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const pass2Status = aggregateOperationalStatus(pass2Record);

    const expCheckPass2 = pass2Record.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    )!;
    // CRITICAL: Must remain UNCERTAIN. Never force resolution just because inspection ran twice!
    assert.equal(expCheckPass2.verdict, "UNCERTAIN");
    assert.equal(pass2Status.status, "REVIEW_REQUIRED");
    assert.notEqual(pass2Status.status, "READY");
  });
});
