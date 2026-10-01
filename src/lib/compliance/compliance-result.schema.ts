import { z } from "zod";
import { prepCheckTypeSchema } from "./check-types";
import { visualEvidenceSchema } from "../vision/prep-observation.schema";

/**
 * ============================================================================
 * COMPLIANCE RESULT CONTRACT
 * ============================================================================
 *
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 *
 * 1. NOT_APPLICABLE is an applicability state, NOT a PASS verdict.
 *    If an operation or feature is not required by policy or work order,
 *    verdict is null.
 *
 * 2. Visual evidence sufficiency must precede compliance verdicts.
 *    NOT_DETECTED means "not detected in supplied photographs", NOT "does not exist".
 *    NOT_DETECTED on a required feature produces UNCERTAIN, never FAIL, unless
 *    explicit positive contradictory evidence is physically observed.
 *
 * 3. Every compliance check references the exact AuthoritativePrepRule
 *    (ruleId and version) from which it derives.
 * ============================================================================
 */

export const complianceApplicabilitySchema = z.enum([
  "APPLICABLE",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);

export type ComplianceApplicability = z.infer<
  typeof complianceApplicabilitySchema
>;

export const complianceVerdictSchema = z.enum(["PASS", "FAIL", "UNCERTAIN"]);

export type ComplianceVerdict = z.infer<typeof complianceVerdictSchema>;

export const complianceReasonCodeSchema = z.enum([
  "NOT_APPLICABLE",
  "REQUIREMENT_SATISFIED",
  "REQUIREMENT_VIOLATED",
  "INSUFFICIENT_VISUAL_EVIDENCE",
  "REQUIREMENT_UNKNOWN",
  "FEATURE_NOT_DETECTED",
  "TEXT_ILLEGIBLE",
  "EXPECTED_VALUE_MISMATCH",
  "PLACEMENT_INVALID",
  "RULE_UNAVAILABLE",
  "RULE_NOT_VISUALLY_VERIFIABLE",
]);

export type ComplianceReasonCode = z.infer<typeof complianceReasonCodeSchema>;

export const ruleReferenceSchema = z.object({
  ruleId: z.string().min(1),
  version: z.string().min(1),
});

export type RuleReference = z.infer<typeof ruleReferenceSchema>;

/**
 * Result of evaluating one check against visual observations, work-order intent,
 * and authoritative rule metadata.
 */
export const complianceCheckResultSchema = z
  .object({
    checkId: z.string().min(1),
    checkType: prepCheckTypeSchema,
    applicability: complianceApplicabilitySchema,
    /**
     * Verdict is nullable.
     * When applicability is NOT_APPLICABLE, verdict MUST be null.
     * When applicability is APPLICABLE or UNKNOWN, verdict MUST be PASS, FAIL, or UNCERTAIN.
     */
    verdict: complianceVerdictSchema.nullable(),
    reasonCode: complianceReasonCodeSchema,
    explanation: z.string().min(1),
    rule: ruleReferenceSchema,
    evidence: z.array(visualEvidenceSchema),
    observedValue: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.applicability === "NOT_APPLICABLE") {
      if (data.verdict !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Verdict must be null when applicability is NOT_APPLICABLE. NOT_APPLICABLE is not a PASS verdict.",
          path: ["verdict"],
        });
      }
    } else {
      if (data.verdict === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Verdict must not be null when applicability is APPLICABLE or UNKNOWN.",
          path: ["verdict"],
        });
      }
    }
  });

export type ComplianceCheckResult = z.infer<typeof complianceCheckResultSchema>;
