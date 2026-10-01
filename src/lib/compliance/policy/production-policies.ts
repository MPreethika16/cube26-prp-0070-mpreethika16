import {
  productionPolicySchema,
  type ProductionPolicy,
} from "./production-policy.schema";

/**
 * ============================================================================
 * VERIFIED PRODUCTION POLICIES (AMAZON SELLER CENTRAL)
 * ============================================================================
 *
 * Sourced directly from Amazon Seller Central FBA published documentation.
 * Pure structured data — zero executable code, zero synthetic assumptions.
 *
 * PROVENANCE CONVENTION:
 * - `retrievedAt`: "2026-09-27T00:00:00.000Z" corresponds to the current policy
 *   research session (UTC start of day, avoiding fabricated sub-minute precision).
 * - `sourceReference`: Contains short paraphrased evidence notes of what the
 *   source supports, without storing long copied policy texts.
 * ============================================================================
 */

/**
 * 1. Manufacturer Barcode Coverage Policy
 * Source: Amazon Seller Central - FBA Product Barcode Requirements
 */
export const AMZN_BARCODE_COVERAGE_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-BARCODE-COVERAGE-2026",
    version: "2026.1",
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141490",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "FBA Product Barcode Requirements: Cover any existing, scannable barcodes with an Amazon FNSKU barcode label to prevent incorrect scanning.",
    sourceReference: {
      section: "FBA Product Barcode Requirements",
      evidenceNote:
        "Amazon requires covering, removing, or rendering unscannable any existing manufacturer barcodes (UPC/EAN/ISBN) when affixing an Amazon FNSKU barcode label.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: {
        trigger: "EXTERNAL_SCANNABLE_BARCODE_REQUIRED",
        description:
          "An externally scannable barcode is required for each unit inbound to FBA.",
      },
      evaluation: {
        existingBarcodeAction: "COVER_REMOVE_OR_RENDER_UNSCANNABLE",
        coverageRequired: true,
        description:
          "Existing scannable barcodes on the unit (such as UPC, EAN, or ISBN) must be covered, removed, or rendered unscannable when an Amazon FNSKU label is applied.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Photographs can confirm when an uncovered manufacturer barcode is visibly present (defect).",
        "Non-detection of a manufacturer barcode in supplied photographs does NOT prove proper coverage; the barcode may be absent, unphotographed, or obscured.",
      ],
    },
  });

/**
 * 2. FNSKU Label Placement Policy
 * Source: Amazon Seller Central - FBA Label Products
 */
export const AMZN_FNSKU_PLACEMENT_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-FNSKU-PLACEMENT-2026",
    version: "2026.1",
    checkType: "FNSKU_PLACEMENT",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141490",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "FBA Label Products Guidelines: Place labels on a smooth, flat surface. Do not place labels on a corner, edge, or curve.",
    sourceReference: {
      section: "FBA Label Products Guidelines",
      evidenceNote:
        "Amazon instructs placing barcode labels on a smooth, flat surface of the product package, avoiding placement on corners, edges, or curves.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "FNSKU_PLACEMENT",
      applicability: {
        trigger: "UNIT_FNSKU_AFFIXED",
        description: "Applies to all units receiving an Amazon FNSKU label.",
      },
      evaluation: {
        targetSurface: "SMOOTH_FLAT_SURFACE",
        allowedPlacements: ["FLAT_SURFACE"],
        prohibitedPlacements: ["CURVED_SURFACE", "OBSTRUCTED"],
        avoidCornersEdgesCurves: true,
        description:
          "Barcode labels must be placed on a smooth, flat surface. Avoid placement on curves, corners, and edges. (Note: ACROSS_SEAM is not an authoritative unit-level prohibition).",
      },
    },
    verificationLimitations: {
      visualVerifiability: "FULL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Requires clear optical visibility of the label geometry relative to the product face.",
        "Non-detection of the FNSKU label does not establish correct placement.",
      ],
    },
  });

/**
 * 3. Polybag Packaging Seal Policy
 * Source: Amazon Seller Central - Packaging and Prep Requirements (Polybags)
 */
