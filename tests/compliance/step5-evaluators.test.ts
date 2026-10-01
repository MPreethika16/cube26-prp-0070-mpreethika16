import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";
import type {
  PolybagObservation,
  SuffocationWarningObservation,
  ExpiryDateObservation,
  FnskuObservation,
  ManufacturerBarcodeObservation,
} from "../../src/lib/vision/prep-observation.schema";
import {
  evaluatePolybagPresence,
  evaluatePolybagSeal,
  evaluateSuffocationWarningPresence,
  evaluateSuffocationWarningLegibility,
  evaluateExpiryLegibility,
  evaluateFnskuPlacement,
  evaluateManufacturerBarcodeCoverage,
} from "../../src/lib/compliance/evaluators";
import { complianceCheckResultSchema } from "../../src/lib/compliance/compliance-result.schema";
import { RuleRegistry } from "../../src/lib/compliance/rules/registry";

/**
 * Synthetic TEST FIXTURES.
 * Strictly for unit test suite execution; do not represent real Amazon policies.
 */
const FIXTURE_POLYBAG_PRESENCE_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-POLYBAG-PRESENCE-001",
  version: "1.0-test",
  checkType: "POLYBAG_PRESENCE",
  title: "Test Fixture: Polybag Presence",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-polybag-presence",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "WORK_ORDER_POLYBAG",
    requiredInputs: ["workOrder.requirements.polybag"],
  },
  verification: {
    requiredObservationFields: ["polybag.visibility"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const FIXTURE_POLYBAG_SEAL_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-POLYBAG-SEAL-001",
  version: "1.0-test",
  checkType: "POLYBAG_SEAL",
  title: "Test Fixture: Polybag Seal",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-polybag-seal",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "WORK_ORDER_POLYBAG",
    requiredInputs: ["workOrder.requirements.polybag"],
  },
  verification: {
    requiredObservationFields: ["polybag.visibility", "polybag.sealStatus"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const FIXTURE_WARNING_PRESENCE_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-WARNING-PRESENCE-001",
  version: "1.0-test",
  checkType: "SUFFOCATION_WARNING_PRESENCE",
  title: "Test Fixture: Warning Presence",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-warning-presence",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "WORK_ORDER_WARNING",
    requiredInputs: ["workOrder.requirements.suffocationWarning"],
  },
  verification: {
    requiredObservationFields: ["suffocationWarning.visibility"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const FIXTURE_WARNING_LEGIBILITY_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-WARNING-LEGIBILITY-001",
  version: "1.0-test",
  checkType: "SUFFOCATION_WARNING_LEGIBILITY",
  title: "Test Fixture: Warning Legibility",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-warning-legibility",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "WORK_ORDER_WARNING",
    requiredInputs: ["workOrder.requirements.suffocationWarning"],
  },
  verification: {
    requiredObservationFields: ["suffocationWarning.visibility", "suffocationWarning.legibility"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const FIXTURE_EXPIRY_LEGIBILITY_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-EXPIRY-LEGIBILITY-001",
  version: "1.0-test",
  checkType: "EXPIRY_LEGIBILITY",
  title: "Test Fixture: Expiry Legibility",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-expiry-legibility",
    retrievedAt: "2026-03-01T00:00:00.000Z",
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

const FIXTURE_PLACEMENT_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-PLACEMENT-001",
  version: "1.0-test",
  checkType: "FNSKU_PLACEMENT",
  title: "Test Fixture: FNSKU Placement",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-placement",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "CHANNEL_PLACEMENT_POLICY",
    requiredInputs: ["fnsku.placement"],
  },
  verification: {
    requiredObservationFields: ["fnsku.placement"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

const FIXTURE_BARCODE_COVERAGE_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-BARCODE-COVERAGE-001",
  version: "1.0-test",
  checkType: "MANUFACTURER_BARCODE_COVERAGE",
  title: "Test Fixture: Barcode Coverage",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-barcode-coverage",
    retrievedAt: "2026-03-01T00:00:00.000Z",
  },
  applicability: {
    source: "CHANNEL_BARCODE_POLICY",
    requiredInputs: ["manufacturerBarcode.visibility"],
  },
  verification: {
    requiredObservationFields: ["manufacturerBarcode.visibility"],
    visualVerifiability: "FULL",
  },
  status: "ACTIVE",
};

function createTestWorkOrder(overrides?: Partial<WorkOrderSpecification>): WorkOrderSpecification {
  return {
    workOrderId: "WO-TEST-200",
    unitId: "UNIT-TEST-200",
    sku: "SKU-STEP5-001",
    asin: "B00STEP501",
    expectedFnsku: "X00STEP5001",
    requirements: {
      polybag: "REQUIRED",
      suffocationWarning: "REQUIRED",
      expiryDate: "REQUIRED",
      handlingMarks: {
        state: "NOT_REQUIRED",
        requiredMarks: [],
      },
    },
    ...overrides,
  };
}

describe("Day 2 / Step 5: Evaluators & Registry Suite", () => {
  describe("Polybag Presence & Seal", () => {
    it("1. required + visible -> PASS presence", () => {
      const observation: PolybagObservation = {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [{ imageId: "front.jpg", description: "Clear polybag visible" }],
      };

      const result = evaluatePolybagPresence({
        workOrder: createTestWorkOrder(),
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_PRESENCE_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("2. required + NOT_DETECTED -> UNCERTAIN (never FAIL)", () => {
      const observation: PolybagObservation = {
        visibility: "NOT_DETECTED",
        sealStatus: "UNCERTAIN",
        evidence: [],
      };

      const result = evaluatePolybagPresence({
        workOrder: createTestWorkOrder(),
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_PRESENCE_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("3. required + visible + SEALED -> PASS seal", () => {
      const observation: PolybagObservation = {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [{ imageId: "back.jpg", description: "Suffocation flap taped down flat" }],
      };

      const result = evaluatePolybagSeal({
        workOrder: createTestWorkOrder(),
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_SEAL_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("4. required + visible + NOT_SEALED -> FAIL seal (positive contradictory evidence)", () => {
      const observation: PolybagObservation = {
        visibility: "VISIBLE",
        sealStatus: "NOT_SEALED",
        evidence: [{ imageId: "back.jpg", description: "Bag opening is unsealed and gaping" }],
      };

      const result = evaluatePolybagSeal({
        workOrder: createTestWorkOrder(),
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_SEAL_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "FAIL");
      assert.equal(result.reasonCode, "REQUIREMENT_VIOLATED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("5. seal UNCERTAIN -> UNCERTAIN", () => {
      const observation: PolybagObservation = {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN",
        evidence: [{ imageId: "side.jpg", description: "Seal edge not in field of view" }],
      };

      const result = evaluatePolybagSeal({
        workOrder: createTestWorkOrder(),
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_SEAL_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("6. polybag NOT_REQUIRED -> NOT_APPLICABLE + null verdict + reasonCode NOT_APPLICABLE", () => {
      const workOrder = createTestWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: PolybagObservation = {
        visibility: "NOT_DETECTED",
        sealStatus: "UNCERTAIN",
        evidence: [],
      };

      const presenceResult = evaluatePolybagPresence({
        workOrder,
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_PRESENCE_RULE,
      });

      assert.equal(presenceResult.applicability, "NOT_APPLICABLE");
      assert.equal(presenceResult.verdict, null);
      assert.equal(presenceResult.reasonCode, "NOT_APPLICABLE");
      assert.notEqual(presenceResult.verdict, "PASS");

      const sealResult = evaluatePolybagSeal({
        workOrder,
        polybagObservation: observation,
        rule: FIXTURE_POLYBAG_SEAL_RULE,
      });

      assert.equal(sealResult.applicability, "NOT_APPLICABLE");
      assert.equal(sealResult.verdict, null);
      assert.equal(sealResult.reasonCode, "NOT_APPLICABLE");
      assert.notEqual(sealResult.verdict, "PASS");
    });
  });

  describe("Suffocation Warning Presence & Legibility", () => {
    it("7. required + visible -> PASS presence", () => {
      const observation: SuffocationWarningObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "WARNING: Keep away from small children",
        evidence: [{ imageId: "front.jpg", description: "Warning text on bag" }],
      };

      const result = evaluateSuffocationWarningPresence({
        workOrder: createTestWorkOrder(),
        suffocationWarningObservation: observation,
        rule: FIXTURE_WARNING_PRESENCE_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("8. NOT_DETECTED -> UNCERTAIN warning presence (never FAIL)", () => {
      const observation: SuffocationWarningObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [],
      };

      const result = evaluateSuffocationWarningPresence({
        workOrder: createTestWorkOrder(),
        suffocationWarningObservation: observation,
        rule: FIXTURE_WARNING_PRESENCE_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("9. visible + LEGIBLE -> PASS legibility", () => {
      const observation: SuffocationWarningObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "WARNING: To avoid danger of suffocation...",
        evidence: [{ imageId: "back.jpg", description: "Legible warning block" }],
      };

      const result = evaluateSuffocationWarningLegibility({
        workOrder: createTestWorkOrder(),
        suffocationWarningObservation: observation,
        rule: FIXTURE_WARNING_LEGIBILITY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("10. visible + ILLEGIBLE -> UNCERTAIN legibility (evidence cannot establish readability)", () => {
      const observation: SuffocationWarningObservation = {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedText: null,
        evidence: [{ imageId: "back.jpg", description: "Warning text is smudged and unreadable" }],
      };

      const result = evaluateSuffocationWarningLegibility({
        workOrder: createTestWorkOrder(),
        suffocationWarningObservation: observation,
        rule: FIXTURE_WARNING_LEGIBILITY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "TEXT_ILLEGIBLE");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("11. requirement UNKNOWN -> UNCERTAIN warning", () => {
      const workOrder = createTestWorkOrder({
        requirements: {
          polybag: "REQUIRED",
          suffocationWarning: "UNKNOWN",
          expiryDate: "REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const observation: SuffocationWarningObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "Warning text",
        evidence: [],
      };

      const result = evaluateSuffocationWarningPresence({
        workOrder,
        suffocationWarningObservation: observation,
        rule: FIXTURE_WARNING_PRESENCE_RULE,
      });

      assert.equal(result.applicability, "UNKNOWN");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "REQUIREMENT_UNKNOWN");
    });
  });

  describe("Expiry Legibility (Separated from Visibility)", () => {
    it("12. visible + LEGIBLE -> PASS legibility", () => {
      const observation: ExpiryDateObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "2027-10-15",
        evidence: [{ imageId: "label.jpg", description: "Sharp expiry print" }],
      };

      const result = evaluateExpiryLegibility({
        workOrder: createTestWorkOrder(),
        expiryObservation: observation,
        rule: FIXTURE_EXPIRY_LEGIBILITY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("13. visible + ILLEGIBLE -> UNCERTAIN legibility", () => {
      const observation: ExpiryDateObservation = {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [{ imageId: "label.jpg", description: "Expiry stamp blurred" }],
      };

      const result = evaluateExpiryLegibility({
        workOrder: createTestWorkOrder(),
        expiryObservation: observation,
        rule: FIXTURE_EXPIRY_LEGIBILITY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "TEXT_ILLEGIBLE");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("14. NOT_DETECTED -> UNCERTAIN expiry legibility", () => {
      const observation: ExpiryDateObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };

      const result = evaluateExpiryLegibility({
        workOrder: createTestWorkOrder(),
        expiryObservation: observation,
        rule: FIXTURE_EXPIRY_LEGIBILITY_RULE,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "FAIL");
    });
  });

  describe("Policy Safety & Contract Boundaries", () => {
    it("15. NOT_DETECTED never becomes FAIL for presence checks", () => {
      const workOrder = createTestWorkOrder();

      const polybagResult = evaluatePolybagPresence({
        workOrder,
        polybagObservation: { visibility: "NOT_DETECTED", sealStatus: "UNCERTAIN", evidence: [] },
        rule: FIXTURE_POLYBAG_PRESENCE_RULE,
      });
      assert.equal(polybagResult.verdict, "UNCERTAIN");

      const warningResult = evaluateSuffocationWarningPresence({
        workOrder,
        suffocationWarningObservation: {
          visibility: "NOT_DETECTED",
          legibility: "UNCERTAIN",
          detectedText: null,
          evidence: [],
        },
        rule: FIXTURE_WARNING_PRESENCE_RULE,
      });
      assert.equal(warningResult.verdict, "UNCERTAIN");
    });

    it("16. NOT_DETECTED never becomes PASS for barcode coverage", () => {
      const observation: ManufacturerBarcodeObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };

      const result = evaluateManufacturerBarcodeCoverage({
        manufacturerBarcodeObservation: observation,
        rule: FIXTURE_BARCODE_COVERAGE_RULE,
        ruleRequiresBarcodeCoverage: true,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "PASS");
    });

    it("17. placement enum names alone do not create compliance decisions", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00STEP5001",
        placement: "FLAT_SURFACE", // Enum name exists, but without explicit rule mapping it must not fabricate PASS
        placementDescription: "Centered on box face",
        evidence: [{ imageId: "label.jpg", description: "Flat surface placement" }],
      };

      // When called without explicit permitted placement mapping from rule:
      const result = evaluateFnskuPlacement({
        fnskuObservation: observation,
        rule: FIXTURE_PLACEMENT_RULE,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "RULE_UNAVAILABLE");
      assert.match(result.explanation, /Observation category alone/);
    });

    it("18. inactive rules cannot PASS/FAIL", () => {
      const supersededRule: AuthoritativePrepRule = {
        ...FIXTURE_POLYBAG_PRESENCE_RULE,
        status: "SUPERSEDED",
      };

      const result = evaluatePolybagPresence({
        workOrder: createTestWorkOrder(),
        polybagObservation: { visibility: "VISIBLE", sealStatus: "SEALED", evidence: [] },
        rule: supersededRule,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "RULE_UNAVAILABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.notEqual(result.verdict, "FAIL");
    });

    it("19. NOT_VISUALLY_VERIFIABLE cannot PASS/FAIL", () => {
      const nonVerifiableRule: AuthoritativePrepRule = {
        ...FIXTURE_POLYBAG_PRESENCE_RULE,
        verification: {
          ...FIXTURE_POLYBAG_PRESENCE_RULE.verification,
          visualVerifiability: "NOT_VISUALLY_VERIFIABLE",
        },
      };

      const result = evaluatePolybagPresence({
        workOrder: createTestWorkOrder(),
        polybagObservation: { visibility: "VISIBLE", sealStatus: "SEALED", evidence: [] },
        rule: nonVerifiableRule,
      });

      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "RULE_NOT_VISUALLY_VERIFIABLE");
      assert.notEqual(result.verdict, "PASS");
      assert.notEqual(result.verdict, "FAIL");
    });
  });

  describe("Rule Registry Infrastructure", () => {
    it("20. invalid rules cannot enter registry (strict Zod rejection)", () => {
      const registry = new RuleRegistry();
      const invalidRule = {
        ruleId: "", // Empty string violates min(1)
        checkType: "POLYBAG_PRESENCE",
        // Missing version, source, etc.
      };

      assert.throws(
        () => registry.registerRule(invalidRule),
        (err: unknown) => err instanceof Error
      );
    });

    it("21. unknown rule lookup returns no fabricated fallback (returns undefined)", () => {
      const registry = new RuleRegistry();
      const retrieved = registry.getRuleById("DOES-NOT-EXIST-999");
      assert.equal(retrieved, undefined);

      const activeCheckRule = registry.getActiveRuleForCheck("POLYBAG_PRESENCE");
      assert.equal(activeCheckRule, undefined);
    });

    it("22. registry does not dynamically execute rule contents", () => {
      const registry = new RuleRegistry();
      registry.registerRule(FIXTURE_POLYBAG_PRESENCE_RULE);

      const registered = registry.getRuleById(FIXTURE_POLYBAG_PRESENCE_RULE.ruleId);
      assert.ok(registered);
      // Ensure rule object is a plain, immutable data structure
      assert.equal(typeof registered, "object");
      assert.equal(typeof registered.title, "string");
      assert.equal(typeof registered.ruleId, "string");
      // Contains no function or executable hooks
      assert.equal(typeof (registered as Record<string, unknown>).execute, "undefined");
      assert.equal(typeof (registered as Record<string, unknown>).eval, "undefined");
    });
  });
});
