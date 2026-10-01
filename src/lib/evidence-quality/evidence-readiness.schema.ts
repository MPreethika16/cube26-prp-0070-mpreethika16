import { z } from "zod";

/**
 * ============================================================================
 * EVIDENCE READINESS CONTRACT (DAY 4 / STEP 3)
 * ============================================================================
 *
 * Deterministic pre-inspection evidence quality verification.
 * Validates structural, transport, and resolution properties of supplied images
 * BEFORE calling the multimodal vision model or compliance engine.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Deterministic pure function: strictly ZERO AI/model calls.
 * - Does NOT infer semantic facts (e.g. does NOT check if barcode is readable).
 * - Does NOT produce compliance verdicts (PASS, FAIL, UNCERTAIN, NOT_APPLICABLE).
 * - WARNING state allows inspection to proceed (canInspect = true).
 * ============================================================================
 */

export const slotReadinessStatusSchema = z.enum([
  "READY",
  "WARNING",
  "MISSING",
]);

export type SlotReadinessStatus = z.infer<typeof slotReadinessStatusSchema>;

export const slotValidationResultSchema = z.object({
  slotId: z.string().min(1),
  status: slotReadinessStatusSchema,
  issues: z.array(z.string()),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  byteSize: z.number().int().nonnegative().optional(),
});

export type SlotValidationResult = z.infer<typeof slotValidationResultSchema>;

export const evidenceReadinessStatusSchema = z.enum([
  "READY",
  "WARNING",
  "NOT_READY",
]);

export type EvidenceReadinessStatus = z.infer<
  typeof evidenceReadinessStatusSchema
>;

export const evidenceReadinessEvaluationSchema = z.object({
  status: evidenceReadinessStatusSchema,
  slotStatuses: z.record(z.string(), slotValidationResultSchema),
  suppliedSlots: z.array(z.string()),
  missingSlots: z.array(z.string()),
  warnings: z.array(z.string()),
  canInspect: z.boolean(),
});

export type EvidenceReadinessEvaluation = z.infer<
  typeof evidenceReadinessEvaluationSchema
>;
