import type {
  HandlingMarkObservation,
  VisualEvidence,
} from "../../vision/prep-observation.schema";
import { canonicalHandlingType } from "../../vision/observation-guards";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import type { WorkOrderSpecification } from "../work-order.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import { checkRuleVisualSufficiency } from "../evidence-sufficiency";

export interface EvaluateHandlingMarksParams {
  checkId?: string;
  workOrder: WorkOrderSpecification;
  handlingMarksObservations: HandlingMarkObservation[];
  rule: AuthoritativePrepRule;
}

/**
 * Evaluates HANDLING_MARKS compliance.
 *
 * Rules:
 * - Applicability sourced from workOrder.requirements.handlingMarks:
 *   - NOT_REQUIRED => applicability: NOT_APPLICABLE, verdict: null (NOT a PASS verdict)
 *   - UNKNOWN      => applicability: UNKNOWN, verdict: UNCERTAIN / REQUIREMENT_UNKNOWN
 *   - REQUIRED     => applicability: APPLICABLE
 * - For REQUIRED checks:
 *   - All required marks positively detected & legible => PASS / REQUIREMENT_SATISFIED
 *   - Any required mark cannot be verified => UNCERTAIN / FEATURE_NOT_DETECTED
 *   - CRITICAL: Never infer FAIL merely from non-detection.
 * - Rule guardrails: rule must be ACTIVE and visually verifiable.
 */
export function evaluateHandlingMarks(
  params: EvaluateHandlingMarksParams
): ComplianceCheckResult {
  const { workOrder, handlingMarksObservations, rule } = params;
  const checkId = params.checkId ?? `${rule.ruleId}:HANDLING_MARKS`;
  const handlingMarksReq = workOrder.requirements.handlingMarks;

  // Flatten all available handling mark evidence for traceability
  const allEvidence: VisualEvidence[] = handlingMarksObservations.flatMap(
    (obs) => obs.evidence
  );

  // 1. Work-order applicability
  if (handlingMarksReq.state === "NOT_REQUIRED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "HANDLING_MARKS",
      applicability: "NOT_APPLICABLE",
      verdict: null, // NOT_APPLICABLE is an applicability state, not a PASS verdict
      reasonCode: "NOT_APPLICABLE",
      explanation: "No handling marks are required by this work order.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: allEvidence,
      observedValue: "none_required",
    });
  }

  if (handlingMarksReq.state === "UNKNOWN") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "HANDLING_MARKS",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Work order handling marks requirement state is UNKNOWN; cannot evaluate compliance.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: allEvidence,
      observedValue: null,
    });
  }

  // 2. Rule guardrails
  const ruleSufficiency = checkRuleVisualSufficiency(rule);
  if (!ruleSufficiency.isSufficient) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "HANDLING_MARKS",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: ruleSufficiency.reasonCode,
      explanation: ruleSufficiency.explanation,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: allEvidence,
      observedValue: null,
    });
  }

  // 3. Verification of required marks
  const requiredMarks = handlingMarksReq.requiredMarks;
  if (requiredMarks.length === 0) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "HANDLING_MARKS",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Handling marks are marked REQUIRED by work order, but no specific marks were listed.",
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: allEvidence,
      observedValue: null,
    });
  }

  const unverifiedMarks: string[] = [];
  const verifiedMarks: string[] = [];
  const verifiedEvidence: VisualEvidence[] = [];

  for (const reqMark of requiredMarks) {
    const normalizedReq = reqMark.trim().toLowerCase();
    const matchingObs = handlingMarksObservations.find((obs) => {
      if (obs.visibility !== "VISIBLE" || obs.legibility === "ILLEGIBLE") return false;
      const observed = obs.detectedType.trim().toLowerCase();
      if (observed === normalizedReq) return true;
      const fromSticker = canonicalHandlingType(`${obs.detectedText || ""} ${obs.detectedType || ""}`);
      const required = canonicalHandlingType(reqMark) || normalizedReq;
      return fromSticker !== null && fromSticker === required;
    });

    if (matchingObs) {
      verifiedMarks.push(reqMark);
      verifiedEvidence.push(...matchingObs.evidence);
    } else {
      unverifiedMarks.push(reqMark);
    }
  }

  if (unverifiedMarks.length > 0) {
    // Non-detection must NOT be converted directly to FAIL
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "HANDLING_MARKS",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation: `Required handling mark(s) [${unverifiedMarks.join(
        ", "
      )}] were not positively verified in supplied photographs. Non-detection does not confirm physical absence.`,
      rule: {
        ruleId: rule.ruleId,
        version: rule.version,
      },
      evidence: allEvidence.length > 0 ? allEvidence : verifiedEvidence,
      observedValue:
        verifiedMarks.length > 0 ? verifiedMarks.join(", ") : "none_detected",
    });
  }

  // All required marks verified
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "HANDLING_MARKS",
    applicability: "APPLICABLE",
    verdict: "PASS",
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: `All required handling marks [${verifiedMarks.join(
      ", "
    )}] were positively detected and verified in photographs.`,
    rule: {
      ruleId: rule.ruleId,
      version: rule.version,
    },
    evidence: verifiedEvidence.length > 0 ? verifiedEvidence : allEvidence,
    observedValue: verifiedMarks.join(", "),
  });
}
