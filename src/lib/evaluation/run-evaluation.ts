import type { AuthoritativePrepRule } from "../compliance/authoritative-rule.schema";
import type { ExplicitPolicyResolutionContext } from "../compliance/requirement-resolver";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../compliance/rules/active-rules";
import { runPrepInspection } from "../inspection/run-prep-inspection";
import type { ComplianceCheckResult } from "../compliance/compliance-result.schema";
import {
  EVALUATION_DATASET,
} from "./evaluation-dataset";
import type { EvaluationCase } from "./evaluation-case.schema";
import {
  calculateEvaluationMetrics,
  type EvaluationMetrics,
} from "./evaluation-metrics";

export interface RunEvaluationOptions {
  dataset?: EvaluationCase[];
  rules?: readonly AuthoritativePrepRule[];
  policyContext?: ExplicitPolicyResolutionContext;
}

/**
 * Runs deterministic compliance evaluation across synthetic labeled cases.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Uses the SAME production requirement resolver, policy adapter, and evaluators
 *   via runPrepInspection.
 * - Does NOT create separate or divergent evaluation decision logic.
 * - Does NOT call Gemini or external network endpoints.
 * - Operates purely on deterministic fixture observations.
 */
export function runEvaluation(options?: RunEvaluationOptions): EvaluationMetrics {
  const dataset = options?.dataset ?? EVALUATION_DATASET;
  const rules = options?.rules ?? ACTIVE_RULES;
  const policyContext = options?.policyContext ?? PRODUCTION_POLICY_CONTEXT;

  const pairs: Array<{ case: EvaluationCase; actual: ComplianceCheckResult }> = [];

  for (const testCase of dataset) {
    const inspectionRecord = runPrepInspection({
      observation: testCase.observation,
      workOrder: testCase.workOrder,
      rules,
      policyContext,
    });

    const actual = inspectionRecord.checks.find(
      (c) => c.checkType === testCase.checkType
    );

    if (!actual) {
      throw new Error(
        `Evaluation runner error: check result for checkType "${testCase.checkType}" not found in inspection record for case "${testCase.caseId}".`
      );
    }

    pairs.push({
      case: testCase,
      actual,
    });
  }

  return calculateEvaluationMetrics(pairs);
}
