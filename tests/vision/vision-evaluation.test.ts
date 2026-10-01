import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  unitVisionGroundTruthSchema,
  FIXTURE_VISION_GROUND_TRUTH,
  evaluateUnitObservation,
  aggregateVisionMetrics,
  type UnitVisionGroundTruth,
} from "../../src/lib/vision/evaluation";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

function createMockObservation(
  unitId: string,
  overrides?: Partial<PrepUnitObservation>
): PrepUnitObservation {
  return {
    unitId,
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
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8906050590022",
      evidence: [],
    },
    expiryDate: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "10/2027",
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
    ...overrides,
  };
}

describe("Day 3 / Step 5: Vision Observation Evaluation Machinery", () => {
  // 1. Ground truth schema validation
  it("1. fixture ground truth adheres to schema", () => {
    for (const [unitId, gt] of Object.entries(FIXTURE_VISION_GROUND_TRUTH)) {
      const parsed = unitVisionGroundTruthSchema.parse(gt);
      assert.equal(parsed.unitId, unitId);
    }
  });

  // 2. Unlabeled fields are excluded
  it("2. unlabeled fields are excluded from evaluation", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Test unit with mostly unlabeled fields",
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "NOT_LABELED",
        detectedValue: "NOT_LABELED",
      },
      expiryDate: {
        visibility: "NOT_LABELED",
        legibility: "NOT_LABELED",
        detectedValue: "NOT_LABELED",
      },
      fnsku: {
        visibility: "NOT_LABELED",
        legibility: "NOT_LABELED",
        detectedValue: "NOT_LABELED",
        placement: "NOT_LABELED",
      },
      polybag: {
        visibility: "NOT_LABELED",
        sealStatus: "NOT_LABELED",
      },
      suffocationWarning: {
        visibility: "NOT_LABELED",
        legibility: "NOT_LABELED",
        detectedText: "NOT_LABELED",
      },
      handlingMarks: {
        visibility: "NOT_LABELED",
        expectedMarks: "NOT_LABELED",
      },
    };

    const obs = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "123456",
        evidence: [],
      },
    });

    const result = evaluateUnitObservation(obs, customGt);
    // Only manufacturerBarcode.visibility was labeled
    assert.equal(result.totalFieldsEvaluated, 1);
    assert.equal(result.totalMatches, 1);
    assert.equal(result.mismatches.length, 0);
  });

  // 3. Hallucination detection
  it("3. hallucination detection flags invented feature or value", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Test unit",
      manufacturerBarcode: {
        visibility: "NOT_DETECTED",
        legibility: "NOT_LABELED",
        detectedValue: null,
      },
      expiryDate: { visibility: "NOT_LABELED" },
      fnsku: { visibility: "NOT_LABELED" },
      polybag: { visibility: "NOT_LABELED" },
      suffocationWarning: { visibility: "NOT_LABELED" },
      handlingMarks: { visibility: "NOT_LABELED", expectedMarks: [] },
    };

    // Observation claims barcode is VISIBLE with a value
    const obs = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "999999999",
        evidence: [],
      },
    });

    const result = evaluateUnitObservation(obs, customGt);
    assert.ok(result.mismatches.some((m) => m.mismatchType === "HALLUCINATION"));
    assert.ok(result.perFeature.manufacturerBarcode.hallucinations > 0);
  });

  // 4. Miss detection
  it("4. miss detection flags visible feature reported as NOT_DETECTED", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Test unit",
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "NOT_LABELED",
        detectedValue: "NOT_LABELED",
      },
      expiryDate: { visibility: "NOT_LABELED" },
      fnsku: { visibility: "NOT_LABELED" },
      polybag: { visibility: "NOT_LABELED" },
      suffocationWarning: { visibility: "NOT_LABELED" },
      handlingMarks: { visibility: "NOT_LABELED", expectedMarks: [] },
    };

    // Model failed to detect the barcode
    const obs = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    });

    const result = evaluateUnitObservation(obs, customGt);
    assert.ok(result.mismatches.some((m) => m.mismatchType === "MISS"));
    assert.equal(result.perFeature.manufacturerBarcode.misses, 1);
  });

  // 5. Exact-value comparison
  it("5. exact-value comparison correctly handles matching and mismatches", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Test unit",
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
      },
      expiryDate: { visibility: "NOT_LABELED" },
      fnsku: { visibility: "NOT_LABELED" },
      polybag: { visibility: "NOT_LABELED" },
      suffocationWarning: { visibility: "NOT_LABELED" },
      handlingMarks: { visibility: "NOT_LABELED", expectedMarks: [] },
    };

    // Case A: Matching value
    const obsMatch = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [],
      },
    });
    const resultMatch = evaluateUnitObservation(obsMatch, customGt);
    assert.equal(resultMatch.mismatches.length, 0);

    // Case B: Value mismatch
    const obsMismatch = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590099",
        evidence: [],
      },
    });
    const resultMismatch = evaluateUnitObservation(obsMismatch, customGt);
    assert.ok(resultMismatch.mismatches.some((m) => m.mismatchType === "VALUE_ERROR"));
  });

  // 6. Overassertion detection
  it("6. overassertion flags confident claim when ground truth is UNCERTAIN", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Test unit",
      polybag: {
        visibility: "UNCERTAIN",
        sealStatus: "UNCERTAIN",
      },
      manufacturerBarcode: { visibility: "NOT_LABELED" },
      expiryDate: { visibility: "NOT_LABELED" },
      fnsku: { visibility: "NOT_LABELED" },
      suffocationWarning: { visibility: "NOT_LABELED" },
      handlingMarks: { visibility: "NOT_LABELED", expectedMarks: [] },
    };

    const obs = createMockObservation("UNIT-TEST", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [],
      },
    });

    const result = evaluateUnitObservation(obs, customGt);
    assert.ok(result.mismatches.some((m) => m.mismatchType === "OVERASSERTION"));
    assert.ok(result.perFeature.polybag.overassertions > 0);
  });

  // 7. Aggregate metrics calculation
  it("7. aggregate vision metrics calculates accurate totals and rates", () => {
    const gt = FIXTURE_VISION_GROUND_TRUTH["UNIT-0002"];
    const perfectObs = createMockObservation("UNIT-0002");
    const unitResult = evaluateUnitObservation(perfectObs, gt);

    const agg = aggregateVisionMetrics([unitResult]);
    assert.equal(agg.totalUnits, 1);
    assert.equal(agg.totalFieldsEvaluated, unitResult.totalFieldsEvaluated);
    assert.equal(agg.overallAgreementRate, 1.0);
    assert.equal(agg.hallucinationCount, 0);
    assert.equal(agg.missCount, 0);
    assert.equal(agg.unsafeAssertionCount, 0);
  });

  // 8. Comprehensive mismatch classification
  it("8. mismatch classification handles all required error types", () => {
    const customGt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Mismatch classification test unit",
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "1234567890",
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "12/2026",
      },
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "NOT_LABELED",
        detectedValue: null,
        placement: "NOT_LABELED",
      },
      polybag: {
        visibility: "UNCERTAIN",
        sealStatus: "UNCERTAIN",
      },
      suffocationWarning: {
        visibility: "NOT_DETECTED",
        legibility: "NOT_LABELED",
        detectedText: "NOT_LABELED",
      },
      handlingMarks: {
        visibility: "NOT_DETECTED",
        expectedMarks: [],
      },
    };

    // Observation with distinct mismatch types:
    // - manufacturerBarcode.legibility: expected LEGIBLE, observed ILLEGIBLE -> LEGIBILITY_ERROR
    // - manufacturerBarcode.detectedValue: expected "1234567890", observed "9999999999" -> VALUE_ERROR
    // - expiryDate.visibility: expected VISIBLE, observed NOT_DETECTED -> MISS
    // - fnsku.visibility: expected NOT_DETECTED, observed VISIBLE -> HALLUCINATION
    // - polybag.visibility: expected UNCERTAIN, observed VISIBLE -> OVERASSERTION
    const obs = createMockObservation("UNIT-TEST", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: "9999999999",
        evidence: [{ imageId: "back.jpeg", description: "Barcode label is blurry" }],
      },
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TEST",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "back.jpeg", description: "Found FNSKU label" }],
      },
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [{ imageId: "front.jpeg", description: "Sealed polybag" }],
      },
    });

    const result = evaluateUnitObservation(obs, customGt);
    const types = new Set(result.mismatches.map((m) => m.mismatchType));

    assert.ok(types.has("LEGIBILITY_ERROR"), "Should include LEGIBILITY_ERROR");
    assert.ok(types.has("VALUE_ERROR"), "Should include VALUE_ERROR");
    assert.ok(types.has("MISS"), "Should include MISS");
    assert.ok(types.has("HALLUCINATION"), "Should include HALLUCINATION");
    assert.ok(types.has("OVERASSERTION"), "Should include OVERASSERTION");

    // Also check PLACEMENT_ERROR with explicit placement mismatch
    const placementGt: UnitVisionGroundTruth = {
      ...customGt,
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TEST",
        placement: "FLAT_SURFACE",
      },
    };
    const placementObs = createMockObservation("UNIT-TEST", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TEST",
        placement: "CURVED_SURFACE",
        placementDescription: "Curved surface edge",
        evidence: [],
      },
    });
    const placementResult = evaluateUnitObservation(placementObs, placementGt);
    assert.ok(
      placementResult.mismatches.some((m) => m.mismatchType === "PLACEMENT_ERROR"),
      "Should include PLACEMENT_ERROR"
    );
  });

  // 9. Repeated-run aggregation and stability
  it("9. repeated-run aggregation tracks stability across runs without majority voting", async () => {
    const { runVisionEvaluation } = await import(
      "../../src/lib/vision/evaluation/run-vision-evaluation"
    );

    let callCount = 0;
    // Mock analyzer that returns different values in run 1 vs run 2 to test stability tracking
    const mockAnalyzer = async (unitId: string) => {
      callCount++;
      const isRun2 = callCount > 1;
      return {
        unitId,
        observation: createMockObservation(unitId, {
          manufacturerBarcode: {
            visibility: "VISIBLE",
            legibility: "LEGIBLE",
            detectedValue: isRun2 ? "DIFFERENT_VALUE" : "8906050590022",
            evidence: [{ imageId: "label.jpeg", description: "Mock barcode" }],
          },
        }),
        metadata: {
          model: "gemini-mock",
          durationMs: isRun2 ? 1500 : 1200,
          requestCount: 1,
        },
      };
    };

    const report = await runVisionEvaluation({
      runs: 2,
      units: ["UNIT-0002"],
      analyzer: mockAnalyzer,
      delayMs: 0,
    });

    assert.equal(report.totalRuns, 2);
    assert.equal(report.runs.length, 2);
    // Both runs are recorded separately (no majority voting)
    assert.equal(report.runs[0].unitResults[0].result.observation.manufacturerBarcode.detectedValue, "8906050590022");
    assert.equal(report.runs[1].unitResults[0].result.observation.manufacturerBarcode.detectedValue, "DIFFERENT_VALUE");

    // Stability metrics
    assert.equal(report.stability.isFullyStable, false);
    assert.ok(report.stability.unstableFieldCount > 0);
    const barcodeValField = report.stability.fieldDetails.find(
      (f) => f.feature === "manufacturerBarcode" && f.field === "detectedValue"
    );
    assert.ok(barcodeValField);
    assert.equal(barcodeValField?.isStable, false);

    // Latency aggregation
    assert.equal(report.overallLatency.totalRequests, 2);
    assert.equal(report.overallLatency.minLatencyMs, 1200);
    assert.equal(report.overallLatency.maxLatencyMs, 1500);
    assert.equal(report.overallLatency.averageLatencyMs, 1350);
  });
});

