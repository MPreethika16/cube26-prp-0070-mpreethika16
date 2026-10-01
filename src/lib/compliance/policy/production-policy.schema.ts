import { z } from "zod";
import { prepCheckTypeSchema } from "../check-types";
import { policyPlacementSurfaceSchema } from "../resolved-requirement.schema";

/**
 * ============================================================================
 * PRODUCTION POLICY KNOWLEDGE & PROVENANCE LAYER (DAY 3 / STEP 2.1)
 * ============================================================================
 *
 * ARCHITECTURAL PRINCIPLE:
 * Production policy is pure, structured DATA with first-class provenance.
 * It is NOT executable arbitrary JS, NOT model memory, and NOT inferred from CSV samples.
 *
 * CRITICAL SEMANTIC BOUNDARIES:
 * 1. sourceNote / sourceReference:
 *    Describes what the authoritative published source explicitly supports
 *    (e.g., short paraphrased evidence notes and section citations).
 *
 * 2. semantics:
 *    Describes our internal machine-readable representation of that supported rule
 *    (applicability triggers, allowed/prohibited surfaces, closure standards).
 *
 * 3. verificationLimitations:
 *    Describes what our physical camera/vision system can and cannot prove from photographs
 *    (non-detection is not compliance, optical occlusion limitations, calibration limits).
 *
 * These three concepts must remain strictly decoupled.
 * ============================================================================
 */

export const policyScopeSchema = z.enum([
  "UNIT_LEVEL_PREP",
  "SHIPPING_BOX_PREP",
]);

export type PolicyScope = z.infer<typeof policyScopeSchema>;

export const policyStatusSchema = z.enum([
  "ACTIVE",
  "SUPERSEDED",
  "UNVERIFIED",
]);

export type PolicyStatus = z.infer<typeof policyStatusSchema>;

/**
 * Structured source reference contract for auditability and claim traceability.
 *
 * The evidenceNote must be a concise PARAPHRASE of what the cited source supports.
 * It strictly avoids storing long copied policy text.
 */
