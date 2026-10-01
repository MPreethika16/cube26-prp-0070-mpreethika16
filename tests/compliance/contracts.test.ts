import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRequirementFlag,
  parseHandlingMarksRequirement,
  parseWorkOrderFromCsvRow,
  workOrderSpecificationSchema,
} from "../../src/lib/compliance/work-order.schema";
import {
  authoritativePrepRuleSchema,
  type AuthoritativePrepRule,
} from "../../src/lib/compliance/authoritative-rule.schema";

describe("Work Order Contract & Parser", () => {
  it("1. converts true work-order flags to REQUIRED", () => {
    assert.equal(parseRequirementFlag(true), "REQUIRED");
    assert.equal(parseRequirementFlag("true"), "REQUIRED");
    assert.equal(parseRequirementFlag("TRUE"), "REQUIRED");
    assert.equal(parseRequirementFlag("1"), "REQUIRED");
    assert.equal(parseRequirementFlag("yes"), "REQUIRED");
    assert.equal(parseRequirementFlag("YES"), "REQUIRED");
  });

  it("2. converts false work-order flags to NOT_REQUIRED", () => {
    assert.equal(parseRequirementFlag(false), "NOT_REQUIRED");
    assert.equal(parseRequirementFlag("false"), "NOT_REQUIRED");
    assert.equal(parseRequirementFlag("FALSE"), "NOT_REQUIRED");
    assert.equal(parseRequirementFlag("0"), "NOT_REQUIRED");
    assert.equal(parseRequirementFlag("no"), "NOT_REQUIRED");
    assert.equal(parseRequirementFlag("NO"), "NOT_REQUIRED");
  });

  it("3. converts missing or invalid flags to UNKNOWN (does not silently default to NOT_REQUIRED)", () => {
    assert.equal(parseRequirementFlag(undefined), "UNKNOWN");
    assert.equal(parseRequirementFlag(null), "UNKNOWN");
    assert.equal(parseRequirementFlag(""), "UNKNOWN");
    assert.equal(parseRequirementFlag("   "), "UNKNOWN");
    assert.equal(parseRequirementFlag("maybe"), "UNKNOWN");
    assert.equal(parseRequirementFlag("unknown"), "UNKNOWN");
    assert.equal(parseRequirementFlag(123), "UNKNOWN");
    assert.equal(parseRequirementFlag({}), "UNKNOWN");
  });

  it("4. parses semicolon-delimited handling marks correctly", () => {
    const parsedMulti = parseHandlingMarksRequirement("fragile;this_way_up");
    assert.equal(parsedMulti.state, "REQUIRED");
    assert.deepEqual(parsedMulti.requiredMarks, ["fragile", "this_way_up"]);

    const parsedSingle = parseHandlingMarksRequirement("liquid");
    assert.equal(parsedSingle.state, "REQUIRED");
    assert.deepEqual(parsedSingle.requiredMarks, ["liquid"]);

    const parsedEmpty = parseHandlingMarksRequirement("");
    assert.equal(parsedEmpty.state, "NOT_REQUIRED");
    assert.deepEqual(parsedEmpty.requiredMarks, []);

    const parsedNone = parseHandlingMarksRequirement("none");
    assert.equal(parsedNone.state, "NOT_REQUIRED");
    assert.deepEqual(parsedNone.requiredMarks, []);

    const parsedNull = parseHandlingMarksRequirement(null);
    assert.equal(parsedNull.state, "UNKNOWN");
    assert.deepEqual(parsedNull.requiredMarks, []);
  });

  it("5. observed-result CSV columns do NOT affect requirement parsing", () => {
    // Row where observed results directly conflict with work-order requirements:
    // Work order says: polybag NOT required, suffocation warning NOT required.
    // Observed result columns say: polybag_present_sealed = "yes", suffocation_warning = "pass".
    const mockCsvRow = {
      work_order_id: "WO-9999",
      unit_id: "UNIT-9999",
      sku: "SKU-TEST-001",
      asin: "B000000001",
      fnsku: "X000000001",
      // Work-order intent:
      wo_polybag: "false",
      wo_suffocation_warning: "false",
      wo_expiry_date: "true",
      wo_handling_marks: "fragile",
      // Observed results / operator records that must be ignored:
      polybag_present_sealed: "yes",
      suffocation_warning: "pass",
      fnsku_label_placement: "center",
      original_barcode_covered: "yes",
      expiry_date: "2027-12-31",
      handling_marks: "liquid;this_way_up",
      operator_id: "OP-42",
      captured_at: "2026-03-15T10:00:00Z",
    };

    const parsed = parseWorkOrderFromCsvRow(mockCsvRow);

    // Verify work order intent is parsed strictly from wo_* fields
    assert.equal(parsed.requirements.polybag, "NOT_REQUIRED");
    assert.equal(parsed.requirements.suffocationWarning, "NOT_REQUIRED");
    assert.equal(parsed.requirements.expiryDate, "REQUIRED");
    assert.equal(parsed.requirements.handlingMarks.state, "REQUIRED");
    assert.deepEqual(parsed.requirements.handlingMarks.requiredMarks, ["fragile"]);

    // Schema validation passes
    assert.doesNotThrow(() => workOrderSpecificationSchema.parse(parsed));
  });
});

