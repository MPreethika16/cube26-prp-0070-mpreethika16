import type { PrepCheckType } from "../compliance/check-types";
import { SUPPORTED_INSPECTION_CHECKS } from "../inspection/run-prep-inspection";
import type { ComplianceCheckResult } from "../compliance/compliance-result.schema";
import type { EvaluationCase } from "./evaluation-case.schema";

export type MatrixLabel = "PASS" | "FAIL" | "UNCERTAIN" | "NOT_APPLICABLE";

export const MATRIX_LABELS: readonly MatrixLabel[] = [
  "PASS",
  "FAIL",
  "UNCERTAIN",
  "NOT_APPLICABLE",
] as const;

export type ConfusionMatrix = Record<MatrixLabel, Record<MatrixLabel, number>>;

export interface CaseEvaluationResult {
  case: EvaluationCase;
  actual: ComplianceCheckResult;
  expectedLabel: MatrixLabel;
  actualLabel: MatrixLabel;
  isCorrect: boolean;
  isFalsePass: boolean;
  isFalseFail: boolean;
}

export interface CheckTypeMetrics {
  checkType: PrepCheckType;
  total: number;
  correct: number;
  accuracy: number;
}

export interface EvaluationMetrics {
  totalCases: number;
  correctCases: number;
  verdictAccuracy: number;

  passPrecision: number;
  failPrecision: number;

  falsePassCount: number;
  falsePassRate: number;

  falseFailCount: number;
  falseFailRate: number;

  uncertainCount: number;
  abstentionRate: number;

  expectedUncertainCount: number;
  uncertaintyCorrectCount: number;
  uncertaintyCorrectness: number;

  perCheck: Record<PrepCheckType, CheckTypeMetrics>;
  confusionMatrix: ConfusionMatrix;

  caseResults: CaseEvaluationResult[];
  failedCases: CaseEvaluationResult[];
  falsePassCases: CaseEvaluationResult[];
}

export function toMatrixLabel(
  applicability: string,
  verdict: string | null
): MatrixLabel {
  if (applicability === "NOT_APPLICABLE" || verdict === null) {
    return "NOT_APPLICABLE";
  }
  if (verdict === "PASS" || verdict === "FAIL" || verdict === "UNCERTAIN") {
    return verdict;
  }
  return "UNCERTAIN";
}

export function createEmptyConfusionMatrix(): ConfusionMatrix {
  const matrix: Partial<ConfusionMatrix> = {};
  for (const row of MATRIX_LABELS) {
    matrix[row] = {
      PASS: 0,
      FAIL: 0,
      UNCERTAIN: 0,
      NOT_APPLICABLE: 0,
    };
  }
  return matrix as ConfusionMatrix;
}

/**
 * Calculates comprehensive evaluation metrics over evaluated test cases.
 */
export function calculateEvaluationMetrics(
  pairs: Array<{ case: EvaluationCase; actual: ComplianceCheckResult }>
): EvaluationMetrics {
  const confusionMatrix = createEmptyConfusionMatrix();

  const perCheck: Record<PrepCheckType, CheckTypeMetrics> = {} as Record<
    PrepCheckType,
    CheckTypeMetrics
  >;
  for (const checkType of SUPPORTED_INSPECTION_CHECKS) {
    perCheck[checkType] = {
      checkType,
      total: 0,
      correct: 0,
      accuracy: 0,
    };
  }

  const caseResults: CaseEvaluationResult[] = [];
  const failedCases: CaseEvaluationResult[] = [];
  const falsePassCases: CaseEvaluationResult[] = [];

  let correctCases = 0;
  let falsePassCount = 0;
  let falseFailCount = 0;
  let actualPassCount = 0;
  let truePassCount = 0;
  let actualFailCount = 0;
  let trueFailCount = 0;
  let uncertainCount = 0;
  let expectedUncertainCount = 0;
  let uncertaintyCorrectCount = 0;

  for (const pair of pairs) {
    const expectedLabel = toMatrixLabel(
      pair.case.expected.applicability,
      pair.case.expected.verdict
    );
    const actualLabel = toMatrixLabel(
      pair.actual.applicability,
      pair.actual.verdict
    );

    confusionMatrix[expectedLabel][actualLabel]++;

    const isCorrect = expectedLabel === actualLabel;
    const isFalsePass = expectedLabel !== "PASS" && actualLabel === "PASS";
    const isFalseFail = expectedLabel !== "FAIL" && actualLabel === "FAIL";

    if (isCorrect) {
      correctCases++;
    }
    if (isFalsePass) {
      falsePassCount++;
    }
    if (isFalseFail) {
      falseFailCount++;
    }

    if (actualLabel === "PASS") {
      actualPassCount++;
      if (expectedLabel === "PASS") {
        truePassCount++;
      }
    }

    if (actualLabel === "FAIL") {
      actualFailCount++;
      if (expectedLabel === "FAIL") {
        trueFailCount++;
      }
    }

    if (actualLabel === "UNCERTAIN") {
      uncertainCount++;
    }

    if (expectedLabel === "UNCERTAIN") {
      expectedUncertainCount++;
      if (actualLabel === "UNCERTAIN") {
        uncertaintyCorrectCount++;
      }
    }

    // Per-check stats
    const checkMetrics = perCheck[pair.case.checkType];
    if (checkMetrics) {
      checkMetrics.total++;
      if (isCorrect) {
        checkMetrics.correct++;
      }
    }

    const result: CaseEvaluationResult = {
      case: pair.case,
      actual: pair.actual,
      expectedLabel,
      actualLabel,
      isCorrect,
      isFalsePass,
      isFalseFail,
    };

    caseResults.push(result);
    if (!isCorrect) {
      failedCases.push(result);
    }
    if (isFalsePass) {
      falsePassCases.push(result);
    }
  }

  const totalCases = pairs.length;
  const verdictAccuracy = totalCases > 0 ? correctCases / totalCases : 0;
  const falsePassRate = totalCases > 0 ? falsePassCount / totalCases : 0;
  const falseFailRate = totalCases > 0 ? falseFailCount / totalCases : 0;
  const abstentionRate = totalCases > 0 ? uncertainCount / totalCases : 0;
  const passPrecision = actualPassCount > 0 ? truePassCount / actualPassCount : 1.0;
  const failPrecision = actualFailCount > 0 ? trueFailCount / actualFailCount : 1.0;
  const uncertaintyCorrectness =
    expectedUncertainCount > 0
      ? uncertaintyCorrectCount / expectedUncertainCount
      : 1.0;

  for (const checkType of SUPPORTED_INSPECTION_CHECKS) {
    const stat = perCheck[checkType];
    stat.accuracy = stat.total > 0 ? stat.correct / stat.total : 0;
  }

  return {
    totalCases,
    correctCases,
    verdictAccuracy,
    passPrecision,
    failPrecision,
    falsePassCount,
    falsePassRate,
    falseFailCount,
    falseFailRate,
    uncertainCount,
    abstentionRate,
    expectedUncertainCount,
    uncertaintyCorrectCount,
    uncertaintyCorrectness,
    perCheck,
    confusionMatrix,
    caseResults,
    failedCases,
    falsePassCases,
  };
}
