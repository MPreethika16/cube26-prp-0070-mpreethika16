import { z } from "zod";
import { imageQualitySchema } from "../vision/prep-observation.schema";
import { complianceCheckResultSchema } from "../compliance/compliance-result.schema";

/**
 * ============================================================================
 * PREP INSPECTION RECORD CONTRACT
 * ============================================================================
 *
 * Captures the complete, deterministic vertical inspection slice of a prepped
 * unit, preserving factual visual observation metadata, work-order catalog
 * identity, and individual compliance check evaluations.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Does NOT include an overall PASS/FAIL judgment.
 * - Does NOT include operator overrides.
 * - Does NOT include artificial confidence scores.
 * - Preserves individual check results exactly as evaluated.
 * ============================================================================
 */

export const inspectionMetadataSchema = z.object({
  /** ISO 8601 UTC timestamp of when the inspection orchestration completed */
  inspectedAt: z.string().datetime(),
  /** Multimodal visual perception model used to extract observations */
  visionModel: z.string().min(1),
  /** Number of batched vision requests executed (must be 1 for CUBE units) */
  visionRequestCount: z.number().int().min(1),
});

export type InspectionMetadata = z.infer<typeof inspectionMetadataSchema>;

export const prepInspectionRecordSchema = z.object({
  /** Unique inspection record identifier */
  inspectionId: z.string().min(1),
  /** Unit identifier */
  unitId: z.string().min(1),
  /** Originating work order identifier */
  workOrderId: z.string().min(1),
  /** Catalog Merchant SKU */
  sku: z.string().min(1),
  /** Amazon Standard Identification Number */
  asin: z.string().min(1),
  /** Day-1 visual image quality assessment (preserved, does not alter verdicts) */
  imageQuality: imageQualitySchema,
  /** Individual compliance check evaluations across all supported check types */
  checks: z.array(complianceCheckResultSchema),
  /** Vision model and execution metadata */
  metadata: inspectionMetadataSchema,
});

export type PrepInspectionRecord = z.infer<typeof prepInspectionRecordSchema>;
