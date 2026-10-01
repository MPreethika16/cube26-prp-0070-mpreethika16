import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateFnskuIdentity } from "../../src/lib/compliance/evaluators/fnsku-identity";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type { FnskuObservation, PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
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

const BASE_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-TEST-STEP7",
  unitId: "UNIT-STEP7",
  sku: "SKU-STEP7",
  asin: "B0TESTSTEP7",
  expectedFnsku: "X00DUMMY001",
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

function makeFullObservation(fnsku: FnskuObservation): PrepUnitObservation {
  return {
    unitId: "UNIT-STEP7",
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku,
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
      evidence: [{ imageId: "back", description: "Opaque label" }],
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

describe("Day 5 / Step 7: Identifier Evidence Hardening & Completeness Invariant", () => {
  // 1. COMPLETE + exact identifier -> PASS
  it("1. COMPLETE + exact identifier -> PASS", () => {
    const obs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Centered on flat carton",
      evidence: [{ imageId: "label", description: "Clear full FNSKU barcode" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: obs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "PASS");
    assert.equal(res.reasonCode, "REQUIREMENT_SATISFIED");
    assert.equal(res.observedValue, "X00DUMMY001");
  });

  // 2. COMPLETE + wrong identifier -> FAIL
  it("2. COMPLETE + wrong identifier -> FAIL", () => {
    const obs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "X00WRONG999",
      placement: "FLAT_SURFACE",
      placementDescription: "Centered on flat carton",
      evidence: [{ imageId: "label", description: "Clearly wrong FNSKU" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: obs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "FAIL");
    assert.equal(res.reasonCode, "EXPECTED_VALUE_MISMATCH");
    assert.equal(res.observedValue, "X00WRONG999");
  });

  // 3. PARTIAL + matching visible prefix -> UNCERTAIN (never FAIL)
  it("3. PARTIAL + matching visible prefix -> UNCERTAIN", () => {
    const obs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "PARTIAL",
      detectedValue: "X00DU",
      placement: "FLAT_SURFACE",
      placementDescription: "Cropped edge of label",
      evidence: [{ imageId: "label_cropped", description: "Only prefix X00DU visible" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: obs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "UNCERTAIN");
    assert.equal(res.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(res.verdict, "FAIL", "Partial evidence must not be converted to FAIL");
    assert.notEqual(res.verdict, "PASS", "Partial evidence must not produce false PASS");
  });

  // 4. PARTIAL + apparently full detectedValue -> UNCERTAIN (prevents autocompleted hallucination from passing)
  it("4. PARTIAL + apparently full detectedValue -> UNCERTAIN", () => {
    const obs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "PARTIAL",
      detectedValue: "X00DUMMY001", // Model autocompleted the string, but correctly flagged PARTIAL
      placement: "FLAT_SURFACE",
      placementDescription: "Label cut off at border",
      evidence: [{ imageId: "label_cropped", description: "Label partially cropped" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: obs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "UNCERTAIN");
    assert.equal(res.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(res.verdict, "PASS", "PARTIAL completeness must never PASS even if string matches");
  });

  // 5. UNCERTAIN completeness -> UNCERTAIN
  it("5. UNCERTAIN completeness -> UNCERTAIN", () => {
    const obs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "UNCERTAIN",
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Ambiguous border framing",
      evidence: [{ imageId: "label", description: "Border completeness uncertain" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: obs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "UNCERTAIN");
    assert.equal(res.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(res.verdict, "PASS");
  });

  // 6. missing completeness on legacy observation -> cannot produce unsafe PASS
  it("6. missing completeness on legacy observation -> cannot produce unsafe PASS", () => {
    const legacyObs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      // valueCompleteness is undefined (legacy observation record)
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Unverified legacy capture",
      evidence: [{ imageId: "label_legacy", description: "Legacy observation without completeness" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: legacyObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.applicability, "APPLICABLE");
    assert.equal(res.verdict, "UNCERTAIN");
    assert.equal(res.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.notEqual(res.verdict, "PASS", "Missing completeness cannot be silently promoted to COMPLETE in production");
  });

  // 7. cropped identifier cannot PASS (end-to-end integration)
  it("7. cropped identifier cannot PASS (end-to-end integration)", () => {
    const croppedObs = makeFullObservation({
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "PARTIAL",
      detectedValue: "X00DU",
      placement: "FLAT_SURFACE",
      placementDescription: "Cropped edge",
      evidence: [{ imageId: "label_crop", description: "Partial FNSKU visible" }],
    });

    const record = runPrepInspection({
      observation: croppedObs,
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
    assert.ok(opStatus.uncertainCheckTypes.includes("FNSKU_IDENTITY"));
    assert.equal(opStatus.passCount, 2); // Placement and barcode coverage pass, identity does NOT
  });

  // 8. clean complete identifier still PASSes (end-to-end integration)
  it("8. clean complete identifier still PASSes (end-to-end integration)", () => {
    const cleanObs = makeFullObservation({
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Centered flat on back",
      evidence: [{ imageId: "label_clean", description: "High-resolution full FNSKU" }],
    });

    const record = runPrepInspection({
      observation: cleanObs,
      workOrder: BASE_WORK_ORDER,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY")!;
    assert.equal(fnskuCheck.verdict, "PASS");
    assert.equal(fnskuCheck.reasonCode, "REQUIREMENT_SATISFIED");

    const opStatus = aggregateOperationalStatus(record);
    assert.equal(opStatus.status, "READY");
    assert.equal(opStatus.failCount, 0);
    assert.equal(opStatus.uncertainCount, 0);
    assert.equal(opStatus.passCount, 3);
  });

  // 9. evaluator does not autocomplete or mutate detectedValue
  it("9. evaluator does not autocomplete or mutate detectedValue", () => {
    const inputObs: FnskuObservation = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "PARTIAL",
      detectedValue: "X00DU",
      placement: "FLAT_SURFACE",
      placementDescription: "Prefix only",
      evidence: [{ imageId: "label", description: "Cropped" }],
    };

    const res = evaluateFnskuIdentity({
      expectedFnsku: "X00DUMMY001",
      fnskuObservation: inputObs,
      rule: FNSKU_RULE,
    });

    assert.equal(res.observedValue, "X00DU");
    assert.equal(inputObs.detectedValue, "X00DU", "Input detectedValue must remain untouched");
    assert.notEqual(res.observedValue, "X00DUMMY001", "Evaluator must never autocomplete missing characters");
  });
});
