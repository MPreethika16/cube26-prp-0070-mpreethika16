import type { ExpiryDateObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import { checkRuleVisualSufficiency } from "../evidence-sufficiency";

export interface EvaluateExpiryLegibilityParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  expiryObservation: ExpiryDateObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates EXPIRY_LEGIBILITY compliance.
 *
 * Rules:
 * - Implemented separately from EXPIRY_VISIBILITY.
 * - Applicability sourced from workOrder.requirements.expiryDate:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null, reasonCode: NOT_APPLICABLE
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN, reasonCode: REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - NOT_DETECTED => UNCERTAIN / FEATURE_NOT_DETECTED
 *   - UNCERTAIN visibility => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 *   - VISIBLE + LEGIBLE => PASS / REQUIREMENT_SATISFIED
 *   - VISIBLE + ILLEGIBLE => FAIL / TEXT_ILLEGIBLE (Positive visual defect evidence)
 *   - VISIBLE + UNCERTAIN legibility => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - CRITICAL BOUNDARY:
 *   - Do NOT validate whether the product is expired.
 *   - Do NOT parse expiration chronology or calendar math.
 *   - Do NOT compare against today's date or inbound delivery windows.
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluateExpiryLegibility(
  params: EvaluateExpiryLegibilityParams
): ComplianceCheckResult {
  const { workOrder, expiryObservation, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:EXPIRY_LEGIBILITY`;
  const requirementState = workOrder.requirements.expiryDate;

  // 1. Work-order applicability
  if (requirementState === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation: "Expiry date labeling is not required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.legibility,
    });
  }

  if (requirementState === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order expiry date requirement state is UNKNOWN; cannot evaluate legibility.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.legibility,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.legibility,
    });
  }

  // 3. Evidence sufficiency on visibility
  if (expiryObservation.visibility === "NOT_DETECTED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation:
        "Expiry date was not detected in supplied photographs; legibility cannot be evaluated.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: null,
    });
  }

  if (expiryObservation.visibility === "UNCERTAIN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        "Expiry date visibility is uncertain; legibility cannot be reliably established.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: null,
    });
  }

  // 4. Feature is VISIBLE: evaluate legibility
  if (expiryObservation.legibility === "LEGIBLE") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation:
        "Expiry date is visibly present and legible in photographs.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: expiryObservation.detectedValue ?? "LEGIBLE",
    });
  }

  if (expiryObservation.legibility === "ILLEGIBLE") {
    // Semantic Boundary (Day 5 / Step 2):
    // Visual ILLEGIBLE means supplied photographs cannot establish readability
    // (due to resolution, blur, angle, or glare). We do not infer physical print damage
    // without affirmative defect proof; therefore, emit UNCERTAIN to request recovery recapture.
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "EXPIRY_LEGIBILITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
      explanation:
        "Expiry date is visible but cannot be legibly read in photographs. Evidence cannot establish readability.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: expiryObservation.evidence,
      observedValue: "ILLEGIBLE",
    });
  }

  // legibility === "UNCERTAIN"
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "EXPIRY_LEGIBILITY",
    applicability: "APPLICABLE",
    verdict: "UNCERTAIN",
    reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    explanation:
      "Expiry date legibility is visually uncertain in photographs.",
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: expiryObservation.evidence,
    observedValue: null,
  });
}
