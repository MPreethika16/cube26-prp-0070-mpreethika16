import { z } from "zod";
import { workOrderSpecificationSchema } from "../compliance/work-order.schema";
import { prepUnitObservationSchema } from "../vision/prep-observation.schema";
import { operationalInspectionStatusSchema } from "../inspection/operational-status";
import {
  prepCheckTypeSchema,
  type PrepCheckType,
} from "../compliance/check-types";
import {
  complianceVerdictSchema,
  complianceReasonCodeSchema,
} from "../compliance/compliance-result.schema";
import { recoveryActionTypeSchema } from "../recovery/recovery-action.schema";

/**
 * ============================================================================
 * E2E ADVERSARIAL SCENARIO CONTRACT (DAY 5 / STEP 1)
 * ============================================================================
 *
 * Strongly-typed scenario specification defining complete operator flows,
 * expected deterministic compliance verdicts, operational aggregations,
 * recovery actions, and safety invariants.
 */

export const adversarialCategorySchema = z.enum([
  "HAPPY_PATH",
  "VISIBLE_DEFECT",
  "INSUFFICIENT_EVIDENCE",
  "AMBIGUOUS_EVIDENCE",
  "MULTIPLE_DEFECTS",
  "MIXED_FAIL_UNCERTAIN",
  "RECOVERY_SUCCESS",
  "RECOVERY_UNRESOLVED",
  "BAD_INPUT",
  "MODEL_FAILURE",
]);

export type AdversarialCategory = z.infer<typeof adversarialCategorySchema>;

export const expectedCheckOutcomeSchema = z.object({
  applicability: z.enum(["APPLICABLE", "NOT_APPLICABLE", "UNKNOWN"]).optional(),
  verdict: complianceVerdictSchema.nullable().optional(),
  reasonCode: complianceReasonCodeSchema.optional(),
  explanationSnippet: z.string().optional(),
});

export type ExpectedCheckOutcome = z.infer<typeof expectedCheckOutcomeSchema>;

export const expectedRecoveryExpectationSchema = z.object({
  requiresEvidence: z.boolean(),
  minActionCount: z.number().int().nonnegative().optional(),
  exactActionCount: z.number().int().nonnegative().optional(),
  expectedActionTypes: z.array(recoveryActionTypeSchema).optional(),
  resolvedCheckTypes: z.array(prepCheckTypeSchema).optional(),
});

export type ExpectedRecoveryExpectation = z.infer<
  typeof expectedRecoveryExpectationSchema
>;

export const adversarialScenarioSchema = z.object({
  scenarioId: z.string().min(1),
  description: z.string().min(1),
  category: adversarialCategorySchema,
  workOrder: workOrderSpecificationSchema,
  observationFixture: prepUnitObservationSchema.optional(),
  rawObservation: z.unknown().optional(),
  expectedOperationalStatus: operationalInspectionStatusSchema.optional(),
  expectedCriticalChecks: z
    .record(z.string(), expectedCheckOutcomeSchema)
    .optional(),
  expectedRecovery: expectedRecoveryExpectationSchema.optional(),
  expectedSafetyProperties: z.array(z.string()).default([]),
  expectedError: z
    .object({
      isExpected: z.boolean(),
      errorType: z.string().optional(),
      messageSnippet: z.string().optional(),
    })
    .optional(),
});

export type AdversarialScenario = Omit<
  z.infer<typeof adversarialScenarioSchema>,
  "expectedCriticalChecks"
> & {
  expectedCriticalChecks?: Partial<Record<PrepCheckType, ExpectedCheckOutcome>>;
};