describe("Authoritative Rule Contract", () => {
  const sampleValidRule: AuthoritativePrepRule = {
    ruleId: "AMZN-FBA-PREP-POLYBAG-001",
    version: "2026.1",
    checkType: "POLYBAG_PRESENCE",
    title: "Polybag Packaging Requirement for Loose Products",
    source: {
      publisher: "Amazon Seller Central",
      url: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
      retrievedAt: "2026-03-01T00:00:00.000Z",
      sourceNote: "Section 3: Packaging and Prep Requirements - Polybagging",
    },
    applicability: {
      source: "WORK_ORDER_OR_POLICY",
      requiredInputs: ["workOrder.requirements.polybag"],
    },
    verification: {
      requiredObservationFields: ["polybag.visibility"],
      visualVerifiability: "FULL",
    },
    status: "ACTIVE",
  };

  it("6. successfully parses a valid authoritative rule", () => {
    const parsed = authoritativePrepRuleSchema.parse(sampleValidRule);
    assert.equal(parsed.ruleId, "AMZN-FBA-PREP-POLYBAG-001");
    assert.equal(parsed.checkType, "POLYBAG_PRESENCE");
    assert.equal(parsed.verification.visualVerifiability, "FULL");
    assert.equal(parsed.status, "ACTIVE");
  });

  it("7. rejects a rule with a missing or invalid source URL", () => {
    // Missing URL
    assert.throws(
      () =>
        authoritativePrepRuleSchema.parse({
          ...sampleValidRule,
          source: {
            ...sampleValidRule.source,
            url: undefined,
          },
        }),
      (err: unknown) => {
        return err instanceof Error;
      }
    );

    // Invalid URL format
    assert.throws(
      () =>
        authoritativePrepRuleSchema.parse({
          ...sampleValidRule,
          source: {
            ...sampleValidRule.source,
            url: "not-a-valid-url",
          },
        }),
      (err: unknown) => {
        return err instanceof Error;
      }
    );
  });

  it("8. rejects an invalid visualVerifiability tier", () => {
    assert.throws(
      () =>
        authoritativePrepRuleSchema.parse({
          ...sampleValidRule,
          verification: {
            ...sampleValidRule.verification,
            visualVerifiability: "SOMEWHAT_VERIFIABLE",
          },
        }),
      (err: unknown) => {
        return err instanceof Error;
      }
    );
  });

  it("9. rejects an invalid checkType", () => {
    assert.throws(
      () =>
        authoritativePrepRuleSchema.parse({
          ...sampleValidRule,
          checkType: "UNKNOWN_CHECK_TYPE",
        }),
      (err: unknown) => {
        return err instanceof Error;
      }
    );
  });
});
