import { z } from "zod";
import type { PrepCheckType } from "./check-types";
import {
  complianceApplicabilitySchema,
  ruleReferenceSchema,
  type RuleReference,
} from "./compliance-result.schema";

/**
 * ============================================================================
 * RESOLVED REQUIREMENT CONTRACT (Discriminated Union)
 * ============================================================================
 *
 * ARCHITECTURAL PURPOSE:
 * A ResolvedRequirement represents:
 * "What exactly must this specific check verify for this specific unit?"
 *
 * It is produced by the Requirement Resolver by combining:
 * - Work Order Intent
 * - Authoritative Rule Metadata / Provenance
 * - Explicit Product / Channel Policy Context
 *
 * It is NOT:
 * - Raw work-order data
 * - Raw policy text
 * - Visual observation
 * - Compliance result
 * ============================================================================
 */

/**
 * Valid placement surfaces for policy definitions.
 * Strictly reuses Day-1 vocabulary but EXCLUDES UNCERTAIN,
 * because policy cannot specify UNCERTAIN as an allowed or prohibited surface.
 */
export const policyPlacementSurfaceSchema = z.enum([
  "FLAT_SURFACE",
  "CURVED_SURFACE",
  "ACROSS_SEAM",
  "OBSTRUCTED",
  "OTHER",
]);

export type PolicyPlacementSurface = z.infer<
  typeof policyPlacementSurfaceSchema
>;

/** 1. FNSKU Placement */
export const resolvedFnskuPlacementRequirementSchema = z.object({
  checkType: z.literal("FNSKU_PLACEMENT"),
  applicability: complianceApplicabilitySchema,
  allowedPlacements: z.array(policyPlacementSurfaceSchema),
  prohibitedPlacements: z.array(policyPlacementSurfaceSchema),
  ruleRef: ruleReferenceSchema,
});

export type ResolvedFnskuPlacementRequirement = z.infer<
  typeof resolvedFnskuPlacementRequirementSchema
>;

/** 2. Manufacturer Barcode Coverage */
export const resolvedManufacturerBarcodeCoverageRequirementSchema = z.object({
  checkType: z.literal("MANUFACTURER_BARCODE_COVERAGE"),
  applicability: complianceApplicabilitySchema,
  /**
   * true = coverage explicitly required
   * false = coverage explicitly not required
   * null = requirement could not be safely resolved
   */
  coverageRequired: z.boolean().nullable(),
  ruleRef: ruleReferenceSchema,
});

export type ResolvedManufacturerBarcodeCoverageRequirement = z.infer<
  typeof resolvedManufacturerBarcodeCoverageRequirementSchema
>;

/** 3. Handling Marks */
export const resolvedHandlingMarksRequirementSchema = z.object({
  checkType: z.literal("HANDLING_MARKS"),
  applicability: complianceApplicabilitySchema,
  requiredMarks: z.array(z.string()),
  ruleRef: ruleReferenceSchema,
});

export type ResolvedHandlingMarksRequirement = z.infer<
  typeof resolvedHandlingMarksRequirementSchema
>;

/** 4. Polybag Presence */
export const resolvedPolybagPresenceRequirementSchema = z.object({
  checkType: z.literal("POLYBAG_PRESENCE"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedPolybagPresenceRequirement = z.infer<
  typeof resolvedPolybagPresenceRequirementSchema
>;

/** 5. Polybag Seal */
export const resolvedPolybagSealRequirementSchema = z.object({
  checkType: z.literal("POLYBAG_SEAL"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedPolybagSealRequirement = z.infer<
  typeof resolvedPolybagSealRequirementSchema
>;

/** 6. Suffocation Warning Presence */
export const resolvedSuffocationWarningPresenceRequirementSchema = z.object({
  checkType: z.literal("SUFFOCATION_WARNING_PRESENCE"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedSuffocationWarningPresenceRequirement = z.infer<
  typeof resolvedSuffocationWarningPresenceRequirementSchema
>;

/** 7. Suffocation Warning Legibility */
export const resolvedSuffocationWarningLegibilityRequirementSchema = z.object({
  checkType: z.literal("SUFFOCATION_WARNING_LEGIBILITY"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedSuffocationWarningLegibilityRequirement = z.infer<
  typeof resolvedSuffocationWarningLegibilityRequirementSchema
>;

/** 8. Expiry Visibility */
export const resolvedExpiryVisibilityRequirementSchema = z.object({
  checkType: z.literal("EXPIRY_VISIBILITY"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedExpiryVisibilityRequirement = z.infer<
  typeof resolvedExpiryVisibilityRequirementSchema
>;

/** 9. Expiry Legibility */
export const resolvedExpiryLegibilityRequirementSchema = z.object({
  checkType: z.literal("EXPIRY_LEGIBILITY"),
  applicability: complianceApplicabilitySchema,
  ruleRef: ruleReferenceSchema,
});

export type ResolvedExpiryLegibilityRequirement = z.infer<
  typeof resolvedExpiryLegibilityRequirementSchema
>;

/** 10. FNSKU Identity */
export const resolvedFnskuIdentityRequirementSchema = z.object({
  checkType: z.literal("FNSKU_IDENTITY"),
  applicability: complianceApplicabilitySchema,
  expectedFnsku: z.string().min(1),
  ruleRef: ruleReferenceSchema,
});

export type ResolvedFnskuIdentityRequirement = z.infer<
  typeof resolvedFnskuIdentityRequirementSchema
>;

/**
 * Discriminated union of all typed resolved requirements keyed by checkType.
 * No generic "value: unknown" or speculative fields.
 */
export const resolvedRequirementSchema = z.discriminatedUnion("checkType", [
  resolvedFnskuPlacementRequirementSchema,
  resolvedManufacturerBarcodeCoverageRequirementSchema,
  resolvedHandlingMarksRequirementSchema,
  resolvedPolybagPresenceRequirementSchema,
  resolvedPolybagSealRequirementSchema,
  resolvedSuffocationWarningPresenceRequirementSchema,
  resolvedSuffocationWarningLegibilityRequirementSchema,
  resolvedExpiryVisibilityRequirementSchema,
  resolvedExpiryLegibilityRequirementSchema,
  resolvedFnskuIdentityRequirementSchema,
]);

export type ResolvedRequirement = z.infer<typeof resolvedRequirementSchema>;

/**
 * Controlled reasons when requirement resolution fails safely.
 */
export const unresolutionReasonSchema = z.enum([
  "RULE_NOT_FOUND",
  "RULE_INACTIVE",
  "INSUFFICIENT_POLICY_SEMANTICS",
  "REQUIREMENT_INPUT_UNKNOWN",
  "CONTEXT_MISSING",
]);

export type UnresolutionReason = z.infer<typeof unresolutionReasonSchema>;

export interface ResolvedRequirementResult<
  T extends ResolvedRequirement = ResolvedRequirement
> {
  status: "RESOLVED";
  checkType: T["checkType"];
  requirement: T;
}

export interface UnresolvedRequirementResult {
  status: "UNRESOLVED";
  checkType: PrepCheckType;
  reason: UnresolutionReason;
  explanation: string;
  ruleRef?: RuleReference;
}

export type RequirementResolutionResult<
  T extends ResolvedRequirement = ResolvedRequirement
> = ResolvedRequirementResult<T> | UnresolvedRequirementResult;
