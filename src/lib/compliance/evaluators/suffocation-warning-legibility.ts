import type { SuffocationWarningObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import { checkRuleVisualSufficiency } from "../evidence-sufficiency";

export interface EvaluateSuffocationWarningLegibilityParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  suffocationWarningObservation: SuffocationWarningObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates SUFFOCATION_WARNING_LEGIBILITY compliance.
 *
 * Rules:
 * - Applicability sourced strictly from workOrder.requirements.suffocationWarning:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null, reasonCode: NOT_APPLICABLE
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN, reasonCode: REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - NOT_DETECTED => UNCERTAIN / FEATURE_NOT_DETECTED
 *   - UNCERTAIN visibility => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 *   - VISIBLE + LEGIBLE => PASS / REQUIREMENT_SATISFIED
 *   - VISIBLE + ILLEGIBLE => FAIL / TEXT_ILLEGIBLE
 *     (FAIL is permitted for ILLEGIBLE because blurry or unreadable print is positive
 *      visual evidence of defect, not an inferred absence)
 *   - VISIBLE + UNCERTAIN legibility => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluateSuffocationWarningLegibility(
  params: EvaluateSuffocationWarningLegibilityParams
): ComplianceCheckResult {
  const { workOrder, suffocationWarningObservation, rule } = params;
  const checkId =
    params.checkId ?? `${rule.ruleId}:SUFFOCATION_WARNING_LEGIBILITY`;
  const requirementState = workOrder.requirements.suffocationWarning;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
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
      observedValue: suffocationWarningObservation.legibility,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order suffocation warning requirement state is UNKNOWN; cannot evaluate legibility.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.legibility,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: suffocationWarningObservation.legibility,
    });
  }

  // 3. Evidence sufficiency on visibility
  if (suffocationWarningObservation.visibility === "NOT_DETECTED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation:
        "Suffocation warning was not detected in supplied photographs; legibility cannot be evaluated.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: null,
    });
  }

  if (suffocationWarningObservation.visibility === "UNCERTAIN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        "Suffocation warning visibility is uncertain; legibility cannot be reliably established.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: null,
    });
  }

  // 4. Warning is VISIBLE: evaluate legibility
  if (suffocationWarningObservation.legibility === "LEGIBLE") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation:
        "Suffocation warning is visibly present and legible in photographs.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue:
        suffocationWarningObservation.detectedText ?? "LEGIBLE",
    });
  }

  if (suffocationWarningObservation.legibility === "ILLEGIBLE") {
    // Semantic Boundary (Day 5 / Step 2):
    // Visual ILLEGIBLE means supplied photographs cannot establish readability
    // (due to resolution, blur, angle, or glare). We do not infer physical print damage
    // without affirmative defect proof; therefore, emit UNCERTAIN to request recovery recapture.
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
      explanation:
        "Suffocation warning is visibly present but cannot be legibly read in photographs. Evidence cannot establish readability.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: suffocationWarningObservation.evidence,
      observedValue: "ILLEGIBLE",
    });
  }

  // legibility === "UNCERTAIN"
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    applicability: "APPLICABLE",
    verdict: "UNCERTAIN",
    reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    explanation:
      "Suffocation warning legibility is visually uncertain in photographs.",
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: suffocationWarningObservation.evidence,
    observedValue: null,
  });
}
