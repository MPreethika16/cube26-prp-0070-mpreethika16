import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
import { parseWorkOrderFromCsvRow } from "../../src/lib/compliance/work-order.schema";
import type { AuthoritativePrepRule } from "../../src/lib/compliance/authoritative-rule.schema";
import {
  runPrepInspection,
  UnitIdentityMismatchError,
  SUPPORTED_INSPECTION_CHECKS,
} from "../../src/lib/inspection/run-prep-inspection";
import { prepInspectionRecordSchema } from "../../src/lib/inspection/prep-inspection.schema";
import { RuleRegistry } from "../../src/lib/compliance/rules/registry";

/**
 * Synthetic TEST FIXTURES for all 10 check types.
 * Strictly for unit test suite execution; do not represent real Amazon policies.
 */
function createTestRule(
  checkType: AuthoritativePrepRule["checkType"],
  ruleId: string,
  overrides?: Partial<AuthoritativePrepRule>
): AuthoritativePrepRule {
  return {
    ruleId,
    version: "2026.1",
    checkType,
    title: `Test Rule for ${checkType}`,
    source: {
      publisher: "Test Environment",
      url: `https://example.com/rules/${ruleId.toLowerCase()}`,
      retrievedAt: "2026-03-01T00:00:00.000Z",
    },
    applicability: {
      source: "TEST_SPEC",
      requiredInputs: [`${checkType}.input`],
    },
    verification: {
      requiredObservationFields: [`${checkType}.obs`],
      visualVerifiability: "FULL",
    },
    status: "ACTIVE",
    ...overrides,
  };
}

const TEST_RULES: AuthoritativePrepRule[] = [
  createTestRule("FNSKU_IDENTITY", "RULE-TEST-FNSKU-ID"),
  createTestRule("POLYBAG_PRESENCE", "RULE-TEST-POLY-PRES"),
  createTestRule("POLYBAG_SEAL", "RULE-TEST-POLY-SEAL"),
  createTestRule("SUFFOCATION_WARNING_PRESENCE", "RULE-TEST-WARN-PRES"),
  createTestRule("SUFFOCATION_WARNING_LEGIBILITY", "RULE-TEST-WARN-LEG"),
  createTestRule("MANUFACTURER_BARCODE_COVERAGE", "RULE-TEST-BARCODE-COV"),
  createTestRule("EXPIRY_VISIBILITY", "RULE-TEST-EXP-VIS"),
  createTestRule("EXPIRY_LEGIBILITY", "RULE-TEST-EXP-LEG"),
  createTestRule("HANDLING_MARKS", "RULE-TEST-HANDLING"),
  createTestRule("FNSKU_PLACEMENT", "RULE-TEST-FNSKU-PLACE"),
];

const TEST_POLICY_CONTEXT = {
  fnskuPlacementPolicy: {
    allowedPlacements: ["FLAT_SURFACE"] as const,
    prohibitedPlacements: ["ACROSS_SEAM", "OBSTRUCTED"] as const,
  },
  barcodeCoveragePolicy: {
    coverageRequired: true,
  },
};

/**
 * Deterministic visual observation object corresponding to UNIT-0002.
 */
const OBSERVATION_UNIT_0002: PrepUnitObservation = {
  unitId: "UNIT-0002",
  imageQuality: {
    overall: "GOOD",
    issues: [],
  },
  polybag: {
    visibility: "NOT_DETECTED",
    sealStatus: "UNCERTAIN",
    evidence: [],
  },
  suffocationWarning: {
    visibility: "NOT_DETECTED",
    legibility: "UNCERTAIN",
    detectedText: null,
    evidence: [],
  },
  fnsku: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    valueCompleteness: "COMPLETE",
    detectedValue: "X00DUMMY002",
    placement: "ACROSS_SEAM",
    placementDescription: "Affixed across carton opening seam",
    evidence: [{ imageId: "label", description: "FNSKU barcode visible across seam" }],
  },
  manufacturerBarcode: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    detectedValue: "UPC-789012345678",
    evidence: [{ imageId: "back", description: "UPC barcode uncovered on carton back" }],
  },
  expiryDate: {
    visibility: "NOT_DETECTED",
    legibility: "UNCERTAIN",
    detectedValue: null,
    evidence: [],
  },
  handlingMarks: [
    {
      detectedType: "fragile",
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedText: "FRAGILE",
      evidence: [{ imageId: "front", description: "Fragile wine glass icon visible" }],
    },
  ],
  otherVisibleIssues: [],
};

/**
 * Raw CSV record from data/prep_sample.csv for UNIT-0002.
 */
