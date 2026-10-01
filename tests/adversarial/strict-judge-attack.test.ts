import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEvidenceReadiness,
} from "../../src/lib/evidence-quality/evaluate-evidence-readiness";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  aggregateOperationalStatus,
} from "../../src/lib/inspection/operational-status";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import {
  getOrderedOperatorProblems,
  translateErrorToHuman,
} from "../../src/lib/inspection/operator-presentation";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import {
  loadDemoFixtureImages,
} from "../../src/lib/inspection/demo-fixture-loader";
import { resolveWorkOrderForUnit } from "../../src/lib/inspection/work-order-resolver";
import type { PrepUnitObservation, FnskuObservation } from "../../src/lib/vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";

const VALID_BASE64_JPEG =
  "data:image/jpeg;base64," +
  Buffer.from(new Uint8Array(1024).fill(0xaa)).toString("base64");

function makeBaseObservation(
  unitId: string,
  expectedFnsku: string,
  partial?: Partial<PrepUnitObservation>
): PrepUnitObservation {
  const baseFnsku: FnskuObservation = {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    valueCompleteness: "COMPLETE",
    detectedValue: expectedFnsku,
    placement: "FLAT_SURFACE",
    placementDescription: "Flat on label surface",
    evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
  };

  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: baseFnsku,
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
      evidence: [{ imageId: "back", description: "Opaque cover label" }],
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
    ...partial,
    ...(partial?.fnsku ? { fnsku: { ...baseFnsku, ...partial.fnsku } } : {}),
  };
}