export const AMZN_POLYBAG_SEAL_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-POLYBAG-SEAL-2026",
    version: "2026.1",
    checkType: "POLYBAG_SEAL",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Packaging and Prep Requirements - Polybagged Units: Polybags used to protect units must be completely sealed.",
    sourceReference: {
      section: "Packaging and Prep Requirements - Polybagged Units",
      evidenceNote:
        "Amazon mandates that polybags protecting inventory units must be completely sealed to prevent items from falling out.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "POLYBAG_SEAL",
      applicability: {
        trigger: "POLYBAG_PROTECTION_REQUIRED",
        description:
          "Applies when polybag packaging is required or used to protect physical units.",
      },
      evaluation: {
        requiredClosure: "COMPLETELY_SEALED",
        description:
          "Polybags must be completely sealed (via heat-seal, tape, or permanent adhesive) without openings.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Seal status can only be evaluated when the polybag itself is positively detected in evidence.",
        "Non-detection of an open seam does not prove a complete airtight or hermetic seal.",
      ],
    },
  });

/**
 * 4. Suffocation Warning Presence Policy
 * Source: Amazon Seller Central - Packaging and Prep Requirements (Polybags)
 */
export const AMZN_SUFFOCATION_WARNING_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-SUFFOCATION-WARN-2026",
    version: "2026.1",
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Polybagged Units: Polybags with a 5-inch opening or larger (measured flat) must have a suffocation warning printed on or attached to the bag in a prominent location.",
    sourceReference: {
      section: "Packaging and Prep Requirements - Polybagged Units",
      evidenceNote:
        "Amazon requires a prominent, legible suffocation warning for any polybag with an opening of 5 inches or larger measured flat.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      applicability: {
        trigger: "POLYBAG_OPENING_SIZE_THRESHOLD",
        minOpeningInchesFlat: 5,
        requiresStructuredMeasurement: true,
        description:
          "A polybag with an opening of 5 inches or larger, measured flat, requires a suffocation warning. Structured measurement or explicit work-order intent is required; bag opening size must not be inferred from uncalibrated photographs.",
      },
      evaluation: {
        warningRequired: true,
        prominence: "PROMINENT_AND_LEGIBLE",
        description:
          "The suffocation warning must be prominent and legible on the bag.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Camera images without calibration scale cannot reliably measure bag opening dimension.",
        "Non-detection of warning does not prove absence unless all surfaces of the bag are photographed.",
      ],
    },
  });

/**
 * 5. FNSKU Identity Policy
 * Source: Amazon Seller Central - FBA Product Barcode Requirements
 */
export const AMZN_FNSKU_IDENTITY_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-FNSKU-IDENTITY-2026",
    version: "2026.1",
    checkType: "FNSKU_IDENTITY",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141490",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "FBA Product Barcode Requirements: Each unit must carry an exact matching Amazon FNSKU barcode label matching the shipment plan.",
    sourceReference: {
      section: "FBA Product Barcode Requirements",
      evidenceNote:
        "Amazon requires every inbound FBA unit to bear the exact matching FNSKU label designated in the seller's shipping plan.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "FNSKU_IDENTITY",
      applicability: {
        trigger: "UNIT_FNSKU_REQUIRED",
        description:
          "Each prepped FBA unit must carry its designated FNSKU identifier.",
      },
      evaluation: {
        matchRequirement: "EXACT_NORMALIZED_MATCH",
        fuzzyMatchingPermitted: false,
        description:
          "Detected FNSKU text must match the expected work-order FNSKU exactly. Fuzzy or partial matching is strictly forbidden.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "FULL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Requires barcode label to be visible and legible.",
        "Non-detection of the barcode does not prove absence.",
      ],
    },
  });

/**
 * 6. Polybag Presence Policy
 * Source: Amazon Seller Central - Packaging and Prep Requirements (Polybags)
 */
export const AMZN_POLYBAG_PRESENCE_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-POLYBAG-PRESENCE-2026",
    version: "2026.1",
    checkType: "POLYBAG_PRESENCE",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Packaging and Prep Requirements - Polybagged Units: Units requiring polybag protection must be enclosed in a transparent polybag.",
    sourceReference: {
      section: "Packaging and Prep Requirements - Polybagged Units",
      evidenceNote:
        "Amazon specifies polybagging for designated item categories (e.g. apparel, loose units, liquids, powders). Applicability is determined by work order commodity requirements; when mandated, the unit must be enclosed in a polybag.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "POLYBAG_PRESENCE",
      applicability: {
        trigger: "WORK_ORDER_OR_CATEGORY_PACKAGING_MANDATE",
        description:
          "Applies when the work order specifies polybag packaging for the product category or shipment.",
      },
      evaluation: {
        packagingRequirement: "POLYBAG_ENCLOSURE",
        description:
          "The physical unit must be enclosed within a protective polybag.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Photographs can confirm when a polybag is visibly present around the product.",
        "Non-detection of a polybag in partial or obscured views does NOT prove absence.",
      ],
    },
  });

