import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluationDatasetSchema,
  EVALUATION_DATASET,
  runEvaluation,
  calculateEvaluationMetrics,
  toMatrixLabel,
} from "../../src/lib/evaluation";
import { SUPPORTED_INSPECTION_CHECKS } from "../../src/lib/inspection/run-prep-inspection";
import type { ComplianceCheckResult } from "../../src/lib/compliance/compliance-result.schema";

describe("Day 3 / Step 4: Deterministic Evaluation Harness", () => {
  // 1. evaluation dataset validates
  it("1. evaluation dataset validates", () => {
    const parsed = evaluationDatasetSchema.parse(EVALUATION_DATASET);
    assert.equal(parsed.length, EVALUATION_DATASET.length);
    assert.ok(parsed.length >= 30, "Dataset must contain at least 30 cases");
  });

  // 2. every supported check has coverage
  it("2. every supported check has coverage", () => {
    const coveredChecks = new Set(EVALUATION_DATASET.map((c) => c.checkType));
    for (const checkType of SUPPORTED_INSPECTION_CHECKS) {
      assert.ok(
        coveredChecks.has(checkType),
        `Supported check ${checkType} must have coverage in evaluation dataset`
      );
    }
  });

  // 3. metrics calculation is correct
  it("3. metrics calculation is correct", () => {
    const metrics = runEvaluation();
    assert.equal(metrics.totalCases, EVALUATION_DATASET.length);
    assert.equal(metrics.correctCases, EVALUATION_DATASET.length);
    assert.equal(metrics.verdictAccuracy, 1.0);
    assert.equal(metrics.falsePassCount, 0);
    assert.equal(metrics.falseFailCount, 0);
    assert.equal(metrics.failedCases.length, 0);
    assert.equal(metrics.falsePassCases.length, 0);
  });

  // 4. false PASS detection works
  it("4. false PASS detection works", () => {
    const sampleCase = EVALUATION_DATASET.find(
      (c) => c.expected.verdict === "FAIL"
    );
    assert.ok(sampleCase);

    // Simulate an erroneous actual PASS
    const erroneousActual: ComplianceCheckResult = {
      checkId: `${sampleCase.caseId}:TEST`,
      checkType: sampleCase.checkType,
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation: "Simulated erroneous pass",
      rule: { ruleId: "TEST-RULE", version: "1.0" },
      evidence: [],
      observedValue: "PASS",
    };

    const metrics = calculateEvaluationMetrics([
      { case: sampleCase, actual: erroneousActual },
    ]);

    assert.equal(metrics.totalCases, 1);
    assert.equal(metrics.correctCases, 0);
    assert.equal(metrics.falsePassCount, 1);
    assert.equal(metrics.falsePassRate, 1.0);
    assert.equal(metrics.falsePassCases.length, 1);
    assert.equal(metrics.falsePassCases[0].case.caseId, sampleCase.caseId);
  });

  // 5. false FAIL detection works
  it("5. false FAIL detection works", () => {
    const sampleCase = EVALUATION_DATASET.find(
      (c) => c.expected.verdict === "PASS"
    );
    assert.ok(sampleCase);

    // Simulate an erroneous actual FAIL
    const erroneousActual: ComplianceCheckResult = {
      checkId: `${sampleCase.caseId}:TEST`,
      checkType: sampleCase.checkType,
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
      explanation: "Simulated erroneous fail",
      rule: { ruleId: "TEST-RULE", version: "1.0" },
      evidence: [],
      observedValue: "FAIL",
    };

    const metrics = calculateEvaluationMetrics([
      { case: sampleCase, actual: erroneousActual },
    ]);

    assert.equal(metrics.totalCases, 1);
    assert.equal(metrics.correctCases, 0);
    assert.equal(metrics.falseFailCount, 1);
    assert.equal(metrics.falseFailRate, 1.0);
  });

  // 6. UNCERTAIN counted as abstention
  it("6. UNCERTAIN counted as abstention", () => {
    const uncertainCases = EVALUATION_DATASET.filter(
      (c) => c.expected.verdict === "UNCERTAIN"
    );
    assert.ok(uncertainCases.length > 0);

    const metrics = runEvaluation({ dataset: uncertainCases });
    assert.equal(metrics.uncertainCount, uncertainCases.length);
    assert.equal(metrics.abstentionRate, 1.0);
    assert.equal(metrics.uncertaintyCorrectness, 1.0);
  });

  // 7. NOT_APPLICABLE handled separately
  it("7. NOT_APPLICABLE handled separately", () => {
    const naCases = EVALUATION_DATASET.filter(
      (c) => c.expected.applicability === "NOT_APPLICABLE"
    );
    assert.ok(naCases.length > 0);

    for (const c of naCases) {
      assert.equal(
        c.expected.verdict,
        null,
        "NOT_APPLICABLE must have null verdict"
      );
      assert.equal(
        toMatrixLabel(c.expected.applicability, c.expected.verdict),
        "NOT_APPLICABLE"
      );
    }

    const metrics = runEvaluation({ dataset: naCases });
    assert.equal(metrics.confusionMatrix.NOT_APPLICABLE.NOT_APPLICABLE, naCases.length);
    assert.equal(metrics.confusionMatrix.NOT_APPLICABLE.PASS, 0);
  });

  // 8. confusion matrix totals equal dataset size
  it("8. confusion matrix totals equal dataset size", () => {
    const metrics = runEvaluation();
    let matrixSum = 0;
    for (const row of Object.values(metrics.confusionMatrix)) {
      for (const count of Object.values(row)) {
        matrixSum += count;
      }
    }
    assert.equal(matrixSum, EVALUATION_DATASET.length);
    assert.equal(matrixSum, metrics.totalCases);
  });

  // 9. ACROSS_SEAM expected UNCERTAIN
  it("9. ACROSS_SEAM expected UNCERTAIN (policy-gap abstention)", () => {
    const seamCase = EVALUATION_DATASET.find(
      (c) => c.caseId === "CASE-FNSKU-PLC-04"
    );
    assert.ok(seamCase, "ACROSS_SEAM case must be present in dataset");
    assert.equal(seamCase.category, "POLICY_GAP");
    assert.equal(seamCase.expected.verdict, "UNCERTAIN");

    const metrics = runEvaluation({ dataset: [seamCase] });
    assert.equal(metrics.totalCases, 1);
    assert.equal(metrics.correctCases, 1);
    assert.equal(metrics.caseResults[0].actual.verdict, "UNCERTAIN");
    assert.equal(
      metrics.caseResults[0].actual.reasonCode,
      "INSUFFICIENT_VISUAL_EVIDENCE"
    );
  });

  // 10. evaluation performs no Gemini/API calls
  it("10. evaluation performs no Gemini/API calls", () => {
    const savedApiKey = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;

      // runEvaluation must execute completely and deterministically without throwing missing API key errors
      const metrics = runEvaluation();
      assert.equal(metrics.totalCases, EVALUATION_DATASET.length);
      assert.equal(metrics.verdictAccuracy, 1.0);
    } finally {
      if (savedApiKey) {
        process.env.GEMINI_API_KEY = savedApiKey;
      }
    }
  });
});
