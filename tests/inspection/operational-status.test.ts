import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  aggregateOperationalStatus,
  getDeterministicOperatorAction,
} from "../../src/lib/inspection/operational-status";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../../src/lib/compliance/compliance-result.schema";
import type { PrepCheckType } from "../../src/lib/compliance/check-types";
import {
  inspectionRequestSchema,
  POST as inspectionPostHandler,
} from "../../src/app/api/inspection/route";

function makeCheck(params: {
  checkType: PrepCheckType;
  applicability: "APPLICABLE" | "NOT_APPLICABLE";
  verdict: "PASS" | "FAIL" | "UNCERTAIN" | null;
  reasonCode?:
    | "REQUIREMENT_SATISFIED"
    | "REQUIREMENT_VIOLATED"
    | "INSUFFICIENT_VISUAL_EVIDENCE"
    | "FEATURE_NOT_DETECTED"
    | "TEXT_ILLEGIBLE"
    | "EXPECTED_VALUE_MISMATCH"
    | "PLACEMENT_INVALID"
    | "NOT_APPLICABLE";
  explanation?: string;
}): ComplianceCheckResult {
  return complianceCheckResultSchema.parse({
    checkId: `test:${params.checkType}`,
    checkType: params.checkType,
    applicability: params.applicability,
    verdict: params.verdict,
    reasonCode:
      params.reasonCode ??
      (params.applicability === "NOT_APPLICABLE"
        ? "NOT_APPLICABLE"
        : params.verdict === "PASS"
        ? "REQUIREMENT_SATISFIED"
        : "REQUIREMENT_VIOLATED"),
    explanation: params.explanation ?? `Evaluation of ${params.checkType}`,
    rule: {
      ruleId: `RULE-TEST-${params.checkType}`,
      version: "1.0",
    },
    evidence: [],
    observedValue: null,
  });
}