/**
 * 7. Suffocation Warning Legibility Policy
 * Source: Amazon Seller Central - Packaging and Prep Requirements (Polybags)
 */
export const AMZN_SUFFOCATION_WARNING_LEGIBILITY_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-SUFFOCATION-WARN-LEG-2026",
    version: "2026.1",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Polybagged Units: Suffocation warnings printed on or attached to polybags must be printed in a prominent location and legible font.",
    sourceReference: {
      section: "Polybagged Units - Suffocation Warning Requirements",
      evidenceNote:
        "Amazon requires suffocation warnings on polybags with a 5-inch opening or larger to be printed or stickered in prominent, clearly legible text.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      applicability: {
        trigger: "SUFFOCATION_WARNING_PRESENT",
        description:
          "Applies to all required suffocation warnings on polybagged inventory.",
      },
      evaluation: {
        legibilityStandard: "PROMINENT_AND_LEGIBLE",
        description:
          "Suffocation warning text must be sharp, unblurred, and readable by warehouse personnel.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "FULL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Legibility requires sufficient optical resolution and absence of blur/glare.",
        "Illegible or defaced warnings constitute a positive visual defect.",
      ],
    },
  });

/**
 * 8. Expiration Date Visibility Policy
 * Source: Amazon Seller Central - Expiration-dated inventory
 */
export const AMZN_EXPIRY_VISIBILITY_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-EXPIRY-VISIBILITY-2026",
    version: "2026.1",
    checkType: "EXPIRY_VISIBILITY",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200140860",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Expiration-dated inventory: Each unit must clearly display an expiration date on the individual unit packaging.",
    sourceReference: {
      section: "Expiration-dated inventory - Labeling requirements",
      evidenceNote:
        "Amazon mandates that all date-sensitive and expiration-dated products must display an expiration date on the packaging. Applicability is dictated by the work-order product catalog classification.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "EXPIRY_VISIBILITY",
      applicability: {
        trigger: "EXPIRATION_DATED_PRODUCT",
        description:
          "Applies to products designated as expiration-dated or date-sensitive by the work order.",
      },
      evaluation: {
        visibilityRequirement: "PRINTED_EXPIRY_DATE_PRESENT",
        description:
          "A printed expiration date must be visibly located on the unit packaging.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Camera images can confirm date presence when captured in frame.",
        "Non-detection in partial package views does NOT prove absence; requires UNCERTAIN abstention.",
      ],
    },
  });

/**
 * 9. Expiration Date Legibility Policy
 * Source: Amazon Seller Central - Expiration-dated inventory
 */
export const AMZN_EXPIRY_LEGIBILITY_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-EXPIRY-LEGIBILITY-2026",
    version: "2026.1",
    checkType: "EXPIRY_LEGIBILITY",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200140860",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Expiration-dated inventory: Expiration dates must be clearly legible and printed in standard human-readable format.",
    sourceReference: {
      section: "Expiration-dated inventory - Date format and legibility",
      evidenceNote:
        "Amazon requires expiration dates to be clearly readable in standard date formats. Bludged, smudged, or illegible dates are non-compliant. Evaluates visual legibility without executing calendar chronology.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "EXPIRY_LEGIBILITY",
      applicability: {
        trigger: "EXPIRATION_DATED_PRODUCT",
        description:
          "Applies to expiration dates present on expiration-dated inventory units.",
      },
      evaluation: {
        legibilityRequirement: "HUMAN_READABLE_DATE",
        evaluateChronology: false,
        description:
          "Expiration date text must be legible and unblurred. Does NOT evaluate chronological validity or shelf-life arithmetic.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "FULL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Legibility requires high-resolution focus on the printed expiration stamp.",
        "Illegible or defaced date markings constitute positive visual defect evidence.",
      ],
    },
  });

/**
 * 10. Commodity Handling Marks Policy
 * Source: Amazon Seller Central - Packaging and Prep Requirements
 */
