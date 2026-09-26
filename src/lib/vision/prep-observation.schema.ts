import { z } from "zod";

/**
 * Prep Manager — visual observation contract (vision layer output).
 *
 * This schema captures what can be seen in unit photographs: visibility,
 * legibility, detected text/values, and pointers to supporting images.
 * It records factual visual evidence only.
 *
 * It does NOT encode work-order requirements, Amazon prep rules, or compliance
 * verdicts. A separate layer maps observations + authoritative rules to
 * PASS / FAIL / UNCERTAIN. Nothing in this file should imply pass or fail.
 */

/**
 * Visibility of a feature or mark in the supplied images:
 * - VISIBLE: The feature is visually detected in the supplied evidence.
 * - NOT_DETECTED: The feature was not detected in the supplied images.
 *   This MUST NOT mean the feature does not exist on the physical product.
 * - UNCERTAIN: The supplied visual evidence is insufficient to reliably determine
 *   whether the feature is present or absent.
 */
export const visibilitySchema = z.enum([
  "VISIBLE",
  "NOT_DETECTED",
  "UNCERTAIN",
]);

/** Whether visible text or symbols can be read reliably. */
export const legibilitySchema = z.enum([
  "LEGIBLE",
  "ILLEGIBLE",
  "UNCERTAIN",
]);

export const imageQualityOverallSchema = z.enum([
  "GOOD",
  "DEGRADED",
  "UNUSABLE",
]);

export const polybagSealStatusSchema = z.enum([
  "SEALED",
  "NOT_SEALED",
  "UNCERTAIN",
]);

export const fnskuPlacementSchema = z.enum([
  "FLAT_SURFACE",
  "CURVED_SURFACE",
  "ACROSS_SEAM",
  "OBSTRUCTED",
  "OTHER",
  "UNCERTAIN",
]);

/** Image-backed note describing what was seen (not a compliance judgment). */
export const visualEvidenceSchema = z.object({
  imageId: z.string(),
  description: z.string(),
});

export const imageQualitySchema = z.object({
  overall: imageQualityOverallSchema,
  issues: z.array(z.string()),
});

const withEvidence = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    ...shape,
    evidence: z.array(visualEvidenceSchema),
  });

export const polybagObservationSchema = withEvidence({
  visibility: visibilitySchema,
  sealStatus: polybagSealStatusSchema,
});

export const suffocationWarningObservationSchema = withEvidence({
  visibility: visibilitySchema,
  legibility: legibilitySchema,
  detectedText: z.string().nullable(),
});

export const fnskuObservationSchema = withEvidence({
  visibility: visibilitySchema,
  legibility: legibilitySchema,
  detectedValue: z.string().nullable(),
  placement: fnskuPlacementSchema,
  placementDescription: z.string().nullable(),
});

export const manufacturerBarcodeObservationSchema = withEvidence({
  visibility: visibilitySchema,
  legibility: legibilitySchema,
  detectedValue: z.string().nullable(),
});

export const expiryDateObservationSchema = withEvidence({
  visibility: visibilitySchema,
  legibility: legibilitySchema,
  detectedValue: z.string().nullable(),
});

export const handlingMarkObservationSchema = withEvidence({
  detectedType: z.string(),
  visibility: visibilitySchema,
  legibility: legibilitySchema,
  detectedText: z.string().nullable(),
});

/** Short, factual notes about anything else visible (not compliance conclusions). */
export const otherVisibleIssueSchema = z.string().min(1);

/**
 * Unit-level visual observations from one batched vision pass over all images.
 * Factual only — no PASS/FAIL and no confidence scores.
 */
export const prepUnitObservationSchema = z.object({
  unitId: z.string(),
  imageQuality: imageQualitySchema,
  polybag: polybagObservationSchema,
  suffocationWarning: suffocationWarningObservationSchema,
  fnsku: fnskuObservationSchema,
  manufacturerBarcode: manufacturerBarcodeObservationSchema,
  expiryDate: expiryDateObservationSchema,
  handlingMarks: z.array(handlingMarkObservationSchema),
  otherVisibleIssues: z.array(otherVisibleIssueSchema),
});

export type Visibility = z.infer<typeof visibilitySchema>;
export type Legibility = z.infer<typeof legibilitySchema>;
export type ImageQualityOverall = z.infer<typeof imageQualityOverallSchema>;
export type PolybagSealStatus = z.infer<typeof polybagSealStatusSchema>;
export type FnskuPlacement = z.infer<typeof fnskuPlacementSchema>;
export type VisualEvidence = z.infer<typeof visualEvidenceSchema>;
export type ImageQuality = z.infer<typeof imageQualitySchema>;
export type PolybagObservation = z.infer<typeof polybagObservationSchema>;
export type SuffocationWarningObservation = z.infer<
  typeof suffocationWarningObservationSchema
>;
export type FnskuObservation = z.infer<typeof fnskuObservationSchema>;
export type ManufacturerBarcodeObservation = z.infer<
  typeof manufacturerBarcodeObservationSchema
>;
export type ExpiryDateObservation = z.infer<typeof expiryDateObservationSchema>;
export type HandlingMarkObservation = z.infer<
  typeof handlingMarkObservationSchema
>;
export type PrepUnitObservation = z.infer<typeof prepUnitObservationSchema>;
