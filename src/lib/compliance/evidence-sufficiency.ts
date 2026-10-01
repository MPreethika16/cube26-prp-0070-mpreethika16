import type { Visibility, Legibility } from "../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "./authoritative-rule.schema";
import type { ComplianceReasonCode } from "./compliance-result.schema";

/**
 * ============================================================================
 * EVIDENCE SUFFICIENCY EVALUATION
 * ============================================================================
 *
 * ARCHITECTURAL PRINCIPLE:
 * Evidence sufficiency must be evaluated BEFORE compliance verdicts are made.
 *
 * Rules:
 * 1. UNCERTAIN observation -> insufficient evidence.
 * 2. ILLEGIBLE text -> insufficient evidence for checks requiring readable text.
 * 3. NOT_DETECTED must NOT automatically establish physical absence.
 *    NOT_DETECTED means only: "not detected in supplied visual evidence".
 *    On a REQUIRED feature, NOT_DETECTED results in UNCERTAIN, never FAIL,
 *    unless another explicit observation positively establishes a physical contradiction.
 * 4. NOT_VISUALLY_VERIFIABLE authoritative rules can never produce PASS or FAIL.
 * 5. Deterministic logic only: no model confidence scores and no additional LLM calls.
 * ============================================================================
 */

export interface EvidenceSufficiencyResult {
  isSufficient: boolean;
  reasonCode: ComplianceReasonCode;
  explanation: string;
}

/**
 * Checks whether an authoritative rule can be evaluated against photographic visual evidence.
 *
 * Enforces rule status and visual verifiability guardrails:
 * - ACTIVE status required (SUPERSEDED or UNVERIFIED rules cannot produce PASS/FAIL).
 * - NOT_VISUALLY_VERIFIABLE rules cannot produce PASS/FAIL.
 */
export function checkRuleVisualSufficiency(
  rule: AuthoritativePrepRule
): EvidenceSufficiencyResult {
  if (rule.status !== "ACTIVE") {
    return {
      isSufficient: false,
      reasonCode: "RULE_UNAVAILABLE",
      explanation: `Rule ${rule.ruleId} is not ACTIVE (current status: ${rule.status}). Inactive or unverified rules cannot produce compliance verdicts.`,
    };
  }

  if (rule.verification.visualVerifiability === "NOT_VISUALLY_VERIFIABLE") {
    return {
      isSufficient: false,
      reasonCode: "RULE_NOT_VISUALLY_VERIFIABLE",
      explanation: `Rule ${rule.ruleId} is designated NOT_VISUALLY_VERIFIABLE and cannot be evaluated from camera photographs alone.`,
    };
  }

  return {
    isSufficient: true,
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: `Rule ${rule.ruleId} is active and visually verifiable (${rule.verification.visualVerifiability}).`,
  };
}

/**
 * Checks visual sufficiency for a feature requiring legible text reading (e.g., FNSKU, Expiry Date).
 */
export function checkTextEvidenceSufficiency(
  featureName: string,
  visibility: Visibility,
  legibility: Legibility
): EvidenceSufficiencyResult {
  if (visibility === "UNCERTAIN") {
    return {
      isSufficient: false,
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation: `Visual evidence is uncertain regarding ${featureName} visibility.`,
    };
  }

  if (visibility === "NOT_DETECTED") {
    return {
      isSufficient: false,
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation: `${featureName} was not detected in supplied photographs. This does not confirm physical absence.`,
    };
  }

  if (legibility === "ILLEGIBLE") {
    return {
      isSufficient: false,
      reasonCode: "TEXT_ILLEGIBLE",
      explanation: `${featureName} is visible in photographs but cannot be legibly read.`,
    };
  }

  if (legibility === "UNCERTAIN") {
    return {
      isSufficient: false,
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation: `Legibility of visible ${featureName} is uncertain in photographs.`,
    };
  }

  return {
    isSufficient: true,
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: `${featureName} is visibly detected and legible in supplied photographs.`,
  };
}

/**
 * Checks visual sufficiency for a feature presence check (where text content is not strictly required).
 */
export function checkPresenceEvidenceSufficiency(
  featureName: string,
  visibility: Visibility
): EvidenceSufficiencyResult {
  if (visibility === "UNCERTAIN") {
    return {
      isSufficient: false,
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      explanation: `Visual evidence is uncertain regarding ${featureName} presence.`,
    };
  }

  if (visibility === "NOT_DETECTED") {
    return {
      isSufficient: false,
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation: `${featureName} was not detected in supplied photographs. This does not confirm physical absence.`,
    };
  }

  return {
    isSufficient: true,
    reasonCode: "REQUIREMENT_SATISFIED",
    explanation: `${featureName} is visibly detected in supplied photographs.`,
  };
}