export const AMZN_HANDLING_MARKS_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-HANDLING-MARKS-2026",
    version: "2026.1",
    checkType: "HANDLING_MARKS",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "UNIT_LEVEL_PREP",
    sourceNote:
      "Packaging and Prep Requirements - Special Handling: Units requiring special handling must display designated handling markings.",
    sourceReference: {
      section: "Packaging and Prep Requirements - Special Handling",
      evidenceNote:
        "Amazon specifies handling label standards for commodity-specific inventory (e.g. heavy, fragile, do not separate). Specific required markings are dictated by the shipment work order; all mandated markings must be present and legible.",
    },
    status: "ACTIVE",
    semantics: {
      checkType: "HANDLING_MARKS",
      applicability: {
        trigger: "COMMODITY_SPECIFIC_HANDLING",
        description:
          "Applies when the work order specifies commodity handling marks (e.g. Fragile, Heavy, Team Lift) for the unit.",
      },
      evaluation: {
        requiredMarkings: "ALL_MANDATED_MARKS_PRESENT",
        description:
          "All handling markings mandated by the work order must be positively detected and legible.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "PARTIAL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Photographs can confirm designated markings when captured.",
        "Non-detection in partial views does NOT prove absence; requires UNCERTAIN abstention.",
      ],
    },
  });

/**
 * 11. Explicitly UNVERIFIED policy for Shipping Box Seam Labeling.
 *
 * DEMONSTRATION OF SCOPE ISOLATION & UNVERIFIED STATUS:
 * The seam rule ("Do not place label over a seam or opening") is published
 * exclusively for SHIPPING BOXES (SHIPPING_BOX_PREP), not unit-level FNSKU labels.
 * It is held as UNVERIFIED for unit prep and must NOT behave as active production policy.
 */
export const AMZN_SHIPPING_BOX_SEAM_POLICY: ProductionPolicy =
  productionPolicySchema.parse({
    policyId: "AMZN-POL-SHIPPING-BOX-SEAM-2026",
    version: "2026.1-unverified",
    checkType: "FNSKU_PLACEMENT",
    publisher: "Amazon Seller Central",
    sourceUrl: "https://sellercentral.amazon.com/help/hub/reference/G200178470",
    retrievedAt: "2026-09-27T00:00:00.000Z",
    scope: "SHIPPING_BOX_PREP",
    sourceNote:
      "FBA Box Label Requirements: Do not place shipping labels over a seam or opening on the box. (Unverified for unit-level item FNSKUs).",
    sourceReference: {
      section: "FBA Box Label Requirements",
      evidenceNote:
        "Amazon prohibits placing shipping labels across seams on outer shipping boxes; this rule has not been verified for unit-level FNSKUs.",
    },
    status: "UNVERIFIED",
    semantics: {
      checkType: "FNSKU_PLACEMENT",
      applicability: {
        trigger: "UNIT_FNSKU_AFFIXED",
        description:
          "Box-level shipment label seam rules. Not verified for unit FNSKU labels.",
      },
      evaluation: {
        targetSurface: "SMOOTH_FLAT_SURFACE",
        allowedPlacements: ["FLAT_SURFACE"],
        prohibitedPlacements: ["ACROSS_SEAM", "OBSTRUCTED"],
        avoidCornersEdgesCurves: true,
        description:
          "Do not place box shipping labels across seams. Unverified for unit-level labeling.",
      },
    },
    verificationLimitations: {
      visualVerifiability: "FULL",
      nonDetectionProvesCompliance: false,
      limitations: [
        "Applies strictly to shipping carton box labels.",
        "Must NOT be applied to individual item FNSKU labels.",
      ],
    },
  });

/**
 * Complete list of verified active production policies.
 * Covers all 10 unit-level prep checks with provenance-backed Amazon standards.
 */
export const VERIFIED_PRODUCTION_POLICIES: readonly ProductionPolicy[] =
  Object.freeze([
    AMZN_BARCODE_COVERAGE_POLICY,
    AMZN_FNSKU_PLACEMENT_POLICY,
    AMZN_POLYBAG_SEAL_POLICY,
    AMZN_SUFFOCATION_WARNING_POLICY,
    AMZN_FNSKU_IDENTITY_POLICY,
    AMZN_POLYBAG_PRESENCE_POLICY,
    AMZN_SUFFOCATION_WARNING_LEGIBILITY_POLICY,
    AMZN_EXPIRY_VISIBILITY_POLICY,
    AMZN_EXPIRY_LEGIBILITY_POLICY,
    AMZN_HANDLING_MARKS_POLICY,
  ]);
