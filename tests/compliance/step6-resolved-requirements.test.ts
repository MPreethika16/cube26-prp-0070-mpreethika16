import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";
import type {
  FnskuObservation,
  ManufacturerBarcodeObservation,
} from "../../src/lib/vision/prep-observation.schema";
import {
  resolveRequirement,
  type ExplicitPolicyResolutionContext,
} from "../../src/lib/compliance/requirement-resolver";
import {
  resolvedRequirementSchema,
  type PolicyPlacementSurface,
  type ResolvedFnskuPlacementRequirement,
  type ResolvedManufacturerBarcodeCoverageRequirement,
} from "../../src/lib/compliance/resolved-requirement.schema";
import {
  evaluateFnskuPlacement,
  evaluateManufacturerBarcodeCoverage,
} from "../../src/lib/compliance/evaluators";
import { complianceCheckResultSchema } from "../../src/lib/compliance/compliance-result.schema";
import { defaultRuleRegistry } from "../../src/lib/compliance/rules/registry";

/**
 * Synthetic test fixtures for Step 6 test suite.
 */
const FIXTURE_POLYBAG_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-POLYBAG-001",
  version: "2026.1",
  checkType: "POLYBAG_PRESENCE",
  title: "Test Fixture: Polybag Requirement",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-polybag",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Arbitrary text that should never be parsed for policy",
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

const FIXTURE_PLACEMENT_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-PLACEMENT-002",
  version: "2026.2",
  checkType: "FNSKU_PLACEMENT",
  title: "Test Fixture: Flat surface placement policy",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-placement-2",
    retrievedAt: "2026-03-01T00:00:00.000Z",
    sourceNote: "Flat surfaces only; never parse this text dynamically",
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

