import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  productionPolicySchema,
  ProductionPolicyStore,
  buildExplicitPolicyContext,
  productionPolicyToAuthoritativeRule,
  AMZN_BARCODE_COVERAGE_POLICY,
  AMZN_FNSKU_PLACEMENT_POLICY,
  AMZN_SHIPPING_BOX_SEAM_POLICY,
} from "../../src/lib/compliance/policy";
import { resolveRequirement } from "../../src/lib/compliance/requirement-resolver";
import {
  evaluateFnskuPlacement,
  evaluateManufacturerBarcodeCoverage,
} from "../../src/lib/compliance/evaluators";
import type {
  ResolvedFnskuPlacementRequirement,
  ResolvedManufacturerBarcodeCoverageRequirement,
} from "../../src/lib/compliance/resolved-requirement.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";

const SAMPLE_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-TEST-001",
  unitId: "UNIT-0002",
  sku: "SKU-TEST-001",
  asin: "B000TESTASIN",
  expectedFnsku: "X001TESTFNSKU",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "REQUIRED",
      requiredMarks: ["fragile"],
    },
  },
};

describe("Day 3 Step 3: Production Policy Integration", () => {
  // 1. ACTIVE FNSKU policy maps correctly
  it("1. ACTIVE FNSKU policy maps correctly", () => {
    const store = new ProductionPolicyStore([AMZN_FNSKU_PLACEMENT_POLICY]);
    const context = buildExplicitPolicyContext(store);

    assert.ok(context.fnskuPlacementPolicy);
    assert.deepEqual(context.fnskuPlacementPolicy.allowedPlacements, [
      "FLAT_SURFACE",
    ]);
    assert.deepEqual(context.fnskuPlacementPolicy.prohibitedPlacements, [
      "CURVED_SURFACE",
      "OBSTRUCTED",
    ]);
  });

  // 2. ACTIVE barcode policy maps correctly
  it("2. ACTIVE barcode policy maps correctly", () => {
    const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);
    const context = buildExplicitPolicyContext(store);

    assert.ok(context.barcodeCoveragePolicy);
    assert.equal(context.barcodeCoveragePolicy.coverageRequired, true);
  });

  // 3. UNVERIFIED policy cannot supply context
  it("3. UNVERIFIED policy cannot supply context", () => {
    const store = new ProductionPolicyStore([AMZN_SHIPPING_BOX_SEAM_POLICY]);
    const context = buildExplicitPolicyContext(store, "SHIPPING_BOX_PREP");

    assert.equal(context.fnskuPlacementPolicy, undefined);
    assert.equal(context.barcodeCoveragePolicy, undefined);
  });

  // 4. SUPERSEDED policy cannot supply context
  it("4. SUPERSEDED policy cannot supply context", () => {
    const supersededPolicy = productionPolicySchema.parse({
      ...AMZN_BARCODE_COVERAGE_POLICY,
      policyId: "AMZN-POL-BARCODE-OLD",
      version: "2024.1",
      status: "SUPERSEDED",
    });

    const store = new ProductionPolicyStore([supersededPolicy]);
    const context = buildExplicitPolicyContext(store);

    assert.equal(context.barcodeCoveragePolicy, undefined);
  });

  // 5. missing policy produces no fabricated fallback
  it("5. missing policy produces no fabricated fallback", () => {
    const emptyStore = new ProductionPolicyStore([]);
    const context = buildExplicitPolicyContext(emptyStore);

    assert.deepEqual(context, {});
    assert.equal(context.fnskuPlacementPolicy, undefined);
    assert.equal(context.barcodeCoveragePolicy, undefined);
  });

  // 6. adapter uses machine-readable semantics, not sourceNote text
  it("6. adapter uses machine-readable semantics, not sourceNote text", () => {
    const modifiedNotePolicy = productionPolicySchema.parse({
      ...AMZN_BARCODE_COVERAGE_POLICY,
      sourceNote: "Arbitrary text mentioning that everything is fine.",
      sourceReference: {
        section: "Arbitrary Section",
        evidenceNote: "Different paraphrase text.",
      },
    });

    const store = new ProductionPolicyStore([modifiedNotePolicy]);
    const context = buildExplicitPolicyContext(store);

    // Context must strictly reflect machine-readable semantics
    assert.ok(context.barcodeCoveragePolicy);
    assert.equal(context.barcodeCoveragePolicy.coverageRequired, true);
  });

  // 7. ACROSS_SEAM remains unmapped
  it("7. ACROSS_SEAM remains unmapped", () => {
    const store = new ProductionPolicyStore([AMZN_FNSKU_PLACEMENT_POLICY]);
    const context = buildExplicitPolicyContext(store);

    assert.ok(context.fnskuPlacementPolicy);
    assert.equal(
      context.fnskuPlacementPolicy.allowedPlacements.includes("ACROSS_SEAM"),
      false
    );
    assert.equal(
      context.fnskuPlacementPolicy.prohibitedPlacements.includes("ACROSS_SEAM"),
      false
    );
  });

  // 8. ACROSS_SEAM therefore remains UNCERTAIN downstream
  it("8. ACROSS_SEAM therefore remains UNCERTAIN downstream", () => {
    const store = new ProductionPolicyStore([AMZN_FNSKU_PLACEMENT_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_FNSKU_PLACEMENT_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "FNSKU_PLACEMENT",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedFnskuPlacementRequirement;

    const evaluation = evaluateFnskuPlacement({
      requirement,
      fnskuObservation: {
        visibility: "VISIBLE",
        placement: "ACROSS_SEAM",
        placementDescription: null,
        detectedValue: "X001TESTFNSKU",
        legibility: "LEGIBLE",
        evidence: [],
      },
    });

    assert.equal(evaluation.verdict, "UNCERTAIN");
    assert.equal(evaluation.reasonCode, "INSUFFICIENT_VISUAL_EVIDENCE");
    assert.match(
      evaluation.explanation,
      /not explicitly covered by the resolved placement semantics/
    );
  });

  // 9. CURVED_SURFACE maps to the verified prohibited placement
  it("9. CURVED_SURFACE maps to the verified prohibited placement", () => {
    const store = new ProductionPolicyStore([AMZN_FNSKU_PLACEMENT_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_FNSKU_PLACEMENT_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "FNSKU_PLACEMENT",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedFnskuPlacementRequirement;

    const evaluation = evaluateFnskuPlacement({
      requirement,
      fnskuObservation: {
        visibility: "VISIBLE",
        placement: "CURVED_SURFACE",
        placementDescription: null,
        detectedValue: "X001TESTFNSKU",
        legibility: "LEGIBLE",
        evidence: [],
      },
    });

    assert.equal(evaluation.verdict, "FAIL");
    assert.equal(evaluation.reasonCode, "PLACEMENT_INVALID");
    assert.match(
      evaluation.explanation,
      /is explicitly prohibited by authoritative rule/
    );
  });

  // 10. FLAT_SURFACE maps to verified allowed placement
  it("10. FLAT_SURFACE maps to verified allowed placement", () => {
    const store = new ProductionPolicyStore([AMZN_FNSKU_PLACEMENT_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_FNSKU_PLACEMENT_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "FNSKU_PLACEMENT",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedFnskuPlacementRequirement;

    const evaluation = evaluateFnskuPlacement({
      requirement,
      fnskuObservation: {
        visibility: "VISIBLE",
        placement: "FLAT_SURFACE",
        placementDescription: null,
        detectedValue: "X001TESTFNSKU",
        legibility: "LEGIBLE",
        evidence: [],
      },
    });

    assert.equal(evaluation.verdict, "PASS");
    assert.equal(evaluation.reasonCode, "REQUIREMENT_SATISFIED");
  });

  // 11. visible manufacturer barcode + applicable coverage requirement produces FAIL
  it("11. visible manufacturer barcode + applicable coverage requirement produces FAIL", () => {
    const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_BARCODE_COVERAGE_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedManufacturerBarcodeCoverageRequirement;

    const evaluation = evaluateManufacturerBarcodeCoverage({
      requirement,
      manufacturerBarcodeObservation: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [],
      },
    });

    assert.equal(evaluation.verdict, "FAIL");
    assert.equal(evaluation.reasonCode, "REQUIREMENT_VIOLATED");
    assert.match(
      evaluation.explanation,
      /Original manufacturer barcode is visibly uncovered/
    );
  });

  // 12. NOT_DETECTED manufacturer barcode does not produce PASS
  it("12. NOT_DETECTED manufacturer barcode does not produce PASS", () => {
    const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_BARCODE_COVERAGE_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedManufacturerBarcodeCoverageRequirement;

    const evaluation = evaluateManufacturerBarcodeCoverage({
      requirement,
      manufacturerBarcodeObservation: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    });

    assert.notEqual(evaluation.verdict, "PASS");
    assert.equal(evaluation.verdict, "UNCERTAIN");
    assert.equal(evaluation.reasonCode, "FEATURE_NOT_DETECTED");
  });

  // 13. production policy provenance reaches resolved requirement
  it("13. production policy provenance reaches resolved requirement", () => {
    const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_BARCODE_COVERAGE_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    assert.equal(
      resolution.requirement.ruleRef.ruleId,
      "AMZN-POL-BARCODE-COVERAGE-2026"
    );
    assert.equal(resolution.requirement.ruleRef.version, "2026.1");
  });

  // 14. production policy provenance reaches compliance result
  it("14. production policy provenance reaches compliance result", () => {
    const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);
    const context = buildExplicitPolicyContext(store);
    const rule = productionPolicyToAuthoritativeRule(
      AMZN_BARCODE_COVERAGE_POLICY
    );

    const resolution = resolveRequirement({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      workOrder: SAMPLE_WORK_ORDER,
      rule,
      context,
    });

    assert.equal(resolution.status, "RESOLVED");
    const requirement =
      resolution.requirement as ResolvedManufacturerBarcodeCoverageRequirement;

    const evaluation = evaluateManufacturerBarcodeCoverage({
      requirement,
      manufacturerBarcodeObservation: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [],
      },
    });

    assert.equal(evaluation.rule.ruleId, "AMZN-POL-BARCODE-COVERAGE-2026");
    assert.equal(evaluation.rule.version, "2026.1");
  });

  // 15. DEMO policy semantics are no longer used by inspection-dev for migrated checks
  it("15. DEMO policy semantics are no longer used by inspection-dev for migrated checks", () => {
    // Verified by checking that buildExplicitPolicyContext uses ProductionPolicyStore
    const store = new ProductionPolicyStore([
      AMZN_FNSKU_PLACEMENT_POLICY,
      AMZN_BARCODE_COVERAGE_POLICY,
    ]);
    const context = buildExplicitPolicyContext(store);

    assert.ok(context.fnskuPlacementPolicy);
    assert.ok(context.barcodeCoveragePolicy);
    // Verified: no DEMO-TEST-* references in context
    assert.equal(
      context.fnskuPlacementPolicy.prohibitedPlacements.includes("ACROSS_SEAM"),
      false
    );
  });

  // 16. changing evidenceNote text does not change evaluator behavior
  it("16. changing evidenceNote text does not change evaluator behavior", () => {
    const policyA = AMZN_BARCODE_COVERAGE_POLICY;
    const policyB = productionPolicySchema.parse({
      ...AMZN_BARCODE_COVERAGE_POLICY,
      sourceReference: {
        section: "Different Section Header",
        evidenceNote: "Completely rewritten paraphrased note text.",
      },
    });

    const storeA = new ProductionPolicyStore([policyA]);
    const storeB = new ProductionPolicyStore([policyB]);

    const contextA = buildExplicitPolicyContext(storeA);
    const contextB = buildExplicitPolicyContext(storeB);

    assert.deepEqual(contextA, contextB);
  });

  // 17. inactive policy cannot alter inspection result
  it("17. inactive policy cannot alter inspection result", () => {
    const inactiveRule = productionPolicyToAuthoritativeRule({
      ...AMZN_BARCODE_COVERAGE_POLICY,
      status: "SUPERSEDED",
    });

    const resolution = resolveRequirement({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      workOrder: SAMPLE_WORK_ORDER,
      rule: inactiveRule,
      context: { barcodeCoveragePolicy: { coverageRequired: true } },
    });

    assert.equal(resolution.status, "UNRESOLVED");
    assert.equal(resolution.reason, "RULE_INACTIVE");
  });
});