export const sourceReferenceSchema = z.object({
  section: z.string().min(1).optional(),
  evidenceNote: z.string().min(1, "evidenceNote must not be empty"),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

/**
 * Visual verification limitations contract.
 *
 * CRITICAL GUARDRAIL:
 * `nonDetectionProvesCompliance` is strictly literal false.
 * Non-detection in photographs must NEVER be treated as proof of compliance or absence.
 */
export const policyVerificationLimitationsSchema = z.object({
  visualVerifiability: z.enum(["FULL", "PARTIAL", "NOT_VISUALLY_VERIFIABLE"]),
  nonDetectionProvesCompliance: z.literal(false),
  limitations: z.array(z.string().min(1)).min(1),
});

export type PolicyVerificationLimitations = z.infer<
  typeof policyVerificationLimitationsSchema
>;

/** 1. Manufacturer Barcode Coverage Semantics */
export const manufacturerBarcodeCoverageSemanticsSchema = z.object({
  checkType: z.literal("MANUFACTURER_BARCODE_COVERAGE"),
  applicability: z.object({
    trigger: z.literal("EXTERNAL_SCANNABLE_BARCODE_REQUIRED"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    existingBarcodeAction: z.literal("COVER_REMOVE_OR_RENDER_UNSCANNABLE"),
    coverageRequired: z.boolean(),
    description: z.string().min(1),
  }),
});

export type ManufacturerBarcodeCoverageSemantics = z.infer<
  typeof manufacturerBarcodeCoverageSemanticsSchema
>;

/** 2. FNSKU Placement Semantics */
export const fnskuPlacementSemanticsSchema = z.object({
  checkType: z.literal("FNSKU_PLACEMENT"),
  applicability: z.object({
    trigger: z.literal("UNIT_FNSKU_AFFIXED"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    targetSurface: z.literal("SMOOTH_FLAT_SURFACE"),
    allowedPlacements: z.array(policyPlacementSurfaceSchema).min(1),
    prohibitedPlacements: z.array(policyPlacementSurfaceSchema),
    avoidCornersEdgesCurves: z.literal(true),
    description: z.string().min(1),
  }),
});

export type FnskuPlacementSemantics = z.infer<
  typeof fnskuPlacementSemanticsSchema
>;

/** 3. Polybag Seal Semantics */
export const polybagSealSemanticsSchema = z.object({
  checkType: z.literal("POLYBAG_SEAL"),
  applicability: z.object({
    trigger: z.literal("POLYBAG_PROTECTION_REQUIRED"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    requiredClosure: z.literal("COMPLETELY_SEALED"),
    description: z.string().min(1),
  }),
});

export type PolybagSealSemantics = z.infer<typeof polybagSealSemanticsSchema>;

/** 4. Suffocation Warning Presence Semantics */
export const suffocationWarningPresenceSemanticsSchema = z.object({
  checkType: z.literal("SUFFOCATION_WARNING_PRESENCE"),
  applicability: z.object({
    trigger: z.literal("POLYBAG_OPENING_SIZE_THRESHOLD"),
    minOpeningInchesFlat: z.literal(5),
    requiresStructuredMeasurement: z.literal(true),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    warningRequired: z.literal(true),
    prominence: z.literal("PROMINENT_AND_LEGIBLE"),
    description: z.string().min(1),
  }),
});

export type SuffocationWarningPresenceSemantics = z.infer<
  typeof suffocationWarningPresenceSemanticsSchema
>;

/** 5. Suffocation Warning Legibility Semantics */
export const suffocationWarningLegibilitySemanticsSchema = z.object({
  checkType: z.literal("SUFFOCATION_WARNING_LEGIBILITY"),
  applicability: z.object({
    trigger: z.literal("SUFFOCATION_WARNING_PRESENT"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    legibilityStandard: z.literal("PROMINENT_AND_LEGIBLE"),
    description: z.string().min(1),
  }),
});

export type SuffocationWarningLegibilitySemantics = z.infer<
  typeof suffocationWarningLegibilitySemanticsSchema
>;

/** 6. FNSKU Identity Semantics */
export const fnskuIdentitySemanticsSchema = z.object({
  checkType: z.literal("FNSKU_IDENTITY"),
  applicability: z.object({
    trigger: z.literal("UNIT_FNSKU_REQUIRED"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    matchRequirement: z.literal("EXACT_NORMALIZED_MATCH"),
    fuzzyMatchingPermitted: z.literal(false),
    description: z.string().min(1),
  }),
});

export type FnskuIdentitySemantics = z.infer<
  typeof fnskuIdentitySemanticsSchema
>;

/** 7. Polybag Presence Semantics */
export const polybagPresenceSemanticsSchema = z.object({
  checkType: z.literal("POLYBAG_PRESENCE"),
  applicability: z.object({
    trigger: z.literal("WORK_ORDER_OR_CATEGORY_PACKAGING_MANDATE"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    packagingRequirement: z.literal("POLYBAG_ENCLOSURE"),
    description: z.string().min(1),
  }),
});

export type PolybagPresenceSemantics = z.infer<
  typeof polybagPresenceSemanticsSchema
>;

/** 8. Expiry Visibility Semantics */
export const expiryVisibilitySemanticsSchema = z.object({
  checkType: z.literal("EXPIRY_VISIBILITY"),
  applicability: z.object({
    trigger: z.literal("EXPIRATION_DATED_PRODUCT"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    visibilityRequirement: z.literal("PRINTED_EXPIRY_DATE_PRESENT"),
    description: z.string().min(1),
  }),
});

export type ExpiryVisibilitySemantics = z.infer<
  typeof expiryVisibilitySemanticsSchema
>;

/** 9. Expiry Legibility Semantics */
export const expiryLegibilitySemanticsSchema = z.object({
  checkType: z.literal("EXPIRY_LEGIBILITY"),
  applicability: z.object({
    trigger: z.literal("EXPIRATION_DATED_PRODUCT"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    legibilityRequirement: z.literal("HUMAN_READABLE_DATE"),
    evaluateChronology: z.literal(false),
    description: z.string().min(1),
  }),
});

export type ExpiryLegibilitySemantics = z.infer<
  typeof expiryLegibilitySemanticsSchema
>;

/** 10. Handling Marks Semantics */
export const handlingMarksSemanticsSchema = z.object({
  checkType: z.literal("HANDLING_MARKS"),
  applicability: z.object({
    trigger: z.literal("COMMODITY_SPECIFIC_HANDLING"),
    description: z.string().min(1),
  }),
  evaluation: z.object({
    requiredMarkings: z.literal("ALL_MANDATED_MARKS_PRESENT"),
    description: z.string().min(1),
  }),
});

export type HandlingMarksSemantics = z.infer<
  typeof handlingMarksSemanticsSchema
>;

/**
 * Discriminated union of all typed machine-readable semantics keyed by checkType.
 */
export const productionPolicySemanticsSchema = z.discriminatedUnion(
  "checkType",
  [
    manufacturerBarcodeCoverageSemanticsSchema,
    fnskuPlacementSemanticsSchema,
    polybagSealSemanticsSchema,
    suffocationWarningPresenceSemanticsSchema,
    suffocationWarningLegibilitySemanticsSchema,
    fnskuIdentitySemanticsSchema,
    polybagPresenceSemanticsSchema,
    expiryVisibilitySemanticsSchema,
    expiryLegibilitySemanticsSchema,
    handlingMarksSemanticsSchema,
  ]
);

export type ProductionPolicySemantics = z.infer<
  typeof productionPolicySemanticsSchema
>;

/**
 * Core Production Policy schema.
 *
 * Encodes:
 * 1. policyId
 * 2. version
 * 3. checkType
 * 4. publisher
 * 5. sourceUrl
 * 6. retrievedAt
 * 7. scope
 * 8. semantics
 * 9. verificationLimitations
 * 10. sourceNote
 * 11. sourceReference (structured traceability)
 * 12. status
 */
export const productionPolicySchema = z
  .object({
    policyId: z.string().min(1),
    version: z.string().min(1),
    checkType: prepCheckTypeSchema,
    publisher: z.string().min(1),
    sourceUrl: z.string().url(),
    /**
     * Retrieval timestamp in ISO 8601 format.
     * CONVENTION: For policies researched during a build session without published
     * sub-second precision from the source, UTC midnight of the research session day
     * (e.g. "2026-09-27T00:00:00.000Z") is recorded conservatively without fabricating precision.
     */
    retrievedAt: z.string().datetime(),
    scope: policyScopeSchema,
    semantics: productionPolicySemanticsSchema,
    verificationLimitations: policyVerificationLimitationsSchema,
    sourceNote: z.string().min(1),
    sourceReference: sourceReferenceSchema.optional(),
    status: policyStatusSchema,
  })
  .superRefine((data, ctx) => {
    // 1. checkType must match semantics.checkType
    if (data.checkType !== data.semantics.checkType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Policy checkType ("${data.checkType}") does not match semantics checkType ("${data.semantics.checkType}").`,
        path: ["semantics", "checkType"],
      });
    }

    // 2. CRITICAL GUARDRAIL: Seam rule is NOT encoded as authoritative FNSKU placement policy for unit-level prep
    if (
      data.checkType === "FNSKU_PLACEMENT" &&
      data.scope === "UNIT_LEVEL_PREP" &&
      data.semantics.checkType === "FNSKU_PLACEMENT"
    ) {
      if (
        data.semantics.evaluation.prohibitedPlacements.includes("ACROSS_SEAM")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "ACROSS_SEAM must NOT be encoded as a prohibited placement for unit-level FNSKU labels. The verified seam rule applies only to shipping/box labels.",
          path: ["semantics", "evaluation", "prohibitedPlacements"],
        });
      }
    }

    // 3. PROVENANCE GUARDRAIL: Active production policies MUST provide structured sourceReference
    if (data.status === "ACTIVE" && !data.sourceReference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Active production policies must provide a sourceReference to ensure claim traceability.",
        path: ["sourceReference"],
      });
    }
  });

export type ProductionPolicy = z.infer<typeof productionPolicySchema>;