describe("Operational Status Aggregator (Day 4 / Step 1)", () => {
  // Test 1: FAIL -> STOP_AND_FIX
  it("Rule 1: If ANY applicable compliance result has verdict = FAIL -> STOP_AND_FIX", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
      makeCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "FAIL",
      }),
      makeCheck({
        checkType: "POLYBAG_SEAL",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "STOP_AND_FIX");
    assert.equal(result.failCount, 1);
    assert.equal(result.passCount, 1);
    assert.equal(result.uncertainCount, 1);
    assert.deepEqual(result.blockingCheckTypes, [
      "MANUFACTURER_BARCODE_COVERAGE",
    ]);
  });

  // Test 2: UNCERTAIN with no FAIL -> REVIEW_REQUIRED
  it("Rule 2: If ANY applicable result has verdict = UNCERTAIN with no FAIL -> REVIEW_REQUIRED", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
      makeCheck({
        checkType: "POLYBAG_SEAL",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      }),
      makeCheck({
        checkType: "EXPIRY_VISIBILITY",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.failCount, 0);
    assert.equal(result.uncertainCount, 1);
    assert.equal(result.passCount, 1);
    assert.deepEqual(result.uncertainCheckTypes, ["POLYBAG_SEAL"]);
    assert.deepEqual(result.blockingCheckTypes, []);
  });

  // Test 3: all applicable PASS -> READY
  it("Rule 3: If one or more applicable results exist and all are PASS -> READY", () => {
    const checks = [
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "READY");
    assert.equal(result.passCount, 2);
    assert.equal(result.failCount, 0);
    assert.equal(result.uncertainCount, 0);
    assert.equal(result.notApplicableCount, 1);
    assert.deepEqual(result.blockingCheckTypes, []);
    assert.deepEqual(result.uncertainCheckTypes, []);
  });

  // Test 4: zero applicable checks -> REVIEW_REQUIRED
  it("Rule 4: If there are zero applicable checks -> REVIEW_REQUIRED", () => {
    const checks = [
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
      makeCheck({
        checkType: "SUFFOCATION_WARNING_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.passCount, 0);
    assert.equal(result.failCount, 0);
    assert.equal(result.uncertainCount, 0);
    assert.equal(result.notApplicableCount, 2);
  });

  // Test 5: NOT_APPLICABLE excluded from PASS aggregation
  it("Rule 5: NOT_APPLICABLE checks must NEVER count as PASS", () => {
    const allNotApplicableChecks = [
      makeCheck({
        checkType: "POLYBAG_PRESENCE",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
      makeCheck({
        checkType: "POLYBAG_SEAL",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
      makeCheck({
        checkType: "EXPIRY_VISIBILITY",
        applicability: "NOT_APPLICABLE",
        verdict: null,
      }),
    ];

    const result = aggregateOperationalStatus({ checks: allNotApplicableChecks });

    assert.equal(result.passCount, 0);
    assert.equal(result.notApplicableCount, 3);
    assert.notEqual(result.status, "READY");
    assert.equal(result.status, "REVIEW_REQUIRED");
  });

  // Test 6: blockingCheckTypes correct
  it("Requirement 6: blockingCheckTypes correctly accumulates all failed check types", () => {
    const checks = [
      makeCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "FAIL",
      }),
      makeCheck({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        verdict: "FAIL",
      }),
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "STOP_AND_FIX");
    assert.equal(result.failCount, 2);
    assert.deepEqual(result.blockingCheckTypes, [
      "MANUFACTURER_BARCODE_COVERAGE",
      "FNSKU_PLACEMENT",
    ]);
  });

  // Test 7: uncertainCheckTypes correct
  it("Requirement 7: uncertainCheckTypes correctly accumulates all uncertain check types", () => {
    const checks = [
      makeCheck({
        checkType: "POLYBAG_SEAL",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      }),
      makeCheck({
        checkType: "EXPIRY_LEGIBILITY",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      }),
      makeCheck({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        verdict: "PASS",
      }),
    ];

    const result = aggregateOperationalStatus({ checks });

    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.uncertainCount, 2);
    assert.deepEqual(result.uncertainCheckTypes, [
      "POLYBAG_SEAL",
      "EXPIRY_LEGIBILITY",
    ]);
  });

  // Test 8: inspection API rejects malformed requests
  it("Requirement 8: Inspection API schema and route reject malformed requests", async () => {
    // 8a: Schema level validation
    assert.equal(
      inspectionRequestSchema.safeParse({}).success,
      false,
      "Empty object must fail validation"
    );

    assert.equal(
      inspectionRequestSchema.safeParse({ unitId: "UNIT-0001", images: [] })
        .success,
      false,
      "Images array cannot be empty"
    );

    assert.equal(
      inspectionRequestSchema.safeParse({
        unitId: "UNIT-0001",
        images: [{ imageId: "front", mimeType: "", imageData: "abc" }],
      }).success,
      false,
      "Image with empty mimeType must fail validation"
    );

    // 8b: Route level handling of malformed JSON / payload
    const malformedReq = new NextRequest("http://localhost:3000/api/inspection", {
      method: "POST",
      body: JSON.stringify({ unitId: "", images: [] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await inspectionPostHandler(malformedReq);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  // Test 9: operational action mappings are deterministic
  it("Requirement 9: Operational action mappings are deterministic and strictly non-LLM", () => {
    // 9a: PASS and NOT_APPLICABLE return null
    const passCheck = makeCheck({
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "PASS",
    });
    assert.equal(getDeterministicOperatorAction(passCheck), null);

    const naCheck = makeCheck({
      checkType: "POLYBAG_PRESENCE",
      applicability: "NOT_APPLICABLE",
      verdict: null,
    });
    assert.equal(getDeterministicOperatorAction(naCheck), null);

    // 9b: FNSKU not detected
    const fnskuNotDetected = makeCheck({
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    });
    assert.equal(
      getDeterministicOperatorAction(fnskuNotDetected),
      "Capture a clear image of the product barcode label."
    );

    // 9c: Manufacturer barcode visible when coverage is required
    const barcodeVisible = makeCheck({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
    });
    assert.equal(
      getDeterministicOperatorAction(barcodeVisible),
      "Cover the manufacturer barcode and inspect again."
    );

    // 9d: Expiry unreadable
    const expiryUnreadable = makeCheck({
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
    });
    assert.equal(
      getDeterministicOperatorAction(expiryUnreadable),
      "Capture a closer image of the expiry label."
    );

    // 9e: Polybag seal uncertain
    const sealUncertain = makeCheck({
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    });
    assert.equal(
      getDeterministicOperatorAction(sealUncertain),
      "Capture the complete bag closure."
    );
  });
});