const CSV_ROW_UNIT_0002 = {
  record_id: "PRP-0002",
  unit_id: "UNIT-0002",
  org_id: "org_demo_alpha",
  work_order_id: "WO-3000",
  fba_shipment_id: "FBA-DUMMY-100",
  sku: "SKU-CANDLE-3",
  asin: "B0DUMMY964",
  fnsku: "X00DUMMY002",
  prep_price_usd: "0.40",
  wo_polybag: "False",
  wo_suffocation_warning: "False",
  wo_expiry_date: "False",
  wo_handling_marks: "fragile",
  polybag_present_sealed: "not_required",
  suffocation_warning: "not_required",
  fnsku_label_placement: "on_seam",
  original_barcode_covered: "yes",
  expiry_date: "not_required",
  handling_marks: "all_present",
};

/**
 * Deterministic visual observation object for a synthetic polybag unit.
 * Contains visible packaging damage in otherVisibleIssues.
 */
const OBSERVATION_SYNTHETIC_POLYBAG: PrepUnitObservation = {
  unitId: "SYNTHETIC-POLYBAG",
  imageQuality: {
    overall: "DEGRADED",
    issues: ["Slight glare on label"],
  },
  polybag: {
    visibility: "VISIBLE",
    sealStatus: "NOT_SEALED",
    evidence: [{ imageId: "front", description: "Polybag open at top flap" }],
  },
  suffocationWarning: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    detectedText: "WARNING: Keep away from small children",
    evidence: [{ imageId: "front", description: "Clear printed warning" }],
  },
  fnsku: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    valueCompleteness: "COMPLETE",
    detectedValue: "X00DUMMY003",
    placement: "FLAT_SURFACE",
    placementDescription: "Flat back face",
    evidence: [{ imageId: "label", description: "FNSKU barcode centered" }],
  },
  manufacturerBarcode: {
    visibility: "NOT_DETECTED",
    legibility: "UNCERTAIN",
    detectedValue: null,
    evidence: [],
  },
  expiryDate: {
    visibility: "NOT_DETECTED",
    legibility: "UNCERTAIN",
    detectedValue: null,
    evidence: [],
  },
  handlingMarks: [],
  otherVisibleIssues: ["Cardboard box has crushed corner on front edge"],
};

const CSV_ROW_SYNTHETIC_POLYBAG = {
  record_id: "PRP-0003",
  unit_id: "SYNTHETIC-POLYBAG",
  org_id: "org_demo_bravo",
  work_order_id: "WO-3000",
  fba_shipment_id: "FBA-DUMMY-100",
  sku: "SKU-PUZZLE-500",
  asin: "B0DUMMY729",
  fnsku: "X00DUMMY003",
  prep_price_usd: "0.90",
  wo_polybag: "True",
  wo_suffocation_warning: "True",
  wo_expiry_date: "False",
  wo_handling_marks: "",
};

