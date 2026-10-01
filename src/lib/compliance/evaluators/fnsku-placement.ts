import type {
  FnskuObservation,
  FnskuPlacement,
} from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import type {
  PolicyPlacementSurface,
  ResolvedFnskuPlacementRequirement,
} from "../resolved-requirement.schema";

export interface EvaluateFnskuPlacementParams {
  checkId?: string;
  requirement?: ResolvedFnskuPlacementRequirement;
  rule?: AuthoritativePrepRule;
  fnskuObservation: FnskuObservation;
}

/**
 * Evaluates FNSKU_PLACEMENT compliance against a ResolvedFnskuPlacementRequirement.
 *
 * Rules:
 * - applicability NOT_APPLICABLE => verdict null, reasonCode NOT_APPLICABLE
 * - applicability UNKNOWN => verdict UNCERTAIN, reasonCode REQUIREMENT_UNKNOWN
 * - placement UNCERTAIN or visibility UNCERTAIN/NOT_DETECTED => UNCERTAIN
 * - placement explicitly in allowedPlacements => PASS / REQUIREMENT_SATISFIED
 * - placement explicitly in prohibitedPlacements => FAIL / PLACEMENT_INVALID
 * - placement OTHER or not covered by resolved semantics => UNCERTAIN
 * - Preserves ruleRef throughout the entire chain.
 */
export function evaluateFnskuPlacement(
  params: EvaluateFnskuPlacementParams
): ComplianceCheckResult {
  const { fnskuObservation } = params;

  // Handle case where rule was passed without resolved requirement (unresolved semantics guardrail)
  if (!params.requirement) {
    const ruleRef = params.rule
      ? { ruleId: params.rule.ruleId, version: params.rule.version }
      : { ruleId: "UNRESOLVED_RULE", version: "unknown" };

    const checkId = params.checkId ?? `${ruleRef.ruleId}:FNSKU_PLACEMENT`;

    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "RULE_UNAVAILABLE",
      explanation:
        "Authoritative placement criteria (allowed/prohibited surfaces) are not yet formally encoded in the rule contract. Observation category alone ('" +
        fnskuObservation.placement +
        "') does not establish compliance policy.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.placement,
    });
  }

  const requirement = params.requirement;
  const ruleRef = requirement.ruleRef;
  const checkId = params.checkId ?? `${ruleRef.ruleId}:FNSKU_PLACEMENT`;

  // 1. Applicability
  if (requirement.applicability === "NOT_APPLICABLE") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation: "FNSKU placement verification is not applicable for this unit.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.placement,
    });
  }

  if (requirement.applicability === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation: "FNSKU placement requirement applicability is UNKNOWN.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: fnskuObservation.placement,
    });
  }

  // 2. FNSKU visibility sufficiency
  if (fnskuObservation.visibility === "NOT_DETECTED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation:
        "FNSKU barcode was not detected in supplied photographs; placement cannot be evaluated.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: null,
    });
  }

  if (fnskuObservation.visibility === "UNCERTAIN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        "FNSKU visibility is uncertain; placement geometry cannot be reliably established.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: null,
    });
  }

  // 3. Placement observation sufficiency
  if (fnskuObservation.placement === "UNCERTAIN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation:
        "FNSKU physical placement is visually uncertain in photographs.",
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: "UNCERTAIN",
    });
  }

  // 4. Evaluate against resolved placement policy
  const placement = fnskuObservation.placement as FnskuPlacement;
  const isAllowed = requirement.allowedPlacements.includes(
    placement as PolicyPlacementSurface
  );

  if (isAllowed) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation: `FNSKU placement "${placement}" is explicitly permitted by authoritative rule ${ruleRef.ruleId}.`,
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: placement,
    });
  }

  const isProhibited = requirement.prohibitedPlacements.includes(
    placement as PolicyPlacementSurface
  );

  if (isProhibited) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "FNSKU_PLACEMENT",
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "PLACEMENT_INVALID",
      explanation: `FNSKU placement "${placement}" is explicitly prohibited by authoritative rule ${ruleRef.ruleId} (prohibited surfaces: [${requirement.prohibitedPlacements.join(
        ", "
      )}]).`,
      rule: ruleRef,
      evidence: fnskuObservation.evidence,
      observedValue: placement,
    });
  }

  // Placement OTHER or any placement not explicitly covered by resolved semantics
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "FNSKU_PLACEMENT",
    applicability: "APPLICABLE",
    verdict: "UNCERTAIN",
    reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    explanation: `FNSKU placement "${placement}" is not explicitly covered by the resolved placement semantics of rule ${ruleRef.ruleId}.`,
    rule: ruleRef,
    evidence: fnskuObservation.evidence,
    observedValue: placement,
  });
}
