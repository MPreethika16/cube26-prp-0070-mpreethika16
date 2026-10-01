import { z } from "zod";
import {
  visibilitySchema,
  legibilitySchema,
  fnskuPlacementSchema,
  polybagSealStatusSchema,
  packagingTypeSchema,
} from "../prep-observation.schema";

/**
 * ============================================================================
 * VISION GROUND-TRUTH CONTRACT (DAY 3 / STEP 5)
 * ============================================================================
 *
 * Defines strictly factual, visually verifiable ground-truth schemas for physical
 * prep unit fixture photographs.
 *
 * MANDATORY PRINCIPLES:
 * - Describes ONLY visually verifiable facts from photographs.
 * - NEVER contains PASS/FAIL compliance verdicts.
 * - Supports "NOT_LABELED" for facts that cannot be objectively established.
 * ============================================================================
 */

export const groundTruthVisibilitySchema = z.union([
  visibilitySchema,
  z.literal("NOT_LABELED"),
]);
export type GroundTruthVisibility = z.infer<typeof groundTruthVisibilitySchema>;

export const groundTruthLegibilitySchema = z.union([
  legibilitySchema,
  z.literal("NOT_LABELED"),
]);
export type GroundTruthLegibility = z.infer<typeof groundTruthLegibilitySchema>;

export const groundTruthPlacementSchema = z.union([
  fnskuPlacementSchema,
  z.literal("NOT_LABELED"),
]);
export type GroundTruthPlacement = z.infer<typeof groundTruthPlacementSchema>;

export const groundTruthSealSchema = z.union([
  polybagSealStatusSchema,
  z.literal("NOT_LABELED"),
]);
export type GroundTruthSeal = z.infer<typeof groundTruthSealSchema>;

export const groundTruthPackagingTypeSchema = z.union([
  packagingTypeSchema,
  z.literal("NOT_LABELED"),
]);
export type GroundTruthPackagingType = z.infer<
  typeof groundTruthPackagingTypeSchema
>;

export const groundTruthManufacturerBarcodeSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  legibility: groundTruthLegibilitySchema.optional().default("NOT_LABELED"),
  detectedValue: z.union([z.string(), z.null(), z.literal("NOT_LABELED")]).optional().default("NOT_LABELED"),
});

export const groundTruthExpiryDateSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  legibility: groundTruthLegibilitySchema.optional().default("NOT_LABELED"),
  detectedValue: z.union([z.string(), z.null(), z.literal("NOT_LABELED")]).optional().default("NOT_LABELED"),
});

export const groundTruthFnskuSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  legibility: groundTruthLegibilitySchema.optional().default("NOT_LABELED"),
  detectedValue: z.union([z.string(), z.null(), z.literal("NOT_LABELED")]).optional().default("NOT_LABELED"),
  placement: groundTruthPlacementSchema.optional().default("NOT_LABELED"),
});

export const groundTruthPolybagSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  sealStatus: groundTruthSealSchema.optional().default("NOT_LABELED"),
  packagingType: groundTruthPackagingTypeSchema.optional().default("NOT_LABELED"),
});

export const groundTruthSuffocationWarningSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  legibility: groundTruthLegibilitySchema.optional().default("NOT_LABELED"),
  detectedText: z.union([z.string(), z.null(), z.literal("NOT_LABELED")]).optional().default("NOT_LABELED"),
});

export const groundTruthHandlingMarksSchema = z.object({
  visibility: groundTruthVisibilitySchema,
  expectedMarks: z.union([z.array(z.string()), z.literal("NOT_LABELED")]).default([]),
});

export const unitVisionGroundTruthSchema = z.object({
  unitId: z.string().min(1),
  description: z.string().min(1),
  manufacturerBarcode: groundTruthManufacturerBarcodeSchema,
  expiryDate: groundTruthExpiryDateSchema,
  fnsku: groundTruthFnskuSchema,
  polybag: groundTruthPolybagSchema,
  suffocationWarning: groundTruthSuffocationWarningSchema,
  handlingMarks: groundTruthHandlingMarksSchema,
});

export type UnitVisionGroundTruth = z.input<typeof unitVisionGroundTruthSchema>;
export type ValidatedUnitVisionGroundTruth = z.output<typeof unitVisionGroundTruthSchema>;
