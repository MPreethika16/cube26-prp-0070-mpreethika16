import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADVERSARIAL_SCENARIOS,
  createCompliantObservation,
} from "../../src/lib/adversarial/scenarios";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import { DeterministicOperationalRouter } from "../../src/lib/recovery/operational-router";
import { evaluateEvidenceReadiness } from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import { inspectionRequestSchema } from "../../src/lib/inspection/inspection-request.schema";
import type { PrepCheckType } from "../../src/lib/compliance/check-types";
import { RuleRegistry } from "../../src/lib/compliance/rules/registry";

describe("E2E Adversarial Testing Harness (Day 5 / Step 1)", () => {
  const router = new DeterministicOperationalRouter();

  // --------------------------------------------------------------------------
  // 1. Fully compliant unit -> READY
  // --------------------------------------------------------------------------
  it("1. fully compliant unit -> READY", async () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-01-HAPPY-PATH"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });
    const decision = await router.route({
      unitId: scenario.workOrder.unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });

    assert.equal(operationalStatus.status, "READY");
    assert.equal(operationalStatus.failCount, 0);
    assert.equal(operationalStatus.uncertainCount, 0);
    assert.ok(operationalStatus.passCount > 0);
    assert.equal(recoveryPlan.requiresEvidence, false);
    assert.equal(decision, "READY");
  });

  // --------------------------------------------------------------------------
  // 2. Wrong FNSKU -> FAIL -> STOP_AND_FIX
  // --------------------------------------------------------------------------
  it("2. wrong FNSKU -> FAIL -> STOP_AND_FIX", async () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-02-WRONG-FNSKU"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });
    const decision = await router.route({
      unitId: scenario.workOrder.unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });

    const fnskuCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheck.verdict, "FAIL");
    assert.equal(fnskuCheck.reasonCode, "EXPECTED_VALUE_MISMATCH");
    assert.equal(operationalStatus.status, "STOP_AND_FIX");
    assert.ok(operationalStatus.blockingCheckTypes.includes("FNSKU_IDENTITY"));
    assert.equal(recoveryPlan.requiresEvidence, false);
    assert.equal(decision, "FIX_PREP");
  });

  // --------------------------------------------------------------------------
  // 3. Manufacturer barcode positively visible when coverage required -> FAIL -> STOP_AND_FIX
  // --------------------------------------------------------------------------
  it("3. manufacturer barcode positively visible when coverage required -> FAIL -> STOP_AND_FIX", async () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-03-BARCODE-UNCOVERED"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });
    const decision = await router.route({
      unitId: scenario.workOrder.unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });

    const barcodeCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    )!;
    assert.equal(barcodeCheck.verdict, "FAIL");
    assert.equal(barcodeCheck.reasonCode, "REQUIREMENT_VIOLATED");
    assert.equal(operationalStatus.status, "STOP_AND_FIX");
    assert.ok(
      operationalStatus.blockingCheckTypes.includes(
        "MANUFACTURER_BARCODE_COVERAGE"
      )
    );
    assert.equal(decision, "FIX_PREP");
  });

  // --------------------------------------------------------------------------
  // 4. FNSKU not detected -> UNCERTAIN -> REVIEW_REQUIRED -> targeted FNSKU recapture
  // --------------------------------------------------------------------------
  it("4. FNSKU not detected -> UNCERTAIN -> REVIEW_REQUIRED -> targeted FNSKU recapture", async () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-04-FNSKU-NOT-DETECTED"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });
    const decision = await router.route({
      unitId: scenario.workOrder.unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });

    const fnskuCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheck.verdict, "UNCERTAIN");
    assert.equal(fnskuCheck.reasonCode, "FEATURE_NOT_DETECTED");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.actionType === "CAPTURE_CLOSEUP" &&
          a.resolvesCheckTypes.includes("FNSKU_IDENTITY")
      )
    );
    assert.equal(decision, "RECAPTURE_EVIDENCE");
  });

  // --------------------------------------------------------------------------
  // 5. FNSKU illegible -> UNCERTAIN -> targeted close-up
  // --------------------------------------------------------------------------
  it("5. FNSKU illegible -> UNCERTAIN -> targeted close-up", async () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-05-FNSKU-ILLEGIBLE"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const fnskuCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(fnskuCheck.verdict, "UNCERTAIN");
    assert.equal(fnskuCheck.reasonCode, "TEXT_ILLEGIBLE");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.equal(recoveryPlan.requiresEvidence, true);
    const action = recoveryPlan.actions.find(
      (a) => a.checkType === "FNSKU_IDENTITY"
    )!;
    assert.equal(action.actionType, "CAPTURE_CLOSEUP");
    assert.equal(action.target, "FNSKU label");
  });

  // --------------------------------------------------------------------------
  // 6. Uncertain FNSKU identity + placement -> one deduplicated recovery action
  // --------------------------------------------------------------------------
  it("6. uncertain FNSKU identity + placement -> one deduplicated recovery action", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-06-FNSKU-IDENTITY-PLACEMENT-UNCERTAIN"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: {
        ...PRODUCTION_POLICY_CONTEXT,
        barcodeCoveragePolicy: { coverageRequired: false },
      },
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.equal(recoveryPlan.actions.length, 1);
    const action = recoveryPlan.actions[0];
    assert.equal(action.priority, "HIGH");
    assert.deepEqual(action.resolvesCheckTypes, [
      "FNSKU_IDENTITY",
      "FNSKU_PLACEMENT",
    ]);
  });

  // --------------------------------------------------------------------------
  // 7. Polybag required but presence uncertain -> REVIEW_REQUIRED -> full package capture
  // --------------------------------------------------------------------------
  it("7. polybag required but presence uncertain -> REVIEW_REQUIRED -> full package capture", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-07-POLYBAG-REQUIRED-UNCERTAIN"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const polyCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "POLYBAG_PRESENCE"
    )!;
    assert.equal(polyCheck.verdict, "UNCERTAIN");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.checkType === "POLYBAG_PRESENCE" &&
          a.actionType === "CAPTURE_FULL_PACKAGE"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 8. Polybag visible but seal uncertain -> targeted seal capture
  // --------------------------------------------------------------------------
  it("8. polybag visible but seal uncertain -> targeted seal capture", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-08-POLYBAG-SEAL-UNCERTAIN"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const sealCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "POLYBAG_SEAL"
    )!;
    assert.equal(sealCheck.verdict, "UNCERTAIN");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    const sealAction = recoveryPlan.actions.find(
      (a) => a.checkType === "POLYBAG_SEAL"
    )!;
    assert.equal(sealAction.actionType, "CAPTURE_CLOSEUP");
    assert.equal(sealAction.target, "complete bag closure");
  });

  // --------------------------------------------------------------------------
  // 9. Warning required but unreadable -> targeted warning capture
  // --------------------------------------------------------------------------
  it("9. warning required but unreadable -> targeted warning capture", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-09-WARNING-UNREADABLE"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const warnLeg = inspectionRecord.checks.find(
      (c) => c.checkType === "SUFFOCATION_WARNING_LEGIBILITY"
    )!;
    assert.equal(warnLeg.verdict, "UNCERTAIN");
    assert.equal(warnLeg.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.checkType === "SUFFOCATION_WARNING_LEGIBILITY" &&
          a.actionType === "CAPTURE_CLOSEUP"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 9B. Warning visible but ILLEGIBLE -> UNCERTAIN -> REVIEW_REQUIRED -> targeted close-up
  // --------------------------------------------------------------------------
  it("9B. warning visible but ILLEGIBLE -> UNCERTAIN -> REVIEW_REQUIRED -> targeted close-up", () => {
    const observation = createCompliantObservation("SYNTHETIC-POLYBAG", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        packagingType: "POLYBAG",
        evidence: [{ imageId: "front", description: "Sealed polybag" }],
      },
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedText: null,
        evidence: [{ imageId: "front", description: "Unreadable text block on bag" }],
      },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat outer surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
    });

    const inspectionRecord = runPrepInspection({
      observation,
      workOrder: ADVERSARIAL_SCENARIOS[6].workOrder, // polybag work order
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const warnLeg = inspectionRecord.checks.find(
      (c) => c.checkType === "SUFFOCATION_WARNING_LEGIBILITY"
    )!;
    assert.equal(warnLeg.verdict, "UNCERTAIN");
    assert.equal(warnLeg.reasonCode, "TEXT_ILLEGIBLE");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.resolvesCheckTypes.includes("SUFFOCATION_WARNING_LEGIBILITY") &&
          a.actionType === "CAPTURE_CLOSEUP"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 10. Expiry required but unreadable -> targeted expiry capture
  // --------------------------------------------------------------------------
  it("10. expiry required but unreadable -> targeted expiry capture", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-10-EXPIRY-UNREADABLE"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const expLeg = inspectionRecord.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    )!;
    assert.equal(expLeg.verdict, "UNCERTAIN");
    assert.equal(expLeg.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY") &&
          a.actionType === "CAPTURE_CLOSEUP"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 10B. Expiry visible but ILLEGIBLE -> UNCERTAIN -> REVIEW_REQUIRED
  // --------------------------------------------------------------------------
  it("10B. expiry visible but ILLEGIBLE -> UNCERTAIN -> REVIEW_REQUIRED -> targeted close-up", () => {
    const observation = createCompliantObservation("UNIT-0004", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY004",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Smudged expiration stamp" }],
      },
    });

    const inspectionRecord = runPrepInspection({
      observation,
      workOrder: ADVERSARIAL_SCENARIOS[9].workOrder, // expiry work order
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const expLeg = inspectionRecord.checks.find(
      (c) => c.checkType === "EXPIRY_LEGIBILITY"
    )!;
    assert.equal(expLeg.verdict, "UNCERTAIN");
    assert.equal(expLeg.reasonCode, "TEXT_ILLEGIBLE");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.equal(recoveryPlan.requiresEvidence, true);
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY") &&
          a.actionType === "CAPTURE_CLOSEUP"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 11. Handling mark required but evidence insufficient -> targeted package recapture
  // --------------------------------------------------------------------------
  it("11. handling mark required but evidence insufficient -> targeted package recapture", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-11-HANDLING-MARKS-INSUFFICIENT"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    const markCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "HANDLING_MARKS"
    )!;
    assert.equal(markCheck.verdict, "UNCERTAIN");
    assert.equal(markCheck.reasonCode, "FEATURE_NOT_DETECTED");
    assert.ok(
      recoveryPlan.actions.some(
        (a) =>
          a.checkType === "HANDLING_MARKS" &&
          a.actionType === "CAPTURE_FULL_PACKAGE"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 12. FAIL + UNCERTAIN simultaneously -> overall STOP_AND_FIX -> FAIL dominates
  // --------------------------------------------------------------------------
  it("12. FAIL + UNCERTAIN simultaneously -> overall STOP_AND_FIX -> FAIL must dominate operational status", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-12-FAIL-PLUS-UNCERTAIN"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    assert.equal(operationalStatus.status, "STOP_AND_FIX");
    assert.ok(operationalStatus.failCount > 0);
    assert.ok(operationalStatus.uncertainCount > 0);
    assert.ok(operationalStatus.blockingCheckTypes.includes("FNSKU_IDENTITY"));
    assert.ok(operationalStatus.uncertainCheckTypes.includes("POLYBAG_SEAL"));
  });

  // --------------------------------------------------------------------------
  // 13. Multiple FAIL checks -> STOP_AND_FIX -> all blocking checks retained
  // --------------------------------------------------------------------------
  it("13. multiple FAIL checks -> STOP_AND_FIX -> all blocking checks retained", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-13-MULTIPLE-FAILS"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    assert.equal(operationalStatus.status, "STOP_AND_FIX");
    assert.equal(operationalStatus.failCount, 3);
    assert.ok(operationalStatus.blockingCheckTypes.includes("FNSKU_IDENTITY"));
    assert.ok(operationalStatus.blockingCheckTypes.includes("FNSKU_PLACEMENT"));
    assert.ok(
      operationalStatus.blockingCheckTypes.includes(
        "MANUFACTURER_BARCODE_COVERAGE"
      )
    );
  });

  // --------------------------------------------------------------------------
  // 14. All checks NOT_APPLICABLE -> REVIEW_REQUIRED -> never READY
  // --------------------------------------------------------------------------
  it("14. all checks NOT_APPLICABLE -> REVIEW_REQUIRED -> never READY", () => {
    // Construct an inspection record where every single check is NOT_APPLICABLE
    const notApplicableChecks = ACTIVE_RULES.map((rule) => ({
      checkId: `${rule.ruleId}:${rule.checkType}`,
      checkType: rule.checkType as PrepCheckType,
      applicability: "NOT_APPLICABLE" as const,
      verdict: null,
      reasonCode: "NOT_APPLICABLE" as const,
      explanation: "Test check is not applicable.",
      rule: { ruleId: rule.ruleId, version: rule.version },
      evidence: [],
      observedValue: null,
    }));

    const operationalStatus = aggregateOperationalStatus({
      checks: notApplicableChecks,
    });

    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
    assert.notEqual(operationalStatus.status, "READY");
    assert.equal(operationalStatus.passCount, 0);
    assert.equal(operationalStatus.failCount, 0);
    assert.equal(operationalStatus.uncertainCount, 0);
    assert.equal(operationalStatus.notApplicableCount, notApplicableChecks.length);
  });

  // --------------------------------------------------------------------------
  // 15. Unknown work-order requirement -> conservative result -> never NOT_REQUIRED
  // --------------------------------------------------------------------------
  it("15. unknown work-order requirement -> conservative result -> never silently treated as NOT_REQUIRED", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-15-UNKNOWN-WORK-ORDER-REQUIREMENT"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    const polyCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "POLYBAG_PRESENCE"
    )!;
    assert.equal(polyCheck.applicability, "UNKNOWN");
    assert.equal(polyCheck.verdict, "UNCERTAIN");
    assert.equal(polyCheck.reasonCode, "REQUIREMENT_UNKNOWN");
    assert.notEqual(polyCheck.applicability, "NOT_APPLICABLE");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 16. ACROSS_SEAM without verified unit-level policy -> UNCERTAIN -> never invent FAIL/PASS
  // --------------------------------------------------------------------------
  it("16. ACROSS_SEAM without verified unit-level policy -> UNCERTAIN -> never invent FAIL/PASS", () => {
    const scenario = ADVERSARIAL_SCENARIOS.find(
      (s) => s.scenarioId === "SCENARIO-16-ACROSS-SEAM-UNVERIFIED"
    )!;
    const inspectionRecord = runPrepInspection({
      observation: scenario.observationFixture!,
      workOrder: scenario.workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    const placementCheck = inspectionRecord.checks.find(
      (c) => c.checkType === "FNSKU_PLACEMENT"
    )!;
    assert.equal(placementCheck.verdict, "UNCERTAIN");
    assert.equal(placementCheck.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(placementCheck.verdict, "PASS");
    assert.notEqual(placementCheck.verdict, "FAIL");
    assert.equal(operationalStatus.status, "REVIEW_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 17. Evidence quality missing required image -> inspection blocked before model call
  // --------------------------------------------------------------------------
  it("17. evidence quality missing required image -> inspection blocked before model call", () => {
    const fakeBuffer = Buffer.alloc(1000, 1);
    const result = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", imageData: fakeBuffer, mimeType: "image/jpeg" },
        // "back" is missing
        label: { slotId: "label", imageData: fakeBuffer, mimeType: "image/jpeg" },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(result.status, "NOT_READY");
    assert.equal(result.canInspect, false);
    assert.ok(result.missingSlots.includes("back"));
  });

  // --------------------------------------------------------------------------
  // 18. Duplicate evidence across slots -> WARNING -> inspection may continue
  // --------------------------------------------------------------------------
  it("18. duplicate evidence across slots -> WARNING -> inspection may continue", () => {
    const validBase64 =
      "data:image/jpeg;base64," +
      Buffer.from(new Uint8Array(1024).fill(0xaa)).toString("base64");
    const identicalData = validBase64 + "duplicate";
    const result = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", dataUrl: identicalData, mimeType: "image/jpeg", width: 800, height: 600, byteSize: 2048 },
        back: { slotId: "back", dataUrl: identicalData, mimeType: "image/jpeg", width: 800, height: 600, byteSize: 2048 },
        label: { slotId: "label", dataUrl: validBase64 + "label", mimeType: "image/jpeg", width: 800, height: 600, byteSize: 2048 },
      },
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.canInspect, true);
    assert.ok(result.warnings.some((w) => w.toLowerCase().includes("duplicate")));
  });

  // --------------------------------------------------------------------------
  // 19. Low-resolution evidence -> WARNING -> inspection may continue
  // --------------------------------------------------------------------------
  it("19. low-resolution evidence -> WARNING -> inspection may continue", () => {
    const validBase64 =
      "data:image/jpeg;base64," +
      Buffer.from(new Uint8Array(1024).fill(0xaa)).toString("base64");
    const result = evaluateEvidenceReadiness({
      slots: {
        front: {
          slotId: "front",
          dataUrl: validBase64 + "front",
          mimeType: "image/jpeg",
          width: 100, // below 200px threshold
          height: 100,
          byteSize: 1024,
        },
        back: {
          slotId: "back",
          dataUrl: validBase64 + "back",
          mimeType: "image/jpeg",
          width: 800,
          height: 800,
          byteSize: 1024,
        },
        label: {
          slotId: "label",
          dataUrl: validBase64 + "label",
          mimeType: "image/jpeg",
          width: 800,
          height: 800,
          byteSize: 1024,
        },
      },
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.canInspect, true);
    assert.ok(result.warnings.some((w) => w.toLowerCase().includes("low resolution")));
  });

  // --------------------------------------------------------------------------
  // 20. Malformed API input -> safe structured error
  // --------------------------------------------------------------------------
  it("20. malformed API input -> safe structured error", () => {
    const invalidPayloads = [
      {},
      { unitId: "UNIT-0001" }, // missing images
      { unitId: "UNIT-0001", images: [] }, // empty images array
      { unitId: 12345, images: "not-an-array" }, // wrong types
    ];

    for (const payload of invalidPayloads) {
      const parseResult = inspectionRequestSchema.safeParse(payload);
      assert.equal(parseResult.success, false);
      assert.ok(parseResult.error.issues.length > 0);
    }
  });

  // --------------------------------------------------------------------------
  // 25. Policy lookup unavailable / missing -> UNCERTAIN, never crash, never READY
  // --------------------------------------------------------------------------
  it("25. policy lookup unavailable / missing -> conservative UNCERTAIN, never READY", () => {
    // Empty rule registry
    const emptyRegistry = new RuleRegistry([]);
    const inspectionRecord = runPrepInspection({
      observation: createCompliantObservation("UNIT-0001"),
      workOrder: ADVERSARIAL_SCENARIOS[0].workOrder,
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
});
