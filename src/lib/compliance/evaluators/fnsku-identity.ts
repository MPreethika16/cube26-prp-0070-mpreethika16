import type { FnskuObservation } from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import {
  checkRuleVisualSufficiency,
  checkTextEvidenceSufficiency,
} from "../evidence-sufficiency";

export interface EvaluateFnskuIdentityParams {
  checkId?: string;
  expectedFnsku: string;
  fnskuObservation: FnskuObservation;
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates FNSKU_IDENTITY compliance.
 *
 * Rules:
 * - Requires an ACTIVE, visually verifiable AuthoritativePrepRule.
 * - VISIBLE + LEGIBLE + detected value equals expected (exact match, safe whitespace trim)
 *   => PASS / REQUIREMENT_SATISFIED
 * - VISIBLE + LEGIBLE + detected value differs from expected
 *   => FAIL / EXPECTED_VALUE_MISMATCH
 * - UNCERTAIN visibility or legibility
 *   => UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - NOT_DETECTED
 *   => UNCERTAIN / FEATURE_NOT_DETECTED (Never FAIL merely from non-detection)
 * - ILLEGIBLE
 *   => UNCERTAIN / TEXT_ILLEGIBLE
 *
 * Never fuzzy-matches FNSKU identifiers.
 */
export function evaluateFnskuIdentity(
  params: EvaluateFnskuIdentityParams
): ComplianceCheckResult {
  const { expectedFnsku, fnskuObservation, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:FNSKU_IDENTITY`;

  // 1. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.detectedValue,
    });
  }

  // 2. Evidence sufficiency check
  const textSufficiency = checkTextEvidenceSufficiency(
    "FNSKU barcode label",
    fnskuObservation.visibility,
    fnskuObservation.legibility
  );

  if (!textSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: textSufficiency.reasonCode,
      explanation: textSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.detectedValue,
    });
  }

  // 3. Completeness safety gate (Day 5 / Step 7 Hardening)
  // Invariant: PASS is permitted ONLY when ALL are true:
  // - visibility === "VISIBLE"
  // - legibility === "LEGIBLE"
  // - valueCompleteness === "COMPLETE"
  // - detectedValue is non-null
  // - detectedValue exactly equals expected FNSKU
  // - evidence is sufficient
  //
  // If valueCompleteness is PARTIAL, UNCERTAIN, or missing (legacy observation),
  // exact FNSKU identity MUST NOT PASS.
  const completeness = fnskuObservation.valueCompleteness;
  if (completeness !== "COMPLETE") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        completeness === "PARTIAL"
          ? `FNSKU label is only partially visible or cropped; full character sequence cannot be visually verified (observed: "${fnskuObservation.detectedValue ?? "partial"}").`
          : completeness === "UNCERTAIN"
          ? "FNSKU label completeness is uncertain in photographic evidence."
          : "FNSKU observation lacks verified completeness metadata; cannot establish complete identity match.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.detectedValue,
    });
  }

  // 4. Exact normalized comparison
  const normalizedExpected = expectedFnsku.trim();
  const normalizedDetected = (fnskuObservation.detectedValue ?? "").trim();

  if (normalizedDetected === normalizedExpected) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_IDENTITY",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation: `Detected FNSKU "${normalizedDetected}" matches expected work-order FNSKU "${normalizedExpected}".`,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.detectedValue,
    });
  }

  // Positive contradictory evidence: FNSKU label is visible and legible, but has a different value
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "FNSKU_IDENTITY",
    applicability: "APPLICABLE",
    verdict: "FAIL",
    reasonCode: "EXPECTED_VALUE_MISMATCH",
    explanation: `Detected FNSKU "${normalizedDetected}" does not match expected work-order FNSKU "${normalizedExpected}".`,
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: fnskuObservation.evidence,
    observedValue: fnskuObservation.detectedValue,
  });
}