describe("Day 3 / Step 5.1: Packaging Observation Semantics Hardening", () => {
  it("1. polybagObservationSchema is backward compatible when packagingType is omitted", async () => {
    const { polybagObservationSchema } = await import(
      "../../src/lib/vision/prep-observation.schema"
    );
    const raw = {
      visibility: "NOT_DETECTED",
      sealStatus: "UNCERTAIN",
      evidence: [],
    };
    const parsed = polybagObservationSchema.parse(raw);
    assert.equal(parsed.packagingType, undefined);
    assert.equal(parsed.visibility, "NOT_DETECTED");
  });

  it("2. allows all valid packagingType enum values", async () => {
    const { packagingTypeSchema, polybagObservationSchema } = await import(
      "../../src/lib/vision/prep-observation.schema"
    );
    const validTypes = [
      "POLYBAG",
      "SHRINK_WRAP",
      "PLASTIC_OVERWRAP",
      "OTHER_PLASTIC",
      "NONE_DETECTED",
      "UNCERTAIN",
    ] as const;
    for (const pt of validTypes) {
      const parsed = packagingTypeSchema.parse(pt);
      assert.equal(parsed, pt);

      const obs = polybagObservationSchema.parse({
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        packagingType: pt,
        evidence: [],
      });
      assert.equal(obs.packagingType, pt);
    }
  });

  it("3. rejects invalid packagingType values", async () => {
    const { packagingTypeSchema } = await import(
      "../../src/lib/vision/prep-observation.schema"
    );
    assert.throws(() => packagingTypeSchema.parse("BOX"));
    assert.throws(() => packagingTypeSchema.parse("CARDBOARD"));
    assert.throws(() => packagingTypeSchema.parse("PLASTIC"));
  });

  it("4. packagingType does not automatically alter visibility (no coupling)", async () => {
    const { polybagObservationSchema } = await import(
      "../../src/lib/vision/prep-observation.schema"
    );
    // SHRINK_WRAP or PLASTIC_OVERWRAP with NOT_DETECTED visibility must remain NOT_DETECTED
    const obs = polybagObservationSchema.parse({
      visibility: "NOT_DETECTED",
      sealStatus: "UNCERTAIN",
      packagingType: "PLASTIC_OVERWRAP",
      evidence: [],
    });
    assert.equal(obs.visibility, "NOT_DETECTED");
    assert.equal(obs.packagingType, "PLASTIC_OVERWRAP");
  });

  it("5. ground truth schema supports packagingType with default NOT_LABELED", async () => {
    const { groundTruthPolybagSchema } = await import(
      "../../src/lib/vision/evaluation"
    );
    const defaultGt = groundTruthPolybagSchema.parse({
      visibility: "NOT_DETECTED",
    });
    assert.equal(defaultGt.packagingType, "NOT_LABELED");

    const labeledGt = groundTruthPolybagSchema.parse({
      visibility: "VISIBLE",
      packagingType: "SHRINK_WRAP",
    });
    assert.equal(labeledGt.packagingType, "SHRINK_WRAP");
  });

  it("6. evaluation runner checks packagingType when labeled in ground truth", () => {
    const gt: UnitVisionGroundTruth = {
      unitId: "UNIT-TEST",
      description: "Packaging type test",
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "NOT_LABELED",
        packagingType: "SHRINK_WRAP",
      },
      manufacturerBarcode: { visibility: "NOT_LABELED" },
      expiryDate: { visibility: "NOT_LABELED" },
      fnsku: { visibility: "NOT_LABELED" },
      suffocationWarning: { visibility: "NOT_LABELED" },
      handlingMarks: { visibility: "NOT_LABELED", expectedMarks: [] },
    };

    // Case A: Matching packagingType
    const matchingObs = createMockObservation("UNIT-TEST", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN",
        packagingType: "SHRINK_WRAP",
        evidence: [],
      },
    });
    const matchResult = evaluateUnitObservation(matchingObs, gt);
    assert.equal(matchResult.mismatches.length, 0);

    // Case B: Mismatched packagingType
    const mismatchObs = createMockObservation("UNIT-TEST", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN",
        packagingType: "POLYBAG",
        evidence: [],
      },
    });
    const mismatchResult = evaluateUnitObservation(mismatchObs, gt);
    assert.ok(
      mismatchResult.mismatches.some(
        (m) => m.feature === "polybag" && m.field === "packagingType"
      )
    );
  });
});