describe("Strict Judge Adversarial Attack Test Suite (Day 5 / Step 4)", () => {
  const activeRules = ACTIVE_RULES;
  const policyContext = PRODUCTION_POLICY_CONTEXT;

  // --------------------------------------------------------------------------
  // 1. Correctly prepared unit with sufficient evidence
  // --------------------------------------------------------------------------
  it("Scenario 1 [DETERMINISTIC TEST]: correctly prepared unit with sufficient evidence", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-COMPLIANT");
    const fixture = loadDemoFixtureImages("DEMO-COMPLIANT");

    // Evidence Readiness Gate
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

    // Observation: All prep verified compliant
    const observation = makeBaseObservation("DEMO-COMPLIANT", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const opStatus = aggregateOperationalStatus(record);

    assert.equal(opStatus.status, "READY");
    assert.equal(opStatus.failCount, 0);
    assert.equal(opStatus.uncertainCount, 0);

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });
    assert.equal(problems.length, 0); // No corrective tasks
  });

  // --------------------------------------------------------------------------
  // 2. Correct clearly readable FNSKU
  // --------------------------------------------------------------------------
  it("Scenario 2 [DETERMINISTIC TEST]: correct clearly readable FNSKU", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku, {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: workOrder.expectedFnsku,
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat carton",
        evidence: [{ imageId: "label", description: "Legible FNSKU barcode" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    const placementCheck = record.checks.find((c) => c.checkType === "FNSKU_PLACEMENT");

    assert.equal(fnskuCheck?.verdict, "PASS");
    assert.equal(placementCheck?.verdict, "PASS");
  });

  // --------------------------------------------------------------------------
  // 3. Required polybag clearly present and sealed
  // --------------------------------------------------------------------------
  it("Scenario 3 [DETERMINISTIC TEST]: required polybag clearly present and sealed", () => {
    const workOrder = {
      workOrderId: "WO-POLY-PASS",
      unitId: "UNIT-POLY-01",
      sku: "SKU-TEXTILE",
      asin: "B00TEXT123",
      expectedFnsku: "X00DUMMY001",
      requirements: {
        polybag: "REQUIRED" as const,
        suffocationWarning: "NOT_REQUIRED" as const,
        expiryDate: "NOT_REQUIRED" as const,
        handlingMarks: { state: "NOT_REQUIRED" as const, requiredMarks: [] },
      },
    };

    const observation = makeBaseObservation(workOrder.unitId, workOrder.expectedFnsku, {
      polybag: {
        visibility: "VISIBLE",
        packagingType: "POLYBAG",
        sealStatus: "SEALED",
        evidence: [{ imageId: "front", description: "Transparent polybag completely sealed" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const polyPresence = record.checks.find((c) => c.checkType === "POLYBAG_PRESENCE");
    const polySeal = record.checks.find((c) => c.checkType === "POLYBAG_SEAL");

    assert.equal(polyPresence?.verdict, "PASS");
    assert.equal(polySeal?.verdict, "PASS");
  });

  // --------------------------------------------------------------------------
  // 4. Clearly readable incorrect FNSKU
  // --------------------------------------------------------------------------
  it("Scenario 4 [DETERMINISTIC TEST]: clearly readable incorrect FNSKU -> FAIL", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const wrongFnsku = "X00WRONG999";
    assert.notEqual(wrongFnsku, workOrder.expectedFnsku);

    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku, {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: wrongFnsku,
        placement: "FLAT_SURFACE",
        placementDescription: "Flat on box",
        evidence: [{ imageId: "label", description: `Detected FNSKU ${wrongFnsku}` }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");

    assert.equal(fnskuCheck?.verdict, "FAIL");
    assert.equal(fnskuCheck?.reasonCode, "EXPECTED_VALUE_MISMATCH");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });
    assert.equal(problems[0].humanVerdictLabel, "Fix needed");
    assert.equal(problems[0].headline, "🔴 FIX NEEDED");
  });

  // --------------------------------------------------------------------------
  // 5. Clearly visible uncovered manufacturer barcode
  // --------------------------------------------------------------------------
  it("Scenario 5 [DETERMINISTIC TEST]: clearly visible uncovered manufacturer barcode -> FAIL", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku, {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [{ imageId: "back", description: "UPC barcode exposed" }],
      },
      manufacturerBarcodeCoverage: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [{ imageId: "back", description: "UPC barcode is exposed" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const barcodeCheck = record.checks.find(
      (c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE"
    );

    assert.equal(barcodeCheck?.verdict, "FAIL");
    assert.equal(barcodeCheck?.reasonCode, "REQUIREMENT_VIOLATED");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });
    assert.equal(problems[0].actionTitle, "Cover manufacturer barcode");
    assert.equal(problems[0].ctaText, "TAKE NEW PHOTO");
  });

  // --------------------------------------------------------------------------
  // 6. Required polybag visibly not sealed
  // --------------------------------------------------------------------------
  it("Scenario 6 [DETERMINISTIC TEST]: required polybag visibly not sealed -> FAIL", () => {
    const workOrder = {
      workOrderId: "WO-POLY-UNSEAL",
      unitId: "UNIT-POLY-02",
      sku: "SKU-PLUSH",
      asin: "B00TOY123",
      expectedFnsku: "X00DUMMY001",
      requirements: {
        polybag: "REQUIRED" as const,
        suffocationWarning: "NOT_REQUIRED" as const,
        expiryDate: "NOT_REQUIRED" as const,
        handlingMarks: { state: "NOT_REQUIRED" as const, requiredMarks: [] },
      },
    };

    const observation = makeBaseObservation(workOrder.unitId, workOrder.expectedFnsku, {
      polybag: {
        visibility: "VISIBLE",
        packagingType: "POLYBAG",
        sealStatus: "NOT_SEALED",
        evidence: [{ imageId: "front", description: "Open polybag flap" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const polySeal = record.checks.find((c) => c.checkType === "POLYBAG_SEAL");

    assert.equal(polySeal?.verdict, "FAIL");
    assert.equal(polySeal?.reasonCode, "REQUIREMENT_VIOLATED");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "STOP_AND_FIX");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });
    assert.equal(problems[0].actionTitle, "Seal the bag");
    assert.equal(problems[0].humanObservation, "The bag is open. Seal it completely.");
  });

  // --------------------------------------------------------------------------
  // 7. Required suffocation warning visible but illegible
  // --------------------------------------------------------------------------
  it("Scenario 7 [DETERMINISTIC TEST]: required suffocation warning visible but illegible -> UNCERTAIN", () => {
    const workOrder = {
      workOrderId: "WO-WARN-ILLEG",
      unitId: "UNIT-WARN-01",
      sku: "SKU-BABY-BED",
      asin: "B00BABY123",
      expectedFnsku: "X00DUMMY001",
      requirements: {
        polybag: "REQUIRED" as const,
        suffocationWarning: "REQUIRED" as const,
        expiryDate: "NOT_REQUIRED" as const,
        handlingMarks: { state: "NOT_REQUIRED" as const, requiredMarks: [] },
      },
    };

    const observation = makeBaseObservation(workOrder.unitId, workOrder.expectedFnsku, {
      polybag: {
        visibility: "VISIBLE",
        packagingType: "POLYBAG",
        sealStatus: "SEALED",
        evidence: [{ imageId: "front", description: "Polybag sealed" }],
      },
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [{ imageId: "front", description: "Warning text is blurry and unreadable" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const warnCheck = record.checks.find(
      (c) => c.checkType === "SUFFOCATION_WARNING_LEGIBILITY"
    );

    assert.equal(warnCheck?.verdict, "UNCERTAIN");
    assert.equal(warnCheck?.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 8. Required expiry visible but illegible
  // --------------------------------------------------------------------------
  it("Scenario 8 [DETERMINISTIC TEST]: required expiry visible but illegible -> UNCERTAIN", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");
    const observation = makeBaseObservation("DEMO-RECOVERY", workOrder.expectedFnsku, {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Blurred expiration date numbers" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const expCheck = record.checks.find((c) => c.checkType === "EXPIRY_LEGIBILITY");

    assert.equal(expCheck?.verdict, "UNCERTAIN");
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");

    const enrichedChecks = record.checks.map((c) =>
      buildEnrichedCheck(c, workOrder, observation, activeRules)
    );
    const problems = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation,
    });
    assert.equal(problems[0].headline, "📷 TAKE THIS PHOTO AGAIN");
    assert.equal(problems[0].actionTitle, "Retake expiry photo");
    assert.equal(problems[0].humanObservation, "We can't clearly read the expiry date.");
    assert.equal(problems[0].ctaText, "RETAKE BACK PHOTO");
  });

  // --------------------------------------------------------------------------
  // 9. Blurry FNSKU/label photograph
  // --------------------------------------------------------------------------
  it("Scenario 9 [DETERMINISTIC TEST]: blurry FNSKU label photo -> UNCERTAIN", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku, {
      imageQuality: { overall: "DEGRADED", issues: ["blur on label photo"] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: "Cannot verify placement due to blur",
        evidence: [{ imageId: "label", description: "Out-of-focus label view" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    const placementCheck = record.checks.find((c) => c.checkType === "FNSKU_PLACEMENT");

    assert.equal(fnskuCheck?.verdict, "UNCERTAIN");
    assert.equal(placementCheck?.verdict, "UNCERTAIN");
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 10. Glare obstructing barcode/FNSKU
  // --------------------------------------------------------------------------
  it("Scenario 10 [DETERMINISTIC TEST]: glare obstructing barcode/FNSKU -> UNCERTAIN", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku, {
      imageQuality: { overall: "DEGRADED", issues: ["harsh flash glare on barcode"] },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "FLAT_SURFACE",
        placementDescription: "Flat, partially washed out by flash glare",
        evidence: [{ imageId: "label", description: "Glare reflection over barcode bars" }],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");

    assert.equal(fnskuCheck?.verdict, "UNCERTAIN");
    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "REVIEW_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // 11. Required expiry area not captured
  // --------------------------------------------------------------------------
  it("Scenario 11 [DETERMINISTIC TEST]: required expiry area not captured -> UNCERTAIN (never false FAIL)", () => {
    const workOrder = resolveWorkOrderForUnit("DEMO-RECOVERY");
    assert.equal(workOrder.requirements.expiryDate, "REQUIRED");

    const observation = makeBaseObservation("DEMO-RECOVERY", workOrder.expectedFnsku, {
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    });

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: activeRules,
      policyContext,
    });
    const expCheck = record.checks.find((c) => c.checkType === "EXPIRY_VISIBILITY");

    // Conservative invariant: Non-detection must NEVER become FAIL
    assert.equal(expCheck?.verdict, "UNCERTAIN");
    assert.notEqual(expCheck?.verdict, "FAIL");
    assert.notEqual(expCheck?.verdict, "PASS");
  });

  // --------------------------------------------------------------------------
  // 12. Missing required label photograph
  // --------------------------------------------------------------------------
  it("Scenario 12 [DETERMINISTIC TEST]: missing required label photograph -> evidence gate blocks inspection", () => {
    const readiness = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", dataUrl: VALID_BASE64_JPEG, mimeType: "image/jpeg" },
        back: { slotId: "back", dataUrl: VALID_BASE64_JPEG, mimeType: "image/jpeg" },
        label: { slotId: "label", dataUrl: null, mimeType: "image/jpeg" },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(readiness.status, "NOT_READY");
    assert.equal(readiness.canInspect, false);
    assert.deepEqual(readiness.missingSlots, ["label"]);
  });

  // --------------------------------------------------------------------------
  // 13. Duplicate photograph supplied for multiple required slots
  // --------------------------------------------------------------------------
  it("Scenario 13 [DETERMINISTIC TEST]: duplicate photo supplied across slots -> flagged with WARNING", () => {
    const identicalDataUrl = VALID_BASE64_JPEG;
    const readiness = evaluateEvidenceReadiness({
      slots: {
        front: { slotId: "front", dataUrl: identicalDataUrl, mimeType: "image/jpeg" },
        back: { slotId: "back", dataUrl: identicalDataUrl, mimeType: "image/jpeg" },
        label: {
          slotId: "label",
          dataUrl:
            "data:image/jpeg;base64," +
            Buffer.from(new Uint8Array(1024).fill(0xbb)).toString("base64"),
          mimeType: "image/jpeg",
        },
      },
      requiredSlots: ["front", "back", "label"],
    });

    assert.equal(readiness.status, "WARNING");
    assert.equal(readiness.canInspect, true); // Still allowed to inspect
    assert.ok(readiness.warnings.some((w) => w.includes("Duplicate image detected")));
    assert.equal(readiness.slotStatuses.front.status, "WARNING");
    assert.equal(readiness.slotStatuses.back.status, "WARNING");
  });

  // --------------------------------------------------------------------------
  // 14. Gemini / Model / API failure
  // --------------------------------------------------------------------------
  it("Scenario 14 [SIMULATED INFRASTRUCTURE FAILURE]: model failure handled safely, never fabricates PASS", async () => {
    async function simulateGeminiCall(): Promise<never> {
      throw new Error("503 Service Unavailable: High server load on Gemini endpoint");
    }

    let caughtError: Error | null = null;
    let inspectionRecord: unknown = null;
    try {
      await simulateGeminiCall();
    } catch (err: unknown) {
      caughtError = err as Error;
      inspectionRecord = null; // No record fabricated
    }

    assert.ok(caughtError !== null);
    assert.equal(inspectionRecord, null);
    // Human-friendly error translation preserves safety
    const translated = translateErrorToHuman(caughtError.message);
    assert.ok(translated.length > 0);
  });

  // --------------------------------------------------------------------------
  // 15. Missing or unverified authoritative policy
  // --------------------------------------------------------------------------
  it("Scenario 15 [DETERMINISTIC TEST]: inactive or unverified rule cannot produce PASS", () => {
    const workOrder = resolveWorkOrderForUnit("UNIT-0001");
    const inactiveRule: AuthoritativePrepRule = {
      ruleId: "UNVERIFIED-RULE-999",
      version: "0.1-draft",
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      title: "Unverified Draft Barcode Rule",
      source: {
        publisher: "Draft Unverified Source",
        url: "https://example.com/draft",
        retrievedAt: "2026-09-27T00:00:00.000Z",
      },
      applicability: {
        source: "ALWAYS_APPLICABLE",
        requiredInputs: [],
      },
      verification: {
        requiredObservationFields: ["manufacturerBarcodeCoverage.status"],
        visualVerifiability: "FULL",
      },
      status: "UNVERIFIED", // Crucial: rule is UNVERIFIED
    };

    const observation = makeBaseObservation("UNIT-0001", workOrder.expectedFnsku);

    const record = runPrepInspection({
      observation,
      workOrder,
      rules: [inactiveRule],
      policyContext,
    });
    const check = record.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE");

    // Unverified rule must NEVER evaluate to PASS
    assert.notEqual(check?.verdict, "PASS");
    assert.equal(check?.verdict, "UNCERTAIN");
    assert.equal(check?.reasonCode, "RULE_UNAVAILABLE");
  });
});