const FIXTURE_BARCODE_RULE: AuthoritativePrepRule = {
  ruleId: "TEST-FIXTURE-BARCODE-003",
  version: "2026.3",
  checkType: "MANUFACTURER_BARCODE_COVERAGE",
  title: "Test Fixture: Barcode Coverage Policy",
  source: {
    publisher: "Test Suite Environment",
    url: "https://example.com/test-fixture-barcode-3",
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

function createBaseWorkOrder(overrides?: Partial<WorkOrderSpecification>): WorkOrderSpecification {
  return {
    workOrderId: "WO-STEP6-001",
    unitId: "UNIT-STEP6-001",
    sku: "SKU-STEP6-001",
    asin: "B00STEP601",
    expectedFnsku: "X00STEP6001",
    requirements: {
      polybag: "REQUIRED",
      suffocationWarning: "REQUIRED",
      expiryDate: "REQUIRED",
      handlingMarks: {
        state: "REQUIRED",
        requiredMarks: ["fragile", "this_way_up"],
      },
    },
    ...overrides,
  };
}

describe("Day 2 / Step 6: Resolved Requirement Layer", () => {
  describe("Requirement Resolver", () => {
    it("1. REQUIRED polybag resolves APPLICABLE", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const res = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder,
        rule: FIXTURE_POLYBAG_RULE,
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED") {
        assert.equal(res.requirement.checkType, "POLYBAG_PRESENCE");
        assert.equal(res.requirement.applicability, "APPLICABLE");
        assert.equal(res.requirement.ruleRef.ruleId, FIXTURE_POLYBAG_RULE.ruleId);
      }
    });

    it("2. NOT_REQUIRED polybag resolves NOT_APPLICABLE", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "NOT_REQUIRED",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const res = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder,
        rule: FIXTURE_POLYBAG_RULE,
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED") {
        assert.equal(res.requirement.applicability, "NOT_APPLICABLE");
      }
    });

    it("3. UNKNOWN work-order requirement does not silently resolve false (resolves UNKNOWN)", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "UNKNOWN",
          suffocationWarning: "NOT_REQUIRED",
          expiryDate: "NOT_REQUIRED",
          handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
        },
      });

      const res = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder,
        rule: FIXTURE_POLYBAG_RULE,
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED") {
        assert.equal(res.requirement.applicability, "UNKNOWN");
        assert.notEqual(res.requirement.applicability, "NOT_APPLICABLE");
      }
    });

    it("4. handling marks preserve required mark list", () => {
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

      const res = resolveRequirement({
        checkType: "HANDLING_MARKS",
        workOrder,
        rule: {
          ...FIXTURE_POLYBAG_RULE,
          checkType: "HANDLING_MARKS",
          ruleId: "TEST-HANDLING-RULE",
        },
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED" && res.requirement.checkType === "HANDLING_MARKS") {
        assert.equal(res.requirement.applicability, "APPLICABLE");
        assert.deepEqual(res.requirement.requiredMarks, ["fragile", "this_way_up"]);
      }
    });

    it("5. missing rule returns structured unresolved result (RULE_NOT_FOUND)", () => {
      const workOrder = createBaseWorkOrder();
      const res = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder,
        // @ts-expect-error Testing runtime missing rule
        rule: undefined,
      });

      assert.equal(res.status, "UNRESOLVED");
      if (res.status === "UNRESOLVED") {
        assert.equal(res.reason, "RULE_NOT_FOUND");
        assert.match(res.explanation, /No authoritative rule/);
      }
    });

    it("6. inactive rule cannot resolve an active requirement (RULE_INACTIVE)", () => {
      const inactiveRule: AuthoritativePrepRule = {
        ...FIXTURE_POLYBAG_RULE,
        status: "SUPERSEDED",
      };

      const res = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder: createBaseWorkOrder(),
        rule: inactiveRule,
      });

      assert.equal(res.status, "UNRESOLVED");
      if (res.status === "UNRESOLVED") {
        assert.equal(res.reason, "RULE_INACTIVE");
        assert.equal(res.ruleRef?.ruleId, inactiveRule.ruleId);
      }
    });

    it("7. FNSKU policy context produces typed resolved requirement", () => {
      const context: ExplicitPolicyResolutionContext = {
        fnskuPlacementPolicy: {
          allowedPlacements: ["FLAT_SURFACE"],
          prohibitedPlacements: ["ACROSS_SEAM", "OBSTRUCTED"],
        },
      };

      const res = resolveRequirement({
        checkType: "FNSKU_PLACEMENT",
        workOrder: createBaseWorkOrder(),
        rule: FIXTURE_PLACEMENT_RULE,
        context,
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED" && res.requirement.checkType === "FNSKU_PLACEMENT") {
        assert.equal(res.requirement.applicability, "APPLICABLE");
        assert.deepEqual(res.requirement.allowedPlacements, ["FLAT_SURFACE"]);
        assert.deepEqual(res.requirement.prohibitedPlacements, ["ACROSS_SEAM", "OBSTRUCTED"]);
      }
    });

    it("8. missing FNSKU policy semantics returns UNRESOLVED (INSUFFICIENT_POLICY_SEMANTICS)", () => {
      // No context provided: resolver must NOT guess semantics
      const res = resolveRequirement({
        checkType: "FNSKU_PLACEMENT",
        workOrder: createBaseWorkOrder(),
        rule: FIXTURE_PLACEMENT_RULE,
      });

      assert.equal(res.status, "UNRESOLVED");
      if (res.status === "UNRESOLVED") {
        assert.equal(res.reason, "INSUFFICIENT_POLICY_SEMANTICS");
      }
    });

    it("9. barcode coverage policy true resolves correctly", () => {
      const context: ExplicitPolicyResolutionContext = {
        barcodeCoveragePolicy: {
          coverageRequired: true,
        },
      };

      const res = resolveRequirement({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        workOrder: createBaseWorkOrder(),
        rule: FIXTURE_BARCODE_RULE,
        context,
      });

      assert.equal(res.status, "RESOLVED");
      if (res.status === "RESOLVED" && res.requirement.checkType === "MANUFACTURER_BARCODE_COVERAGE") {
        assert.equal(res.requirement.applicability, "APPLICABLE");
        assert.equal(res.requirement.coverageRequired, true);
        assert.equal(res.requirement.ruleRef.ruleId, FIXTURE_BARCODE_RULE.ruleId);
      }
    });

    it("10. missing barcode policy semantics returns UNRESOLVED (INSUFFICIENT_POLICY_SEMANTICS)", () => {
      const res = resolveRequirement({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        workOrder: createBaseWorkOrder(),
        rule: FIXTURE_BARCODE_RULE,
      });

      assert.equal(res.status, "UNRESOLVED");
      if (res.status === "UNRESOLVED") {
        assert.equal(res.reason, "INSUFFICIENT_POLICY_SEMANTICS");
      }
    });
  });

  describe("Updated Evaluators consuming ResolvedRequirement", () => {
    const resolvedPlacementReq: ResolvedFnskuPlacementRequirement = {
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      allowedPlacements: ["FLAT_SURFACE"],
      prohibitedPlacements: ["ACROSS_SEAM", "OBSTRUCTED"],
      ruleRef: {
        ruleId: FIXTURE_PLACEMENT_RULE.ruleId,
        version: FIXTURE_PLACEMENT_RULE.version,
      },
    };

    it("11. allowed FNSKU placement -> PASS", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00STEP6001",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat box face",
        evidence: [{ imageId: "label.jpg", description: "Flat face sticker" }],
      };

      const result = evaluateFnskuPlacement({
        requirement: resolvedPlacementReq,
        fnskuObservation: observation,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "PASS");
      assert.equal(result.reasonCode, "REQUIREMENT_SATISFIED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("12. prohibited FNSKU placement -> FAIL with PLACEMENT_INVALID", () => {
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00STEP6001",
        placement: "ACROSS_SEAM",
        placementDescription: "Folded over carton opening seam",
        evidence: [{ imageId: "label.jpg", description: "Label placed across seam" }],
      };

      const result = evaluateFnskuPlacement({
        requirement: resolvedPlacementReq,
        fnskuObservation: observation,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "FAIL");
      assert.equal(result.reasonCode, "PLACEMENT_INVALID");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("13. placement not covered by resolved semantics -> UNCERTAIN", () => {
      // CURVED_SURFACE is neither in allowedPlacements nor in prohibitedPlacements
      const observation: FnskuObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00STEP6001",
        placement: "CURVED_SURFACE",
        placementDescription: "On cylinder side",
        evidence: [{ imageId: "label.jpg", description: "Curved surface" }],
      };

      const result = evaluateFnskuPlacement({
        requirement: resolvedPlacementReq,
        fnskuObservation: observation,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
      assert.notEqual(result.verdict, "PASS");
      assert.notEqual(result.verdict, "FAIL");
    });

    const resolvedBarcodeReq: ResolvedManufacturerBarcodeCoverageRequirement = {
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "APPLICABLE",
      coverageRequired: true,
      ruleRef: {
        ruleId: FIXTURE_BARCODE_RULE.ruleId,
        version: FIXTURE_BARCODE_RULE.version,
      },
    };

    it("14. barcode visible when coverage required -> FAIL", () => {
      const observation: ManufacturerBarcodeObservation = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "UPC-123456789012",
        evidence: [{ imageId: "back.jpg", description: "UPC barcode clearly uncovered" }],
      };

      const result = evaluateManufacturerBarcodeCoverage({
        requirement: resolvedBarcodeReq,
        manufacturerBarcodeObservation: observation,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "FAIL");
      assert.equal(result.reasonCode, "REQUIREMENT_VIOLATED");
      assert.doesNotThrow(() => complianceCheckResultSchema.parse(result));
    });

    it("15. barcode NOT_DETECTED when coverage required -> UNCERTAIN (never PASS)", () => {
      const observation: ManufacturerBarcodeObservation = {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };

      const result = evaluateManufacturerBarcodeCoverage({
        requirement: resolvedBarcodeReq,
        manufacturerBarcodeObservation: observation,
      });

      assert.equal(result.applicability, "APPLICABLE");
      assert.equal(result.verdict, "UNCERTAIN");
      assert.equal(result.reasonCode, "FEATURE_NOT_DETECTED");
      assert.notEqual(result.verdict, "PASS");
    });
  });

  describe("Provenance, Traceability, & Safety Guardrails", () => {
    it("16. ruleRef survives resolution and evaluation unchanged", () => {
      // 1. Start with AuthoritativePrepRule
      const rule = FIXTURE_PLACEMENT_RULE;

      // 2. Resolve requirement
      const resolution = resolveRequirement({
        checkType: "FNSKU_PLACEMENT",
        workOrder: createBaseWorkOrder(),
        rule,
        context: {
          fnskuPlacementPolicy: {
            allowedPlacements: ["FLAT_SURFACE"],
            prohibitedPlacements: ["ACROSS_SEAM"],
          },
        },
      });

      assert.equal(resolution.status, "RESOLVED");
      if (resolution.status !== "RESOLVED") return;

      assert.equal(resolution.requirement.ruleRef.ruleId, rule.ruleId);
      assert.equal(resolution.requirement.ruleRef.version, rule.version);

      // 3. Evaluate
      const evalResult = evaluateFnskuPlacement({
        requirement: resolution.requirement as ResolvedFnskuPlacementRequirement,
        fnskuObservation: {
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedValue: "X001",
          placement: "FLAT_SURFACE",
          placementDescription: null,
          evidence: [],
        },
      });

      // 4. Verify identical ruleRef in final ComplianceCheckResult
      assert.equal(evalResult.rule.ruleId, rule.ruleId);
      assert.equal(evalResult.rule.version, rule.version);
    });

    it("17. no evaluator derives policy from title/sourceNote/URL", () => {
      // Craft a rule with misleading title and sourceNote
      const ruleWithMisleadingText: AuthoritativePrepRule = {
        ...FIXTURE_PLACEMENT_RULE,
        title: "All placements are totally acceptable and shall pass always",
        source: {
          ...FIXTURE_PLACEMENT_RULE.source,
          sourceNote: "CURVED_SURFACE is great and should pass",
        },
      };

      // Without explicit policy context, resolution returns UNRESOLVED
      const resolution = resolveRequirement({
        checkType: "FNSKU_PLACEMENT",
        workOrder: createBaseWorkOrder(),
        rule: ruleWithMisleadingText,
      });

      assert.equal(resolution.status, "UNRESOLVED");
      if (resolution.status === "UNRESOLVED") {
        assert.equal(resolution.reason, "INSUFFICIENT_POLICY_SEMANTICS");
      }
    });

    it("18. ResolvedRequirement rejects invalid placement vocabulary (e.g. UNCERTAIN as policy surface)", () => {
      assert.throws(() => {
        resolvedRequirementSchema.parse({
          checkType: "FNSKU_PLACEMENT",
          applicability: "APPLICABLE",
          allowedPlacements: ["UNCERTAIN" as unknown as PolicyPlacementSurface],
          prohibitedPlacements: [],
          ruleRef: { ruleId: "R1", version: "1" },
        });
      });
    });

    it("19. UNKNOWN is never silently converted to NOT_APPLICABLE", () => {
      const workOrder = createBaseWorkOrder({
        requirements: {
          polybag: "UNKNOWN",
          suffocationWarning: "UNKNOWN",
          expiryDate: "UNKNOWN",
          handlingMarks: { state: "UNKNOWN", requiredMarks: [] },
        },
      });

      const polybagRes = resolveRequirement({
        checkType: "POLYBAG_PRESENCE",
        workOrder,
        rule: FIXTURE_POLYBAG_RULE,
      });

      assert.equal(polybagRes.status, "RESOLVED");
      if (polybagRes.status === "RESOLVED") {
        assert.equal(polybagRes.requirement.applicability, "UNKNOWN");
        assert.notEqual(polybagRes.requirement.applicability, "NOT_APPLICABLE");
      }
    });

    it("20. no production policy semantics are fabricated", () => {
      // Default production registry contains zero fabricated policies
      const defaultRules = defaultRuleRegistry.listRules();
      assert.equal(defaultRules.length, 0);
    });
  });
});
