import type { PolybagObservation } from "../../vision/prep-observation.schema";
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

export interface EvaluatePolybagPresenceParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  polybagObservation: PolybagObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates POLYBAG_PRESENCE compliance.
 *
 * Rules:
 * - Applicability sourced from workOrder.requirements.polybag:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null, reasonCode: NOT_APPLICABLE
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN, reasonCode: REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - VISIBLE      => PASS / REQUIREMENT_SATISFIED
 *   - NOT_DETECTED => UNCERTAIN / FEATURE_NOT_DETECTED (Never turn NOT_DETECTED into FAIL)
 *   - UNCERTAIN    => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluatePolybagPresence(
  params: EvaluatePolybagPresenceParams
): ComplianceCheckResult {
  const { workOrder, polybagObservation, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:POLYBAG_PRESENCE`;
  const requirementState = workOrder.requirements.polybag;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_PRESENCE",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation: "Polybag packaging is not required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.visibility,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_PRESENCE",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order polybag requirement state is UNKNOWN; cannot evaluate compliance.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.visibility,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_PRESENCE",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.visibility,
    });
  }

  // 3. Evidence sufficiency check
  const presenceSufficiency = checkPresenceEvidenceSufficiency(
    "Polybag",
    polybagObservation.visibility
  );

  if (!presenceSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_PRESENCE",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: presenceSufficiency.reasonCode,
      explanation: presenceSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.visibility,
    });
  }

  // 4. Feature is visible
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "POLYBAG_PRESENCE",
    applicability: "APPLICABLE",
    verdict: "PASS",
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: "Polybag is visibly detected on the physical unit.",
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: polybagObservation.evidence,
    observedValue: polybagObservation.visibility,
  });
}
