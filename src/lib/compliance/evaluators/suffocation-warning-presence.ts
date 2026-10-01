import type { SuffocationWarningObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import {
  checkRuleVisualSufficiency,
  checkPresenceEvidenceSufficiency,
} from "../evidence-sufficiency";

export interface EvaluateSuffocationWarningPresenceParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  suffocationWarningObservation: SuffocationWarningObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates SUFFOCATION_WARNING_PRESENCE compliance.
 *
 * Rules:
 * - Applicability sourced strictly from workOrder.requirements.suffocationWarning:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null, reasonCode: NOT_APPLICABLE
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN, reasonCode: REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - CRITICAL: Do NOT infer whether a warning is required from bag dimensions, product appearance,
 *   or model memory. Applicability comes purely from work-order intent and authoritative rules.
 * - For REQUIRED checks:
 *   - VISIBLE      => PASS / REQUIREMENT_SATISFIED
 *   - NOT_DETECTED => UNCERTAIN / FEATURE_NOT_DETECTED (Never turn NOT_DETECTED into FAIL)
 *   - UNCERTAIN    => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluateSuffocationWarningPresence(
  params: EvaluateSuffocationWarningPresenceParams
): ComplianceCheckResult {
  const { workOrder, suffocationWarningObservation, rule } = params;
  const checkId =
    params.checkId ?? `${rule.ruleId}:SUFFOCATION_WARNING_PRESENCE`;
  const requirementState = workOrder.requirements.suffocationWarning;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation:
        "Suffocation warning is not required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.visibility,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order suffocation warning requirement state is UNKNOWN; cannot evaluate compliance.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.visibility,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.visibility,
    });
  }

  // 3. Evidence sufficiency
  const presenceSufficiency = checkPresenceEvidenceSufficiency(
    "Suffocation warning",
    suffocationWarningObservation.visibility
  );

  if (!presenceSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: presenceSufficiency.reasonCode,
      explanation: presenceSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.visibility,
    });
  }

  // 4. Feature is visible
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    applicability: "APPLICABLE",
    verdict: "PASS",
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation:
      "Suffocation warning is visibly detected on the packaged unit.",
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: suffocationWarningObservation.evidence,
    observedValue: suffocationWarningObservation.visibility,
  });
}
