import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";
import type {
  FnskuObservation,
  ExpiryDateObservation,
  HandlingMarkObservation,
} from "../../src/lib/vision/prep-observation.schema";
import {
  evaluateFnskuIdentity,
  evaluateExpiryVisibility,
  evaluateHandlingMarks,
} from "../../src/lib/compliance/evaluators";
import {
  complianceCheckResultSchema,
} from "../../src/lib/compliance/compliance-result.schema";

/**
 * Clearly marked synthetic TEST FIXTURES.
 * These are test fixtures for unit tests and do NOT represent real Amazon policies.
 */
const TEST_FIXTURE_FNSKU_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-FNSKU-001",
  version: "1.0-test",
  checkType: "FNSKU_IDENTITY",
  title: "Test Fixture: FNSKU Identity Verification",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-fnsku-policy",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Synthetic test fixture for Day 2 Step 4 tests",
  },
  applicability: {
    source: "WORK_ORDER_FNSKU",
    requiredInputs: ["workOrder.expectedFnsku"],
  },
  verification: {
    requiredObservationFields: ["fnsku.visibility", "fnsku.legibility", "fnsku.detectedValue"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const TEST_FIXTURE_EXPIRY_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-EXPIRY-001",
  version: "1.0-test",
  checkType: "EXPIRY_VISIBILITY",
  title: "Test Fixture: Expiry Date Visibility",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-expiry-policy",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Synthetic test fixture for Day 2 Step 4 tests",
  },
  applicability: {
    source: "WORK_ORDER_EXPIRY",
    requiredInputs: ["workOrder.requirements.expiryDate"],
  },
  verification: {
    requiredObservationFields: ["expiryDate.visibility", "expiryDate.legibility"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const TEST_FIXTURE_HANDLING_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-HANDLING-001",
  version: "1.0-test",
  checkType: "HANDLING_MARKS",
  title: "Test Fixture: Handling Marks Verification",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-handling-policy",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Synthetic test fixture for Day 2 Step 4 tests",
  },
  applicability: {
    source: "WORK_ORDER_HANDLING_MARKS",
    requiredInputs: ["workOrder.requirements.handlingMarks"],
  },
  verification: {
    requiredObservationFields: ["handlingMarks.visibility", "handlingMarks.detectedType"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

function createBaseWorkOrder(overrides?: Partial<WorkOrderSpecification>): WorkOrderSpecification {
  return {
    workOrderId: "WO-TEST-100",
    unitId: "UNIT-TEST-100",
    sku: "SKU-TEST-001",
    asin: "B00TEST001",
    expectedFnsku: "X00DUMMY001",
    requirements: {
      polybag: "NOT_REQUIRED",
      suffocationWarning: "NOT_REQUIRED",
      expiryDate: "REQUIRED",
      handlingMarks: {
        state: "REQUIRED",
        requiredMarks: ["fragile"],
      },
    },
    ...overrides,
  };
}

describe("Day 2 / Step 4: Compliance Evaluators", () => {
  describe("FNSKU_IDENTITY Evaluator", () => {
    it("1. matching visible legible FNSKU -> PASS", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat back face",
        evidence: [{ imageId: "label.jpg", description: "FNSKU barcode clearly visible" }],
      };

      const result = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: observation,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.equal(result.rule.ruleId, TEST_FIXTURE_FNSKU_RULE.ruleId);
      assert.equal(result.rule.version, TEST_FIXTURE_FNSKU_RULE.version);
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("2. visible legible wrong FNSKU -> FAIL with EXPECTED_VALUE_MISMATCH", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00WRONG999",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat back face",
        evidence: [{ imageId: "label.jpg", description: "FNSKU barcode reads X00WRONG999" }],
      };

      const result = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: observation,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "FAIL");
      assert.equal(result.reasonCode, "EXPECTED_VALUE_MISMATCH");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("3. NOT_DETECTED -> UNCERTAIN (never FAIL merely from non-detection)", () => {
      const observation: FnskuObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      };

      const result = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: observation,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("4. ILLEGIBLE -> UNCERTAIN with TEXT_ILLEGIBLE", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        placement: "FLAT_SURFACE",
        placementDescription: "Blurred sticker",
        evidence: [{ imageId: "label.jpg", description: "Barcode is blurry and cannot be parsed" }],
      };

      const result = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: observation,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "TEXT_ILLEGIBLE");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });
  });

  describe("EXPIRY_VISIBILITY Evaluator", () => {
    it("5. NOT_REQUIRED -> NOT_APPLICABLE + null verdict (never PASS)", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: ExpiryDateObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };

      const result = evaluateExpiryVisibility({
        workOrder,
        expiryObservation: observation,
        rule: TEST_FIXTURE_EXPIRY_RULE,
      });

      assert.equal(result.applicability, "NOT_APPLICABLE");
      assert.equal(result.verdict, null);
      assert.equal(result.reasonCode, "NOT_APPLICABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("6. UNKNOWN requirement -> UNCERTAIN with REQUIREMENT_UNKNOWN", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "UNKNOWN",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: ExpiryDateObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "2027-12-31",
        evidence: [{ imageId: "back.jpg", description: "Expiry printed" }],
      };

      const result = evaluateExpiryVisibility({
        workOrder,
        expiryObservation: observation,
        rule: TEST_FIXTURE_EXPIRY_RULE,
      });

      assert.equal(result.applicability, "UNKNOWN");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "REQUIREMENT_UNKNOWN");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("7. REQUIRED + visible legible -> PASS", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: ExpiryDateObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "2027-12-31",
        evidence: [{ imageId: "back.jpg", description: "Expiry date clearly legible" }],
      };

      const result = evaluateExpiryVisibility({
        workOrder,
        expiryObservation: observation,
        rule: TEST_FIXTURE_EXPIRY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("8. REQUIRED + NOT_DETECTED -> UNCERTAIN (never FAIL merely from non-detection)", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: ExpiryDateObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };

      const result = evaluateExpiryVisibility({
        workOrder,
        expiryObservation: observation,
        rule: TEST_FIXTURE_EXPIRY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });
  });

  describe("HANDLING_MARKS Evaluator", () => {
    it("9. all required marks detected -> PASS", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: {
            state: "REQUIRED",
            requiredMarks: ["fragile", "this_way_up"],
          },
        },
      });

      const observations: HandlingMarkObservation[] = [
        {
          detectedType: "fragile",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "FRAGILE - HANDLE WITH CARE",
          evidence: [{ imageId: "front.jpg", description: "Fragile wine glass icon" }],
        },
        {
          detectedType: "this_way_up",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "THIS WAY UP",
          evidence: [{ imageId: "front.jpg", description: "Two upward arrows" }],
        },
      ];

      const result = evaluateHandlingMarks({
        workOrder,
        handlingMarksObservations: observations,
        rule: TEST_FIXTURE_HANDLING_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("10. required mark not verified -> UNCERTAIN (never FAIL from non-detection)", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: {
            state: "REQUIRED",
            requiredMarks: ["fragile", "liquid"],
          },
        },
      });

      // Only "fragile" detected, "liquid" not detected
      const observations: HandlingMarkObservation[] = [
        {
          detectedType: "fragile",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "FRAGILE",
          evidence: [{ imageId: "front.jpg", description: "Fragile mark seen" }],
        },
      ];

      const result = evaluateHandlingMarks({
        workOrder,
        handlingMarksObservations: observations,
        rule: TEST_FIXTURE_HANDLING_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });
    it("10b. NOT_REQUIRED -> NOT_APPLICABLE + null verdict with reasonCode NOT_APPLICABLE", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: {
            state: "NOT_REQUIRED",
            requiredMarks: [],
          },
        },
      });

      const result = evaluateHandlingMarks({
        workOrder,
        handlingMarksObservations: [],
        rule: TEST_FIXTURE_HANDLING_RULE,
      });

      assert.equal(result.applicability, "NOT_APPLICABLE");
      assert.equal(result.verdict, null);
      assert.equal(result.reasonCode, "NOT_APPLICABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });
  });

  describe("Rule Guardrails", () => {
    it("11. inactive/unverified rule cannot produce PASS/FAIL", () => {
      const supersededRule: AuthoritativePrepRule = {
        ...TEST_FIXTURE_FNSKU_RULE,
        status: "SUPERSEDED",
      };

      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY001",
        placement: "FLAT_SURFACE",
        placementDescription: "Good",
        evidence: [],
      };

      const result = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: observation,
        rule: supersededRule,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "RULE_UNAVAILABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.notEqual(result.verdict, "FAIL");
    });

    it("12. NOT_VISUALLY_VERIFIABLE rule cannot produce PASS/FAIL", () => {
      const nonVerifiableRule: AuthoritativePrepRule = {
        ...TEST_FIXTURE_EXPIRY_RULE,
        verification: {
          ...TEST_FIXTURE_EXPIRY_RULE.verification,
          visualVerifiability: "NOT_VISUALLY_VERIFIABLE",
        },
      };

      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: ExpiryDateObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "2027-12-31",
        evidence: [],
      };

      const result = evaluateExpiryVisibility({
        workOrder,
        expiryObservation: observation,
        rule: nonVerifiableRule,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "RULE_NOT_VISUALLY_VERIFIABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.notEqual(result.verdict, "FAIL");
    });
  });

  describe("Architectural Invariants", () => {
    it("13. NOT_APPLICABLE is never represented as PASS (schema strictly rejects PASS when NOT_APPLICABLE)", () => {
      // Schema validation throws if someone constructs a result where applicability is NOT_APPLICABLE and verdict is PASS
      const invalidCombination: unknown = {
        checkId: "CHECK-001",
        checkType: "EXPIRY_VISIBILITY",
        applicability: "NOT_APPLICABLE",
        verdict: "PASS",
        reasonCode: "NOT_APPLICABLE",
        explanation: "Erroneously assigned PASS to not applicable check",
        rule: { ruleId: "R1", version: "1.0" },
        evidence: [],
      };

      assert.throws(
        () => complianceCheckResultSchema.parse(invalidCombination),
        (err: unknown) => {
          return err instanceof Error;
        }
      );
    });

    it("14. FAIL requires positive contradictory evidence in the implemented evaluators", () => {
      // A) Non-detection of required FNSKU -> UNCERTAIN, never FAIL
      const notDetectedFnsku: FnskuObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      };
      const fnskuResult = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: notDetectedFnsku,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });
      assert.equal(fnskuResult.verdict, "UNCERTAIN");

      // B) Positive contradictory evidence: FNSKU is visible, legible, but a different value -> FAIL
      const contradictoryFnsku: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X00CONTRADICTORY",
        placement: "FLAT_SURFACE",
        placementDescription: "Legible label",
        evidence: [{ imageId: "img1.jpg", description: "Label clearly says X00CONTRADICTORY" }],
      };
      const fnskuContradictionResult = evaluateFnskuIdentity({
        expectedFnsku: "X00DUMMY001",
        fnskuObservation: contradictoryFnsku,
        rule: TEST_FIXTURE_FNSKU_RULE,
      });
      assert.equal(fnskuContradictionResult.verdict, "FAIL");
      assert.equal(fnskuContradictionResult.reasonCode, "EXPECTED_VALUE_MISMATCH");

      // C) Non-detection of required expiry -> UNCERTAIN, never FAIL
      const notDetectedExpiry: ExpiryDateObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };
      const expiryResult = evaluateExpiryVisibility({
        workOrder: createBaseWorkOrder({
          requirements: {
            polybag: "NOT_REQUIRED",
            suffocationWarning: "NOT_REQUIRED",
            expiryDate: "REQUIRED",
            handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
          },
        }),
        expiryObservation: notDetectedExpiry,
        rule: TEST_FIXTURE_EXPIRY_RULE,
      });
      assert.equal(expiryResult.verdict, "UNCERTAIN");
    });
  });
});
