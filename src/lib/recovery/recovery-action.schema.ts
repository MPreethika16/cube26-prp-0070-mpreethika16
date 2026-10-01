import { z } from "zod";
import { prepCheckTypeSchema } from "../compliance/check-types";
import { complianceReasonCodeSchema } from "../compliance/compliance-result.schema";

/**
 * ============================================================================
 * EVIDENCE RECOVERY ACTION CONTRACT (DAY 4 / STEP 2)
 * ============================================================================
 *
 * Captures actionable, operator-facing recommendations to collect additional
 * or clearer visual evidence when compliance checks return UNCERTAIN.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - This layer provides photographic recapture guidance ONLY.
 * - It MUST NOT alter compliance verdicts (PASS, FAIL, UNCERTAIN, NOT_APPLICABLE).
 * - It MUST NOT perform compliance reasoning.
 * - It is strictly deterministic with zero arbitrary prose parsing.
 * ============================================================================
 */

export const recoveryActionTypeSchema = z.enum([
  "RECAPTURE_FRONT",
  "RECAPTURE_BACK",
  "RECAPTURE_LABEL",
  "CAPTURE_CLOSEUP",
  "CAPTURE_FULL_PACKAGE",
  "HUMAN_REVIEW",
]);

export type RecoveryActionType = z.infer<typeof recoveryActionTypeSchema>;

export const recoveryPrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export type RecoveryPriority = z.infer<typeof recoveryPrioritySchema>;

export const evidenceRecoveryActionSchema = z.object({
  /** Primary check type prompting this recovery action */
  checkType: prepCheckTypeSchema,
  /** All check types that could be resolved by this single piece of evidence */
  resolvesCheckTypes: z.array(prepCheckTypeSchema).min(1),
  /** Compliance reason code from the underlying check */
  reason: complianceReasonCodeSchema,
  /** High-level photographic capture action */
  actionType: recoveryActionTypeSchema,
  /** Specific physical feature to focus on (e.g. "FNSKU label", "bag seal") */
  target: z.string().min(1),
  /** Concrete warehouse floor instruction for the operator */
  instruction: z.string().min(1),
  /** Prioritization level based on multi-check resolution potential */
  priority: recoveryPrioritySchema,
  /** Recommended camera view slot if applicable ("front" | "back" | "label") */
  suggestedSlot: z.enum(["front", "back", "label"]).optional(),
});

export type EvidenceRecoveryAction = z.infer<
  typeof evidenceRecoveryActionSchema
>;

export const evidenceRecoveryPlanSchema = z.object({
  unitId: z.string().min(1),
  requiresEvidence: z.boolean(),
  uncertainCheckCount: z.number().int().nonnegative(),
  actions: z.array(evidenceRecoveryActionSchema),
});

export type EvidenceRecoveryPlan = z.infer<typeof evidenceRecoveryPlanSchema>;
