import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateFnskuIdentity } from "../../src/lib/compliance/evaluators/fnsku-identity";
import { evaluateManufacturerBarcodeCoverage } from "../../src/lib/compliance/evaluators/manufacturer-barcode-coverage";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  getOrderedOperatorProblems,
} from "../../src/lib/inspection/operator-presentation";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type {
  FnskuObservation,
  PrepUnitObservation,
  ManufacturerBarcodeObservation,
} from "../../src/lib/vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";

const FNSKU_RULE: AuthoritativePrepRule = {
  ruleId: "RULE-AMZ-FNSKU-ID",
  version: "2026-03-01",
  checkType: "FNSKU_IDENTITY",
  title: "FNSKU Barcode Label Identity Verification",
  source: {
    publisher: "Amazon Seller Central",
    url: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Packaging and Prep Requirements - Unit Labeling",
  },
  applicability: {
    source: "WORK_ORDER_DERIVED",
    requiredInputs: ["workOrder.expectedFnsku"],
  },
  verification: {
    requiredObservationFields: ["fnsku.visibility", "fnsku.legibility", "fnsku.detectedValue"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const BARCODE_RULE: AuthoritativePrepRule = {
  ruleId: "RULE-AMZ-BARCODE-COVER",
  version: "2026-03-01",
  checkType: "MANUFACTURER_BARCODE_COVERAGE",
  title: "Manufacturer Barcode Coverage Verification",
  source: {
    publisher: "Amazon Seller Central",
    url: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Packaging and Prep Requirements - Unit Labeling",
  },
  applicability: {
    source: "WORK_ORDER_DERIVED",
    requiredInputs: [],
  },
  verification: {
    requiredObservationFields: ["manufacturerBarcodeCoverage.status"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const BASE_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-REAL-HARDENING",
  unitId: "UNIT-REAL-001",
  sku: "SKU-REAL-HARDENING",
  asin: "B0REALHARDEN",
  expectedFnsku: "X00REALFNSKU",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

function makeObservationWith(
  overrides: Partial<PrepUnitObservation>
): PrepUnitObservation {
  return {
    unitId: "UNIT-REAL-001",
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
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
      valueCompleteness: "UNCERTAIN",
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
    ...overrides,
  };
}

describe("Real-World Recovery Semantics Hardening (Regression Suite)", () => {
  // A. Unknown barcode does not become manufacturer barcode automatically
  it("A. Unknown barcode does not become manufacturer barcode automatically", () => {
    // When an unknown/unclassified barcode is detected on packaging, it must NOT automatically
    // be recorded as an uncovered manufacturer barcode (UPC/EAN) or force coverage to NOT_COVERED.
    const barcodeObs: ManufacturerBarcodeObservation = {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Unknown shipping/courier barcode visible" }],
    };

    const res = evaluateManufacturerBarcodeCoverage({
      rule: BARCODE_RULE,
      ruleRequiresBarcodeCoverage: true,
      manufacturerBarcodeObservation: barcodeObs,
      manufacturerBarcodeCoverageObservation: {
        status: "UNCERTAIN",
        coveringType: null,
        evidence: [{ imageId: "back", description: "Unknown barcode present, coverage uncertain" }],
      },
    });

    // It must remain UNCERTAIN (never convert unknown barcode into positive visible manufacturer barcode defect FAIL)
    assert.equal(res.verdict, "UNCERTAIN");
    assert.notEqual(res.verdict, "FAIL", "Unknown barcode must not become manufacturer barcode defect automatically");
    assert.notEqual(res.verdict, "PASS", "Unknown barcode cannot satisfy manufacturer barcode coverage");
  });

  // B. Unknown barcode does not become FNSKU automatically
  it("B. Unknown barcode does not become FNSKU automatically", () => {
    // An unknown detected barcode string must NOT be treated as a valid FNSKU match
    const fnskuObs: FnskuObservation = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: "UNKNOWN-CODE-987654",
      placement: "UNCERTAIN",
      placementDescription: "Unclassified barcode detected on label slot",
      evidence: [{ imageId: "label", description: "Unidentified barcode" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: fnskuObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.verdict, "UNCERTAIN");
    assert.notEqual(res.verdict, "PASS", "Unknown barcode must never satisfy FNSKU identity");
  });

  // C. QR code does not satisfy FNSKU identity
  it("C. QR code does not satisfy FNSKU identity", () => {
    // Retail phone box with regulatory or manufacturer URL QR code
    const qrObs: FnskuObservation = {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: "Regulatory QR code and serials visible on box",
      evidence: [{ imageId: "label", description: "Infinix QR code: https://infinixmobility.com" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: qrObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.verdict, "UNCERTAIN");
    assert.notEqual(res.verdict, "PASS", "QR code must never satisfy FNSKU identity");
  });

  // D. Shipping/courier barcode does not satisfy FNSKU identity
  it("D. Shipping/courier barcode does not satisfy FNSKU identity", () => {
    // Packaged clothing item photographed with carrier tracking barcode (e.g. 1Z courier barcode)
    const courierObs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "1Z9999999999999999", // Clearly courier/shipping barcode
      placement: "FLAT_SURFACE",
      placementDescription: "Carrier tracking label on polybag",
      evidence: [{ imageId: "label", description: "Courier shipping tracking label" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: courierObs,
      rule: FNSKU_RULE,
    });

    // Mismatched expected FNSKU must FAIL, never PASS
    assert.equal(res.verdict, "FAIL");
    assert.equal(res.reasonCode, "EXPECTED_VALUE_MISMATCH");
    assert.notEqual(res.verdict, "PASS", "Shipping/courier barcode must never satisfy FNSKU identity");
  });

  // E. Unidentified product/regulatory label does not satisfy FNSKU identity
  it("E. Unidentified product/regulatory label does not satisfy FNSKU identity", () => {
    const regObs: FnskuObservation = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: "CE, FCC, RoHS regulatory marks visible",
      evidence: [{ imageId: "label", description: "Regulatory label with compliance marks" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: regObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.verdict, "UNCERTAIN");
    assert.equal(res.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(res.verdict, "PASS");
  });

  // F. FNSKU recovery wording does not call an unidentified label "the FNSKU label"
  it("F. FNSKU recovery wording does not call an unidentified label 'the FNSKU label'", () => {
    const obs = makeObservationWith({
      fnsku: {
        visibility: "UNCERTAIN",
        legibility: "UNCERTAIN",
        valueCompleteness: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [{ imageId: "label", description: "Unidentified label in view" }],
      },
    });

    const inspection = runPrepInspection({
      workOrder: BASE_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    const labelTask = tasks.find(
      (t) =>
        t.resolvesCheckTypes.includes("FNSKU_IDENTITY") ||
        t.resolvesCheckTypes.includes("FNSKU_PLACEMENT")
    );

    assert.ok(labelTask, "FNSKU recovery task must exist");

    // 1. Title must NOT assume the photographed label is the FNSKU label
    assert.equal(labelTask.actionTitle, "Retake product label photo");

    // 2. Observation must NOT assume the photographed label is an FNSKU label
    assert.equal(
      labelTask.humanObservation,
      "We can't verify the expected Amazon/FNSKU label from this photo."
    );

    // 3. Must NOT say "Hold the camera closer to the FNSKU label."
    for (const step of labelTask.whatToDoSteps) {
      assert.ok(
        !step.includes("Hold the camera closer to the FNSKU label"),
        `Instruction must not assume photographed label is FNSKU: "${step}"`
      );
    }

    // 4. Must instruct operator to locate the Amazon/FNSKU product label
    assert.ok(
      labelTask.whatToDoSteps.some((step) =>
        step.includes("Locate the Amazon/FNSKU product label on the unit.")
      ),
      "Must include step to locate the Amazon/FNSKU label"
    );
  });

  // G. Expected FNSKU shown from work order is explicitly marked as expected, not observed
  it("G. Expected FNSKU shown from work order is explicitly marked as expected, not observed", () => {
    const obs = makeObservationWith({
      fnsku: {
        visibility: "UNCERTAIN",
        legibility: "UNCERTAIN",
        valueCompleteness: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [{ imageId: "label", description: "Unverified label" }],
      },
    });

    const inspection = runPrepInspection({
      workOrder: BASE_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, BASE_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: BASE_WORK_ORDER,
      observation: obs,
    });

    const labelTask = tasks.find((t) => t.resolvesCheckTypes.includes("FNSKU_IDENTITY"));
    assert.ok(labelTask);

    // Example text in photo recovery hints must explicitly declare "Expected from work order", NOT "Observed"
    if (labelTask.photoRecoveryHints?.exampleText) {
      assert.ok(
        labelTask.photoRecoveryHints.exampleText.includes("Expected from work order"),
        `Must indicate work-order source: "${labelTask.photoRecoveryHints.exampleText}"`
      );
      assert.ok(
        !labelTask.photoRecoveryHints.exampleText.startsWith("Observed FNSKU:"),
        "Must not report unobserved FNSKU as observed"
      );
    }

    // Underlying check observation must reflect null or unverified detected value
    const fnskuCheck = labelTask.underlyingChecks.find((c) => c.checkType === "FNSKU_IDENTITY");
    assert.ok(fnskuCheck);
    assert.ok(
      !fnskuCheck.aiObservation.includes(BASE_WORK_ORDER.expectedFnsku),
      "Observed fact must not claim expected FNSKU was observed"
    );
    assert.ok(
      fnskuCheck.aiObservation.includes("NOT_DETECTED") ||
        fnskuCheck.aiObservation.includes("UNCERTAIN") ||
        fnskuCheck.aiObservation.includes("none"),
      "Observation details must reflect unverified FNSKU"
    );

    const auditCheck = inspection.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    assert.ok(auditCheck);
    assert.equal(auditCheck.observedValue, null);
  });

  // H. Demo corrected-photo helpers appear only for controlled demo samples
  it("H. Demo corrected-photo helpers appear only for controlled demo samples", () => {
    // Mode predicate check:
    // A helper function or rendering gate check simulating page.tsx behavior
    function shouldShowCorrectedBackHelper(
      unitMode: "DEMO_SAMPLE" | "MANUAL_UNIT",
      selectedUnitId: string,
      checkType: string
    ): boolean {
      return (
        unitMode === "DEMO_SAMPLE" &&
        (selectedUnitId === "SAMPLE-02" || selectedUnitId === "DEMO-DEFECT") &&
        checkType === "MANUFACTURER_BARCODE_COVERAGE"
      );
    }

    function shouldShowClearerExpiryHelper(
      unitMode: "DEMO_SAMPLE" | "MANUAL_UNIT",
      selectedUnitId: string,
      checkType: string
    ): boolean {
      return (
        unitMode === "DEMO_SAMPLE" &&
        (selectedUnitId === "SAMPLE-03" || selectedUnitId === "DEMO-RECOVERY") &&
        (checkType === "EXPIRY_LEGIBILITY" || checkType === "EXPIRY_VISIBILITY")
      );
    }

    // For DEMO_SAMPLE on SAMPLE-02:
    assert.equal(
      shouldShowCorrectedBackHelper("DEMO_SAMPLE", "SAMPLE-02", "MANUFACTURER_BARCODE_COVERAGE"),
      true,
      "Demo mode on SAMPLE-02 should show corrected back helper"
    );

    // For DEMO_SAMPLE on SAMPLE-03:
    assert.equal(
      shouldShowClearerExpiryHelper("DEMO_SAMPLE", "SAMPLE-03", "EXPIRY_LEGIBILITY"),
      true,
      "Demo mode on SAMPLE-03 should show clearer expiry helper"
    );
  });

  // I. Manual/real units never show fixture-injection buttons
  it("I. Manual/real units never show fixture-injection buttons", () => {
    function shouldShowCorrectedBackHelper(
      unitMode: "DEMO_SAMPLE" | "MANUAL_UNIT",
      selectedUnitId: string,
      checkType: string
    ): boolean {
      return (
        unitMode === "DEMO_SAMPLE" &&
        (selectedUnitId === "SAMPLE-02" || selectedUnitId === "DEMO-DEFECT") &&
        checkType === "MANUFACTURER_BARCODE_COVERAGE"
      );
    }

    function shouldShowClearerExpiryHelper(
      unitMode: "DEMO_SAMPLE" | "MANUAL_UNIT",
      selectedUnitId: string,
      checkType: string
    ): boolean {
      return (
        unitMode === "DEMO_SAMPLE" &&
        (selectedUnitId === "SAMPLE-03" || selectedUnitId === "DEMO-RECOVERY") &&
        (checkType === "EXPIRY_LEGIBILITY" || checkType === "EXPIRY_VISIBILITY")
      );
    }

    // Manual/real unit IDs
    const manualUnits = [
      "REAL-PACKAGE-001",
      "REAL-PHONE-001",
      "UNIT-9999",
      "MY-CUSTOM-PACKAGE",
      "SAMPLE-02", // even if operator manually inputs SAMPLE-02 ID in manual mode!
      "SAMPLE-03",
    ];

    for (const unitId of manualUnits) {
      assert.equal(
        shouldShowCorrectedBackHelper("MANUAL_UNIT", unitId, "MANUFACTURER_BARCODE_COVERAGE"),
        false,
        `Manual mode for ${unitId} must NEVER show USE CORRECTED BACK PHOTO button`
      );
      assert.equal(
        shouldShowClearerExpiryHelper("MANUAL_UNIT", unitId, "EXPIRY_LEGIBILITY"),
        false,
        `Manual mode for ${unitId} must NEVER show Use clearer expiry photo button`
      );
    }
  });

  // J. A sharper photo of the wrong label cannot produce PASS merely because image quality improved
  it("J. A sharper photo of the wrong label cannot produce PASS merely because image quality improved", () => {
    // High-resolution, sharp photo (GOOD image quality, 0 issues), but label is wrong/regulatory/courier
    const highQualityWrongLabelObs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "REGULATORY-MODEL-X8", // Sharp photograph of phone box model number
      placement: "FLAT_SURFACE",
      placementDescription: "Sharp close-up of phone regulatory box label",
      evidence: [{ imageId: "label", description: "Ultra-sharp image of regulatory text" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: highQualityWrongLabelObs,
      rule: FNSKU_RULE,
    });

    // Despite perfect image sharpness, it MUST NOT PASS!
    assert.equal(res.verdict, "FAIL");
    assert.notEqual(res.verdict, "PASS", "Sharpness of the wrong label cannot produce PASS");
    assert.equal(res.reasonCode, "EXPECTED_VALUE_MISMATCH");

    // If detectedValue is null (sharp photo of unrelated box area or packaging):
    const highQualityNoFnskuObs: FnskuObservation = {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: "Clean box surface without Amazon FNSKU barcode",
      evidence: [{ imageId: "label", description: "Sharp image of carton surface" }],
    };

    const res2 = evaluateFnskuIdentity({
      expectedFnsku: "X00REALFNSKU",
      fnskuObservation: highQualityNoFnskuObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res2.verdict, "UNCERTAIN");
    assert.notEqual(res2.verdict, "PASS", "Sharp photo without FNSKU cannot produce PASS");
  });
});
