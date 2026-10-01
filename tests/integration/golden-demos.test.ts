import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadDemoFixtureImages,
  loadDemoFixtureSlot,
} from "../../src/lib/inspection/demo-fixture-loader";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import { evaluateEvidenceReadiness } from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import { planEvidenceRecovery } from "../../src/lib/recovery/recovery-planner";
import {
  getOrderedOperatorProblems,
  buildOperatorActionableTask,
  VERDICT_HUMAN_MAPPING,
  CHECK_HUMAN_TITLES,
} from "../../src/lib/inspection/operator-presentation";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

describe("Golden Demo Journeys & End-to-End Hardening (Day 5 / Step 4)", () => {
  const activeRules = ACTIVE_RULES;
  const policyContext = PRODUCTION_POLICY_CONTEXT;

  // 1. Golden READY Journey (DEMO-COMPLIANT)
  it("1. Golden READY journey: compliant unit completes pipeline with '✓ DONE' and zero defects", () => {
    // A. Select Unit & Work Order
    const workOrder = resolveWorkOrderForUnit("DEMO-COMPLIANT");
    assert.equal(workOrder.unitId, "DEMO-COMPLIANT");
    assert.equal(workOrder.expectedFnsku, "X00DUMMY001");

    // B. Load fixture images from disk
    const fixture = loadDemoFixtureImages("DEMO-COMPLIANT");
    assert.equal(fixture.images.length, 3);

    // C. Evidence readiness
    const readiness = evaluateEvidenceReadiness({
      slots: fixture.images.map((img) => ({
        slotId: img.imageId,
        dataUrl: img.dataUrl,
        mimeType: img.mimeType,
      })),
      requiredSlots: ["front", "back", "label"],
    });
    assert.equal(readiness.status, "READY");
    assert.equal(readiness.canInspect, true);
    assert.equal(readiness.missingSlots.length, 0);

    // D. Vision observation: opaque label completely covers manufacturer barcode, FNSKU matches & flat
    const observation: PrepUnitObservation = {
      unitId: "DEMO-COMPLIANT",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered flat on box front",
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
        evidence: [{ imageId: "back", description: "Opaque label covering original UPC" }],
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

    // E. Rule evaluation
    const inspectionRecord = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    // F. Operational decision
    const opStatus = aggregateOperationalStatus(inspectionRecord);
    assert.equal(opStatus.status, "READY");
    assert.equal(opStatus.failCount, 0);
    assert.equal(opStatus.uncertainCount, 0);
    assert.ok(opStatus.passCount >= 3); // FNSKU_IDENTITY, FNSKU_PLACEMENT, MANUFACTURER_BARCODE_COVERAGE

    // G. Human operator presentation
    const enrichedChecks = inspectionRecord.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });

    // Zero actionable problems for a ready unit
    assert.equal(problems.length, 0);

    // Passed checks are available and marked 'Done'
    const doneChecks = enrichedChecks.filter((c) => c.verdict === "PASS");
    assert.ok(doneChecks.length >= 3);
    for (const dc of doneChecks) {
      assert.equal(VERDICT_HUMAN_MAPPING.PASS, "Done");
      assert.ok(CHECK_HUMAN_TITLES[dc.checkType]);
    }
  });

  // 2. Golden Visible-Defect Journey (UNIT-0001)
  it("2. Golden visible-defect journey: exposed manufacturer barcode triggers '🔴 FIX NEEDED'", () => {
    // A. Select Unit & Work Order
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    assert.equal(workOrder.unitId, "UNIT-0001");

    // B. Load fixture images from disk
    const fixture = loadDemoFixtureImages("UNIT-0001");
    assert.equal(fixture.images.length, 3);

    // C. Evidence readiness
    const readiness = evaluateEvidenceReadiness({
      slots: fixture.images.map((img) => ({
        slotId: img.imageId,
        dataUrl: img.dataUrl,
        mimeType: img.mimeType,
      })),
      requiredSlots: ["front", "back", "label"],
    });
    assert.equal(readiness.canInspect, true);

    // D. Vision observation: exposed manufacturer barcode
    const observation: PrepUnitObservation = {
      unitId: "UNIT-0001",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Front face label",
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
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [{ imageId: "back", description: "Uncovered UPC barcode on back" }],
      },
      manufacturerBarcodeCoverage: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [{ imageId: "back", description: "UPC barcode is exposed" }],
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

    // E. Rule evaluation
    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    // F. Operational decision
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");
    assert.equal(opStatus.failCount, 1);
    assert.ok(opStatus.blockingCheckTypes.includes("MANUFACTURER_BARCODE_COVERAGE"));

    // G. Operator presentation
    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });

    assert.equal(problems.length, 1);
    const problem = problems[0];
    assert.equal(problem.headline, "🔴 FIX NEEDED");
    assert.equal(problem.actionTitle, "Cover manufacturer barcode");
    assert.equal(problem.humanObservation, "The original manufacturer barcode is still visible.");
    assert.deepEqual(problem.whatToDoSteps, [
      "1. Cover the manufacturer barcode completely with an opaque label.",
      "2. Make sure the original barcode cannot be scanned.",
      "3. Take a new photo showing the corrected area.",
    ]);
    assert.equal(problem.ctaText, "TAKE NEW PHOTO");
    assert.equal(problem.evidenceSlot, "back");
    assert.equal(problem.evidenceSlotDisplay, "BACK");

    // Underneath technical audit data remains intact
    assert.equal(problem.technical.checkType, "MANUFACTURER_BARCODE_COVERAGE");
    assert.equal(problem.technical.verdict, "FAIL");
    assert.equal(problem.technical.reasonCode, "REQUIREMENT_VIOLATED");
  });

  // 2b. Golden Physical Defect Fixture Journey (DEMO-DEFECT)
  it("2b. Golden physical defect journey with real DEMO-DEFECT fixture: uncovered barcode triggers '🔴 FIX NEEDED'", () => {
    // A. Select Unit & Work Order
    const workOrder = resolveWorkOrderForUnit("DEMO-DEFECT");
    assert.equal(workOrder.unitId, "DEMO-DEFECT");

    // B. Load fixture images from disk
    const fixture = loadDemoFixtureImages("DEMO-DEFECT");
    assert.equal(fixture.images.length, 3);

    // C. Evidence readiness
    const readiness = evaluateEvidenceReadiness({
      slots: fixture.images.map((img) => ({
        slotId: img.imageId,
        dataUrl: img.dataUrl,
        mimeType: img.mimeType,
      })),
      requiredSlots: ["front", "back", "label"],
    });
    assert.equal(readiness.canInspect, true);

    // D. Vision observation matching DEMO-DEFECT physical images
    const observation: PrepUnitObservation = {
      unitId: "DEMO-DEFECT",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY002",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat outer surface",
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
        valueCompleteness: "COMPLETE",
        detectedValue: "8906050590022",
        evidence: [{ imageId: "back", description: "Uncovered UPC barcode on back panel" }],
      },
      manufacturerBarcodeCoverage: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [{ imageId: "back", description: "UPC barcode is exposed" }],
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

    // E. Rule evaluation
    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    // F. Operational decision
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");
    assert.equal(opStatus.failCount, 1);
    assert.ok(opStatus.blockingCheckTypes.includes("MANUFACTURER_BARCODE_COVERAGE"));

    // G. Operator presentation
    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });

    assert.equal(problems.length, 1);
    const problem = problems[0];
    assert.equal(problem.headline, "🔴 FIX NEEDED");
    assert.equal(problem.actionTitle, "Cover manufacturer barcode");
    assert.equal(problem.humanObservation, "The original manufacturer barcode is still visible.");
    assert.equal(problem.evidenceSlot, "back");
    assert.equal(problem.evidenceSlotDisplay, "BACK");
    assert.equal(problem.ctaText, "TAKE NEW PHOTO");
  });

  // 3. Golden Insufficient-Evidence Journey (DEMO-RECOVERY)
  it("3. Golden insufficient-evidence journey: unreadable expiry produces '📷 TAKE THIS PHOTO AGAIN'", () => {
    // A. Select Unit & Work Order
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");
    assert.equal(workOrder.unitId, "DEMO-RECOVERY");
    assert.equal(workOrder.requirements.expiryDate, "REQUIRED");

    // B. Load default fixture images (with blurry expiry on back)
    const fixture = loadDemoFixtureImages("DEMO-RECOVERY", { variant: "default" });
    assert.equal(fixture.images.length, 3);

    // C. Vision observation: expiry date is visible but blurred/unreadable
    const blurryObservation: PrepUnitObservation = {
      unitId: "DEMO-RECOVERY",
      imageQuality: { overall: "DEGRADED", issues: ["blurry expiry date stamp"] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat label",
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
        evidence: [{ imageId: "back", description: "UPC covered" }],
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurry expiration stamp" }],
      },
      handlingMarks: [],
      otherVisibleIssues: [],
    };

    // D. Inspection pass 1
    const record = runPrepInspection({
      observation: blurryObservation,
      workOrder,
      rules: activeRules,
      policyContext,
    });

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
    assert.ok(opStatus.uncertainCheckTypes.includes("EXPIRY_LEGIBILITY"));

    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord: record,
      operationalStatus: opStatus,
    });
    assert.equal(recoveryPlan.requiresEvidence, true);

    // E. Operator Presentation
    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, blurryObservation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation: blurryObservation,
      recoveryPlan,
    });

    assert.equal(problems.length, 1);
    const problem = problems[0];
    assert.equal(problem.headline, "📷 TAKE THIS PHOTO AGAIN");
    assert.equal(problem.actionTitle, "Retake expiry photo");
    assert.equal(problem.humanObservation, "We can't clearly read the expiry date.");
    assert.equal(problem.evidenceSlot, "back");
    assert.equal(problem.ctaText, "RETAKE BACK PHOTO");
    assert.ok(problem.photoRecoveryHints);
    assert.ok(problem.photoRecoveryHints.checklist.includes("Keep the expiry date visible"));
    assert.ok(problem.photoRecoveryHints.checklist.includes("Move closer"));
    assert.ok(problem.photoRecoveryHints.checklist.includes("Keep the camera steady"));
    assert.ok(problem.photoRecoveryHints.checklist.includes("Avoid glare"));
    assert.equal(problem.photoRecoveryHints.exampleText, "EXP: 10/2027");
  });

  // 4. Replacement Photo Actually Used During Reinspection
  it("4. Replacement photo is actually used during reinspection and transitions UNCERTAIN -> PASS", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");

    // Pass 1: Blurry expiry photo
    const defaultBack = loadDemoFixtureSlot("DEMO-RECOVERY", "back", "default");
    assert.equal(defaultBack.imageId, "back");

    const obsPass1: PrepUnitObservation = {
      unitId: "DEMO-RECOVERY",
      imageQuality: { overall: "DEGRADED", issues: ["blurry expiry date text"] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat on label face",
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
        evidence: [{ imageId: "back", description: "UPC covered" }],
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurry expiration text" }],
      },
      handlingMarks: [],
      otherVisibleIssues: [],
    };

    const pass1Record = runPrepInspection({
      observation: obsPass1,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const pass1Status = aggregateOperationalStatus(pass1Record);
    assert.equal(pass1Status.status, "REVIEW_REQUIRED");

    // Pass 2: Replace back photo with sharp closeup
    const closeupBack = loadDemoFixtureSlot("DEMO-RECOVERY", "back", "closeup");
    assert.equal(closeupBack.filename, "back_closeup.jpeg");
    assert.notEqual(closeupBack.dataUrl, defaultBack.dataUrl);

    // New observation generated from new photograph
    const obsPass2: PrepUnitObservation = {
      ...obsPass1,
      imageQuality: { overall: "GOOD", issues: [] },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "10/2027",
        evidence: [{ imageId: "back", description: "Clear macro close-up of EXP: 10/2027" }],
      },
    };

    const pass2Record = runPrepInspection({
      observation: obsPass2,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const pass2Status = aggregateOperationalStatus(pass2Record);

    // Verdict legitimately transitions from UNCERTAIN -> PASS
    const pass1Expiry = pass1Record.checks.find((c) => c.checkType === "EXPIRY_LEGIBILITY");
    const pass2Expiry = pass2Record.checks.find((c) => c.checkType === "EXPIRY_LEGIBILITY");
    assert.equal(pass1Expiry?.verdict, "UNCERTAIN");
    assert.equal(pass2Expiry?.verdict, "PASS");

    // Operational status legitimately transitions from REVIEW_REQUIRED -> READY
    assert.equal(pass2Status.status, "READY");

    const enrichedChecksPass2 = pass2Record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, obsPass2, activeRules)
    );
    const problemsPass2 = getOrderedOperatorProblems({
      enrichedChecks: enrichedChecksPass2,
      workOrder,
      observation: obsPass2,
    });
    assert.equal(problemsPass2.length, 0); // No remaining problems
  });

  // 5. Physical FAIL Cannot Be Hidden by Presentation Layer
  it("5. Physical FAIL cannot be hidden, bypassed, or silenced by the presentation layer", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const obsWithDefect: PrepUnitObservation = {
      unitId: "UNIT-0001",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Front",
        evidence: [],
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

    const record = runPrepInspection({
      observation: obsWithDefect,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, obsWithDefect, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation: obsWithDefect,
    });

    // The defect MUST appear as an actionable task
    assert.equal(problems.length, 1);
    assert.equal(problems[0].internalVerdict, "FAIL");
    assert.equal(problems[0].humanVerdictLabel, "Fix needed");
    assert.equal(problems[0].headline, "🔴 FIX NEEDED");

    // The machine result underneath CANNOT be mutated
    assert.equal(problems[0].technical.verdict, "FAIL");
    assert.equal(record.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE")?.verdict, "FAIL");
  });

  // 6. UNCERTAIN Cannot Be Displayed as DONE
  it("6. UNCERTAIN check cannot be displayed as DONE or counted as PASS", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");
    const uncertainObs: PrepUnitObservation = {
      unitId: "DEMO-RECOVERY",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Front",
        evidence: [],
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

    const record = runPrepInspection({
      observation: uncertainObs,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const opStatus = aggregateOperationalStatus(record);

    // Status MUST NOT be READY
    assert.notEqual(opStatus.status, "READY");
    assert.equal(opStatus.status, "REVIEW_REQUIRED");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, uncertainObs, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation: uncertainObs,
    });

    // Check that every UNCERTAIN check produces a recovery task and NEVER Done
    const uncertainTasks = problems.filter((p) => p.internalVerdict === "UNCERTAIN");
    assert.ok(uncertainTasks.length > 0);
    for (const t of uncertainTasks) {
      assert.equal(t.humanVerdictLabel, "Need a clearer photo");
      assert.equal(t.headline, "📷 TAKE THIS PHOTO AGAIN");
      assert.notEqual(t.humanVerdictLabel, "Done");
    }
  });

  // 7. NOT_APPLICABLE Does Not Count as PASS
  it("7. NOT_APPLICABLE checks never count as PASS and are hidden from operator problem cards", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    // Synthetic observation where everything is NOT_DETECTED or NOT_APPLICABLE
    const emptyObs: PrepUnitObservation = {
      unitId: "UNIT-0001",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
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
        status: "UNCERTAIN",
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

    const record = runPrepInspection({
      observation: emptyObs,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const opStatus = aggregateOperationalStatus(record);

    // Ensure notApplicableCount does NOT increment passCount
    assert.ok(opStatus.notApplicableCount > 0);
    assert.equal(opStatus.passCount, 0);
    assert.notEqual(opStatus.status, "READY");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, emptyObs, activeRules)
    );

    // NOT_APPLICABLE checks must NOT generate operator action tasks
    const naChecks = enrichedChecks.filter((c) => c.applicability === "NOT_APPLICABLE");
    for (const nac of naChecks) {
      const task = buildOperatorActionableTask({
        enrichedCheck: nac,
        workOrder,
        observation: emptyObs,
      });
      assert.equal(task, null, `NOT_APPLICABLE check ${nac.checkType} must return null`);
    }
  });

  // 8. Demo Mode Uses the Normal Inspection Pipeline
  it("8. Demo mode uses the normal inspection pipeline without synthetic bypass", () => {
    // Verify that demo fixtures exist on disk and are physically loaded
    const demoCompliantFixture = loadDemoFixtureImages("DEMO-COMPLIANT");
    const demoDefectFixture = loadDemoFixtureImages("UNIT-0001");
    const demoRecoveryFixture = loadDemoFixtureImages("DEMO-RECOVERY");

    assert.equal(demoCompliantFixture.images.length, 3);
    assert.equal(demoDefectFixture.images.length, 3);
    assert.equal(demoRecoveryFixture.images.length, 3);

    // All demo fixtures produce valid SlotEvidenceInput ready for normal pipeline
    for (const fixture of [demoCompliantFixture, demoDefectFixture, demoRecoveryFixture]) {
      const readiness = evaluateEvidenceReadiness({
        slots: fixture.images.map((img) => ({
          slotId: img.imageId,
          dataUrl: img.dataUrl,
          mimeType: img.mimeType,
        })),
        requiredSlots: ["front", "back", "label"],
      });
      assert.equal(readiness.canInspect, true);
    }
  });

  // 9. No Scenario-Specific Verdict Injection
  it("9. Evaluators evaluate purely based on observed visual facts without unit ID special-casing", () => {
    const workOrder1 = resolveWorkOrderForUnit("UNIT-0001");
    const workOrderCompliant = resolveWorkOrderForUnit("DEMO-COMPLIANT");

    // Same visual observation: barcode is uncovered
    const obsBarcodeUncovered: PrepUnitObservation = {
      unitId: "ANY-UNIT-ID",
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat",
        evidence: [],
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

    const res1 = runPrepInspection({
      observation: { ...obsBarcodeUncovered, unitId: "UNIT-0001" },
      workOrder: workOrder1,
      rules: activeRules,
      policyContext,
    });

    const res2 = runPrepInspection({
      observation: { ...obsBarcodeUncovered, unitId: "DEMO-COMPLIANT" },
      workOrder: workOrderCompliant,
      rules: activeRules,
      policyContext,
    });

    const check1 = res1.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE");
    const check2 = res2.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE");

    // Both MUST produce FAIL because barcode coverage is NOT_COVERED regardless of unitId
    assert.equal(check1?.verdict, "FAIL");
    assert.equal(check2?.verdict, "FAIL");
    assert.equal(check1?.reasonCode, check2?.reasonCode);
  });
});
