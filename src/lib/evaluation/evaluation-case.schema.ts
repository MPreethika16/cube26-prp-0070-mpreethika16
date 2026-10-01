import { z } from "zod";
import { prepCheckTypeSchema } from "../compliance/check-types";
import { prepUnitObservationSchema } from "../vision/prep-observation.schema";
import { workOrderSpecificationSchema } from "../compliance/work-order.schema";
import {
  complianceApplicabilitySchema,
  complianceVerdictSchema,
  complianceReasonCodeSchema,
} from "../compliance/compliance-result.schema";

/**
 * ============================================================================
 * EVALUATION CASE CONTRACT (DAY 3 / STEP 4)
 * ============================================================================
 *
 * Defines the schema for labeled synthetic evaluation fixtures used to measure
 * whether Prep Manager's compliance decisions are correct and conservative.
 *
 * Strict separation:
 * - Synthetic test fixtures, NOT production observations.
 * - Does not call Gemini (perception evaluated separately).
 * - Enforces conservative behavior and safety-first metrics.
 * ============================================================================
 */

export const evaluationCategorySchema = z.enum([
  "HAPPY_PATH",
  "POSITIVE_DEFECT",
  "INSUFFICIENT_EVIDENCE",
  "NOT_APPLICABLE",
  "POLICY_GAP",
  "AMBIGUOUS_VISUAL",
]);

export type EvaluationCategory = z.infer<typeof evaluationCategorySchema>;

export const expectedOutcomeSchema = z
  .object({
    applicability: complianceApplicabilitySchema,
    verdict: complianceVerdictSchema.nullable(),
    reasonCode: complianceReasonCodeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.applicability === "NOT_APPLICABLE") {
      if (data.verdict !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Expected verdict must be null when applicability is NOT_APPLICABLE. NOT_APPLICABLE is an applicability state, not PASS.",
          path: ["verdict"],
        });
      }
    } else {
      if (data.verdict === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Expected verdict must not be null when applicability is APPLICABLE or UNKNOWN.",
          path: ["verdict"],
        });
      }
    }
  });

export type ExpectedOutcome = z.infer<typeof expectedOutcomeSchema>;

export const evaluationCaseSchema = z.object({
  caseId: z.string().min(1),
  description: z.string().min(1),
  checkType: prepCheckTypeSchema,
  observation: prepUnitObservationSchema,
  workOrder: workOrderSpecificationSchema,
  expected: expectedOutcomeSchema,
  category: evaluationCategorySchema,
});

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const evaluationDatasetSchema = z.array(evaluationCaseSchema);
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;