describe("Day 2 / Step 7: Inspection Orchestrator", () => {
  it("1. valid unit produces inspection record", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    assert.ok(record.inspectionId);
    assert.equal(record.unitId, "UNIT-0002");
    assert.equal(record.workOrderId, "WO-3000");
    assert.equal(record.sku, "SKU-CANDLE-3");
    assert.equal(record.asin, "B0DUMMY964");
    assert.equal(record.checks.length, 10);
  });

  it("2. observation/work-order unit mismatch is rejected", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002); // unitId is UNIT-0002
    const mismatchedObservation: PrepUnitObservation = {
      ...OBSERVATION_UNIT_0002,
      unitId: "UNIT-DIFFERENT-9999",
    };

    assert.throws(
      () =>
        runPrepInspection({
          observation: mismatchedObservation,
          workOrder,
          rules: TEST_RULES,
        }),
      (err: unknown) => {
        assert.ok(err instanceof UnitIdentityMismatchError);
        assert.match(err.message, /Unit identity mismatch/);
        return true;
      }
    );
  });

  it("3. all supported check types appear exactly once", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    const checkTypes = record.checks.map((c) => c.checkType);
    assert.equal(checkTypes.length, SUPPORTED_INSPECTION_CHECKS.length);

    for (const expectedType of SUPPORTED_INSPECTION_CHECKS) {
      const occurrences = checkTypes.filter((t) => t === expectedType).length;
      assert.equal(occurrences, 1, `Check ${expectedType} must appear exactly once`);
    }
  });

  it("4. unresolved rule affects only that check", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);

    // Omit the rule for POLYBAG_SEAL
    const rulesMissingOne = TEST_RULES.filter((r) => r.checkType !== "POLYBAG_SEAL");

    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: rulesMissingOne,
      policyContext: TEST_POLICY_CONTEXT,
    });

    const sealCheck = record.checks.find((c) => c.checkType === "POLYBAG_SEAL");
    assert.ok(sealCheck);
    assert.equal(sealCheck.verdict, "UNCERTAIN");
    assert.equal(sealCheck.reasonCode, "RULE_UNAVAILABLE");

    // Other checks remain normally evaluated
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    assert.ok(fnskuCheck);
    assert.equal(fnskuCheck.verdict, "PASS");
  });

  it("5. unresolved check does not crash entire inspection", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);

    // Provide an empty rule registry
    const emptyRegistry = new RuleRegistry([]);

    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: emptyRegistry,
    });

    assert.equal(record.checks.length, 10);
    // All 10 checks safely return UNCERTAIN with RULE_UNAVAILABLE
    for (const check of record.checks) {
      assert.equal(check.verdict, "UNCERTAIN");
      assert.equal(check.reasonCode, "RULE_UNAVAILABLE");
    }
  });

  it("6. NOT_APPLICABLE remains verdict null", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    // In UNIT-0002, wo_polybag is False, wo_expiry_date is False
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    const polyPresence = record.checks.find((c) => c.checkType === "POLYBAG_PRESENCE");
    assert.ok(polyPresence);
    assert.equal(polyPresence.applicability, "NOT_APPLICABLE");
    assert.equal(polyPresence.verdict, null);
    assert.equal(polyPresence.reasonCode, "NOT_APPLICABLE");

    const expiryVis = record.checks.find((c) => c.checkType === "EXPIRY_VISIBILITY");
    assert.ok(expiryVis);
    assert.equal(expiryVis.applicability, "NOT_APPLICABLE");
    assert.equal(expiryVis.verdict, null);
    assert.equal(expiryVis.reasonCode, "NOT_APPLICABLE");
  });

  it("7. NOT_DETECTED remains conservative", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_SYNTHETIC_POLYBAG);
    // In synthetic polybag fixture, manufacturer barcode is NOT_DETECTED, coverageRequired is true
    const record = runPrepInspection({
      observation: OBSERVATION_SYNTHETIC_POLYBAG,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    const barcodeCheck = record.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE");
    assert.ok(barcodeCheck);
    assert.equal(barcodeCheck.verdict, "UNCERTAIN");
    assert.equal(barcodeCheck.reasonCode, "FEATURE_NOT_DETECTED");
    assert.notEqual(barcodeCheck.verdict, "PASS");
  });

  it("8. positive contradictory evidence can produce FAIL", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    // In UNIT-0002, FNSKU placement is ACROSS_SEAM, prohibited by policy
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    const placementCheck = record.checks.find((c) => c.checkType === "FNSKU_PLACEMENT");
    assert.ok(placementCheck);
    assert.equal(placementCheck.verdict, "FAIL");
    assert.equal(placementCheck.reasonCode, "PLACEMENT_INVALID");

    // Also manufacturer barcode is VISIBLE when coverage required -> FAIL
    const barcodeCheck = record.checks.find((c) => c.checkType === "MANUFACTURER_BARCODE_COVERAGE");
    assert.ok(barcodeCheck);
    assert.equal(barcodeCheck.verdict, "FAIL");
    assert.equal(barcodeCheck.reasonCode, "REQUIREMENT_VIOLATED");
  });

  it("9. rule provenance survives into final inspection record", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    for (const check of record.checks) {
      assert.ok(check.rule.ruleId);
      assert.ok(check.rule.version);
      // Ensure ruleId matches the registered test rule for this check
      const expectedRule = TEST_RULES.find((r) => r.checkType === check.checkType);
      assert.equal(check.rule.ruleId, expectedRule?.ruleId);
      assert.equal(check.rule.version, expectedRule?.version);
    }
  });

  it("10. image quality is preserved (DEGRADED does not force FAIL)", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_SYNTHETIC_POLYBAG);
    const record = runPrepInspection({
      observation: OBSERVATION_SYNTHETIC_POLYBAG,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    // Image quality DEGRADED is preserved
    assert.equal(record.imageQuality.overall, "DEGRADED");
    assert.deepEqual(record.imageQuality.issues, ["Slight glare on label"]);

    // Legible checks still pass despite degraded quality
    const fnskuCheck = record.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    assert.ok(fnskuCheck);
    assert.equal(fnskuCheck.verdict, "PASS");
  });

  it("11. vision metadata is preserved", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
      metadata: {
        inspectionId: "INSP-CUSTOM-0002",
        inspectedAt: "2026-06-04T12:26:00.000Z",
        visionModel: "gemini-2.5-flash",
        visionRequestCount: 1,
      },
    });

    assert.equal(record.inspectionId, "INSP-CUSTOM-0002");
    assert.equal(record.metadata.inspectedAt, "2026-06-04T12:26:00.000Z");
    assert.equal(record.metadata.visionModel, "gemini-2.5-flash");
    assert.equal(record.metadata.visionRequestCount, 1);
  });

  it("12. no Gemini/API call occurs in orchestrator", () => {
    // Calling runPrepInspection without process.env.GEMINI_API_KEY must succeed deterministically
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
      const record = runPrepInspection({
        observation: OBSERVATION_UNIT_0002,
        workOrder,
        rules: TEST_RULES,
        policyContext: TEST_POLICY_CONTEXT,
      });

      assert.ok(record);
      assert.equal(record.checks.length, 10);
    } finally {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it("13. UNIT-0002 synthetic vertical slice validates successfully (SYNTHETIC compliance scenario)", () => {
    // Note: Uses deterministic synthetic observation object OBSERVATION_UNIT_0002 to test compliance logic in isolation
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    // Validate entire record against Zod schema
    const validated = prepInspectionRecordSchema.parse(record);
    assert.equal(validated.unitId, "UNIT-0002");
    assert.equal(validated.sku, "SKU-CANDLE-3");

    // Breakdown of verdicts for UNIT-0002:
    // FNSKU_IDENTITY: PASS
    // POLYBAG_PRESENCE: NOT_APPLICABLE (verdict null)
    // POLYBAG_SEAL: NOT_APPLICABLE (verdict null)
    // SUFFOCATION_WARNING_PRESENCE: NOT_APPLICABLE (verdict null)
    // SUFFOCATION_WARNING_LEGIBILITY: NOT_APPLICABLE (verdict null)
    // MANUFACTURER_BARCODE_COVERAGE: FAIL (uncovered barcode)
    // EXPIRY_VISIBILITY: NOT_APPLICABLE (verdict null)
    // EXPIRY_LEGIBILITY: NOT_APPLICABLE (verdict null)
    // HANDLING_MARKS: PASS ("fragile" required and detected)
    // FNSKU_PLACEMENT: FAIL (ACROSS_SEAM is prohibited)

    const passes = record.checks.filter((c) => c.verdict === "PASS");
    const fails = record.checks.filter((c) => c.verdict === "FAIL");
    const notApplicables = record.checks.filter((c) => c.applicability === "NOT_APPLICABLE");
    const uncertains = record.checks.filter((c) => c.verdict === "UNCERTAIN");

    assert.equal(passes.length, 2, "2 PASS checks (FNSKU_IDENTITY, HANDLING_MARKS)");
    assert.equal(fails.length, 2, "2 FAIL checks (MANUFACTURER_BARCODE_COVERAGE, FNSKU_PLACEMENT)");
    assert.equal(notApplicables.length, 6, "6 NOT_APPLICABLE checks (Polybag x2, Warning x2, Expiry x2)");
    assert.equal(uncertains.length, 0, "0 UNCERTAIN checks");
  });

  it("14. unrelated otherVisibleIssues do not generate invented compliance failures", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_SYNTHETIC_POLYBAG);
    const record = runPrepInspection({
      observation: OBSERVATION_SYNTHETIC_POLYBAG, // has otherVisibleIssues: ["Cardboard box has crushed corner"]
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    // FNSKU is on flat surface -> PASS (not failed by crushed corner)
    const fnskuPlacement = record.checks.find((c) => c.checkType === "FNSKU_PLACEMENT");
    assert.ok(fnskuPlacement);
    assert.equal(fnskuPlacement.verdict, "PASS");

    // Suffocation warning is visible & legible -> PASS
    const warningLeg = record.checks.find((c) => c.checkType === "SUFFOCATION_WARNING_LEGIBILITY");
    assert.ok(warningLeg);
    assert.equal(warningLeg.verdict, "PASS");

    // Polybag seal is NOT_SEALED -> FAIL (failed because of sealStatus, not packaging dent)
    const sealCheck = record.checks.find((c) => c.checkType === "POLYBAG_SEAL");
    assert.ok(sealCheck);
    assert.equal(sealCheck.verdict, "FAIL");
    assert.equal(sealCheck.reasonCode, "REQUIREMENT_VIOLATED");
  });

  it("15. final inspection record passes its Zod schema", () => {
    const workOrder = parseWorkOrderFromCsvRow(CSV_ROW_UNIT_0002);
    const record = runPrepInspection({
      observation: OBSERVATION_UNIT_0002,
      workOrder,
      rules: TEST_RULES,
      policyContext: TEST_POLICY_CONTEXT,
    });

    assert.doesNotThrow(() => prepInspectionRecordSchema.parse(record));
  });
});
