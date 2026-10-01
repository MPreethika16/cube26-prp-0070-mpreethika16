import type { ExpiryDateObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import {
  checkRuleVisualSufficiency,
  checkTextEvidenceSufficiency,
} from "../evidence-sufficiency";

export interface EvaluateExpiryVisibilityParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  expiryObservation: ExpiryDateObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates EXPIRY_VISIBILITY compliance.
 *
 * Rules:
 * - Applicability sourced from workOrder.requirements.expiryDate:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null (NOT a PASS verdict)
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN / REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - VISIBLE + LEGIBLE => PASS / REQUIREMENT_SATISFIED
 *   - UNCERTAIN visibility or legibility => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 *   - NOT_DETECTED => UNCERTAIN / FEATURE_NOT_DETECTED (Never FAIL merely from non-detection)
 *   - ILLEGIBLE => UNCERTAIN / TEXT_ILLEGIBLE
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 *
 * Note: Does NOT evaluate chronological date validity (Day 2 Step 4 focuses on visibility/legibility only).
 */
export function evaluateExpiryVisibility(
  params: EvaluateExpiryVisibilityParams
): ComplianceCheckResult {
  const { workOrder, expiryObservation, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:EXPIRY_VISIBILITY`;
  const requirementState = workOrder.requirements.expiryDate;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_VISIBILITY",
      applicability: "NOT_APPLICABLE",
      verdict: null, // NOT_APPLICABLE is an applicability state, not a PASS verdict
      reasonCode: "NOT_APPLICABLE",
      explanation: "Expiry date labeling is not required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.detectedValue,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_VISIBILITY",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order expiry date requirement state is UNKNOWN; cannot evaluate compliance.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.detectedValue,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_VISIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.detectedValue,
    });
  }

  // 3. Evidence sufficiency check
  const textSufficiency = checkTextEvidenceSufficiency(
    "Expiry date",
    expiryObservation.visibility,
    expiryObservation.legibility
  );

  if (!textSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_VISIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: textSufficiency.reasonCode,
      explanation: textSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.detectedValue,
    });
  }

  // 4. Feature is visible and legible
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "EXPIRY_VISIBILITY",
    applicability: "APPLICABLE",
    verdict: "PASS",
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: `Expiry date is visibly present and legible in photographs (detected value: "${expiryObservation.detectedValue ?? "present"}").`,
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: expiryObservation.evidence,
    observedValue: expiryObservation.detectedValue,
  });
}
