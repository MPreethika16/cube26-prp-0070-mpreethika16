import type { PolybagObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import { checkRuleVisualSufficiency } from "../evidence-sufficiency";

export interface EvaluatePolybagSealParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  polybagObservation: PolybagObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates POLYBAG_SEAL compliance.
 *
 * Rules:
 * - Applicability sourced from workOrder.requirements.polybag:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null, reasonCode: NOT_APPLICABLE
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN, reasonCode: REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - Polybag NOT_DETECTED or UNCERTAIN => UNCERTAIN (do not evaluate seal when bag itself cannot be observed)
 *   - Polybag VISIBLE + sealStatus SEALED => PASS / REQUIREMENT_SATISFIED
 *   - Polybag VISIBLE + sealStatus NOT_SEALED => FAIL / REQUIREMENT_VIOLATED (positive contradictory evidence)
 *   - Polybag VISIBLE + sealStatus UNCERTAIN => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluatePolybagSeal(
  params: EvaluatePolybagSealParams
): ComplianceCheckResult {
  const { workOrder, polybagObservation, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:POLYBAG_SEAL`;
  const requirementState = workOrder.requirements.polybag;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation: "Polybag packaging is not required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order polybag requirement state is UNKNOWN; cannot evaluate seal status.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  // 3. Evidence sufficiency: Do not evaluate seal when the bag itself cannot be reliably observed
  if (polybagObservation.visibility === "NOT_DETECTED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation:
        "Polybag was not detected in supplied photographs; cannot evaluate whether a seal is present.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  if (polybagObservation.visibility === "UNCERTAIN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        "Polybag visibility is uncertain in photographs; cannot reliably assess seal status.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  // 4. Bag is visible, evaluate sealStatus
  if (polybagObservation.sealStatus === "SEALED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation: "Polybag is visibly sealed and closed.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  if (polybagObservation.sealStatus === "NOT_SEALED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "POLYBAG_SEAL",
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
      explanation:
        "Polybag is visibly unsealed, open, or unclosed (positive contradictory visual evidence).",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: polybagObservation.evidence,
      observedValue: polybagObservation.sealStatus,
    });
  }

  // sealStatus is UNCERTAIN
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "POLYBAG_SEAL",
    applicability: "APPLICABLE",
    verdict: "UNCERTAIN",
    reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    explanation:
      "Polybag seal status is visually uncertain in the provided photographs.",
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: polybagObservation.evidence,
    observedValue: polybagObservation.sealStatus,
  });
}
