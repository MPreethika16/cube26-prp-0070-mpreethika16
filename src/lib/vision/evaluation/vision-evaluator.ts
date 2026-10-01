import type { PrepUnitObservation } from "../prep-observation.schema";
import type { UnitVisionGroundTruth } from "./vision-ground-truth.schema";

export type VisionMismatchType =
  | "MISS"
  | "HALLUCINATION"
  | "VALUE_ERROR"
  | "VISIBILITY_ERROR"
  | "LEGIBILITY_ERROR"
  | "PLACEMENT_ERROR"
  | "OVERASSERTION";

export interface VisionMismatch {
  unitId: string;
  feature: string;
  field: string;
  expected: string | null;
  observed: string | null;
  mismatchType: VisionMismatchType;
  description: string;
  evidence: string[];
}

export interface FeatureVisionMetrics {
  featureName: string;
  totalFieldsEvaluated: number;
  matches: number;
  mismatches: VisionMismatch[];
  hallucinations: number;
  misses: number;
  overassertions: number;
}

export interface CategoryMetrics {
  evaluated: number;
  matches: number;
}

export interface UnitVisionEvaluationResult {
  unitId: string;
  perFeature: Record<string, FeatureVisionMetrics>;
  mismatches: VisionMismatch[];
  totalFieldsEvaluated: number;
  totalMatches: number;
  uncertainCount: number;
  categories: {
    visibility: CategoryMetrics;
    legibility: CategoryMetrics;
    value: CategoryMetrics;
    placement: CategoryMetrics;
  };
}

export interface AggregateVisionMetrics {
  totalUnits: number;
  totalFieldsEvaluated: number;
  totalMatches: number;
  overallAgreementRate: number;

  visibilityEvaluated: number;
  visibilityMatches: number;
  visibilityAgreementRate: number;

  legibilityEvaluated: number;
  legibilityMatches: number;
  legibilityAgreementRate: number;

  valuesEvaluated: number;
  valueMatches: number;
  valueAccuracyRate: number;

  placementsEvaluated: number;
  placementMatches: number;
  placementAgreementRate: number;

  hallucinationCount: number;
  missCount: number;
  unsafeAssertionCount: number;
  uncertainCount: number;

  perFeature: Record<string, FeatureVisionMetrics>;
  allMismatches: VisionMismatch[];
}

function normalizeValue(val: string | null | undefined): string {
  if (!val) return "";
  return val.trim().toLowerCase().replace(/[\s\-_/]/g, "");
}

/**
 * Evaluates a single unit's PrepUnitObservation against its UnitVisionGroundTruth.
 */
export function evaluateUnitObservation(
  observation: PrepUnitObservation,
  groundTruth: UnitVisionGroundTruth
): UnitVisionEvaluationResult {
  const mismatches: VisionMismatch[] = [];
  let totalFieldsEvaluated = 0;
  let totalMatches = 0;
  let uncertainCount = 0;

  const categories = {
    visibility: { evaluated: 0, matches: 0 },
    legibility: { evaluated: 0, matches: 0 },
    value: { evaluated: 0, matches: 0 },
    placement: { evaluated: 0, matches: 0 },
  };

  const perFeature: Record<string, FeatureVisionMetrics> = {};

  function initFeature(featureName: string): FeatureVisionMetrics {
    const f: FeatureVisionMetrics = {
      featureName,
      totalFieldsEvaluated: 0,
      matches: 0,
      mismatches: [],
      hallucinations: 0,
      misses: 0,
      overassertions: 0,
    };
    perFeature[featureName] = f;
    return f;
  }

  function compareField(
    featureName: string,
    field: string,
    expected: string | null | undefined,
    observed: string | null | undefined,
    fieldType:
      | "visibility"
      | "legibility"
      | "value"
      | "placement"
      | "seal"
      | "packagingType",
    evidence?: string[]
  ) {
    if (expected === "NOT_LABELED" || expected === undefined) {
      return; // Skip unlabeled fields
    }

    const feature = perFeature[featureName] || initFeature(featureName);
    feature.totalFieldsEvaluated++;
    totalFieldsEvaluated++;

    const cat =
      fieldType === "seal" || fieldType === "packagingType"
        ? "visibility"
        : fieldType;
    categories[cat].evaluated++;

    if (observed === "UNCERTAIN") {
      uncertainCount++;
    }

    // Exact or normalized match
    let isMatch = false;
    if (fieldType === "value") {
      if (expected === null && (observed === null || observed === "")) {
        isMatch = true;
      } else if (expected !== null && observed !== null) {
        isMatch = normalizeValue(expected) === normalizeValue(observed);
      }
    } else {
      isMatch = expected === observed;
    }

    if (isMatch) {
      feature.matches++;
      totalMatches++;
      categories[cat].matches++;
      return;
    }

    // Mismatch classification
    let mismatchType: VisionMismatchType = "VISIBILITY_ERROR";

    if (fieldType === "visibility") {
      if (expected === "VISIBLE" && observed === "NOT_DETECTED") {
        mismatchType = "MISS";
        feature.misses++;
      } else if (expected === "NOT_DETECTED" && observed === "VISIBLE") {
        mismatchType = "HALLUCINATION";
        feature.hallucinations++;
      } else if (expected === "UNCERTAIN" && (observed === "VISIBLE" || observed === "NOT_DETECTED")) {
        mismatchType = "OVERASSERTION";
        feature.overassertions++;
      } else {
        mismatchType = "VISIBILITY_ERROR";
      }
    } else if (fieldType === "value") {
      if ((expected === null || expected === "NOT_DETECTED") && (observed !== null && observed !== "NOT_DETECTED" && observed !== "")) {
        mismatchType = "HALLUCINATION";
        feature.hallucinations++;
      } else if (expected !== null && (observed === null || observed === "NOT_DETECTED" || observed === "")) {
        mismatchType = "MISS";
        feature.misses++;
      } else {
        mismatchType = "VALUE_ERROR";
      }
    } else if (fieldType === "legibility") {
      if (expected === "UNCERTAIN" && (observed === "LEGIBLE" || observed === "ILLEGIBLE")) {
        mismatchType = "OVERASSERTION";
        feature.overassertions++;
      } else {
        mismatchType = "LEGIBILITY_ERROR";
      }
    } else if (fieldType === "placement") {
      if (expected === "UNCERTAIN" && observed !== "UNCERTAIN") {
        mismatchType = "OVERASSERTION";
        feature.overassertions++;
      } else {
        mismatchType = "PLACEMENT_ERROR";
      }
    } else if (fieldType === "seal") {
      if (expected === "UNCERTAIN" && observed !== "UNCERTAIN") {
        mismatchType = "OVERASSERTION";
        feature.overassertions++;
      } else {
        mismatchType = "VISIBILITY_ERROR";
      }
    } else if (fieldType === "packagingType") {
      if (expected === "UNCERTAIN" && observed !== "UNCERTAIN") {
        mismatchType = "OVERASSERTION";
        feature.overassertions++;
      } else if (expected === "NONE_DETECTED" && observed !== "NONE_DETECTED") {
        mismatchType = "HALLUCINATION";
        feature.hallucinations++;
      } else if (expected !== "NONE_DETECTED" && observed === "NONE_DETECTED") {
        mismatchType = "MISS";
        feature.misses++;
      } else {
        mismatchType = "VALUE_ERROR";
      }
    }

    const mismatch: VisionMismatch = {
      unitId: groundTruth.unitId,
      feature: featureName,
      field,
      expected: expected ?? null,
      observed: observed ?? null,
      mismatchType,
      description: `${featureName}.${field}: expected "${expected ?? "null"}", observed "${observed ?? "null"}" (${mismatchType})`,
      evidence: evidence ?? [],
    };

    mismatches.push(mismatch);
    feature.mismatches.push(mismatch);
  }

  function formatEvidence(
    evidence?: Array<{ imageId: string; description: string } | string> | null
  ): string[] {
    if (!evidence) return [];
    return evidence.map((e) => (typeof e === "string" ? e : `${e.imageId}: ${e.description}`));
  }

  // 1. Manufacturer Barcode
  initFeature("manufacturerBarcode");
  compareField(
    "manufacturerBarcode",
    "visibility",
    groundTruth.manufacturerBarcode.visibility,
    observation.manufacturerBarcode.visibility,
    "visibility",
    formatEvidence(observation.manufacturerBarcode.evidence)
  );
  compareField(
    "manufacturerBarcode",
    "legibility",
    groundTruth.manufacturerBarcode.legibility,
    observation.manufacturerBarcode.legibility,
    "legibility",
    formatEvidence(observation.manufacturerBarcode.evidence)
  );
  compareField(
    "manufacturerBarcode",
    "detectedValue",
    groundTruth.manufacturerBarcode.detectedValue,
    observation.manufacturerBarcode.detectedValue,
    "value",
    formatEvidence(observation.manufacturerBarcode.evidence)
  );

  // 2. Expiry Date
  initFeature("expiryDate");
  compareField(
    "expiryDate",
    "visibility",
    groundTruth.expiryDate.visibility,
    observation.expiryDate.visibility,
    "visibility",
    formatEvidence(observation.expiryDate.evidence)
  );
  compareField(
    "expiryDate",
    "legibility",
    groundTruth.expiryDate.legibility,
    observation.expiryDate.legibility,
    "legibility",
    formatEvidence(observation.expiryDate.evidence)
  );
  compareField(
    "expiryDate",
    "detectedValue",
    groundTruth.expiryDate.detectedValue,
    observation.expiryDate.detectedValue,
    "value",
    formatEvidence(observation.expiryDate.evidence)
  );

  // 3. FNSKU
  initFeature("fnsku");
  compareField(
    "fnsku",
    "visibility",
    groundTruth.fnsku.visibility,
    observation.fnsku.visibility,
    "visibility",
    formatEvidence(observation.fnsku.evidence)
  );
  compareField(
    "fnsku",
    "legibility",
    groundTruth.fnsku.legibility,
    observation.fnsku.legibility,
    "legibility",
    formatEvidence(observation.fnsku.evidence)
  );
  compareField(
    "fnsku",
    "detectedValue",
    groundTruth.fnsku.detectedValue,
    observation.fnsku.detectedValue,
    "value",
    formatEvidence(observation.fnsku.evidence)
  );
  compareField(
    "fnsku",
    "placement",
    groundTruth.fnsku.placement,
    observation.fnsku.placement,
    "placement",
    formatEvidence(
      observation.fnsku.placementDescription
        ? [observation.fnsku.placementDescription, ...observation.fnsku.evidence]
        : observation.fnsku.evidence
    )
  );

  // 4. Polybag
  initFeature("polybag");
  compareField(
    "polybag",
    "visibility",
    groundTruth.polybag.visibility,
    observation.polybag.visibility,
    "visibility",
    formatEvidence(observation.polybag.evidence)
  );
  compareField(
    "polybag",
    "sealStatus",
    groundTruth.polybag.sealStatus,
    observation.polybag.sealStatus,
    "seal",
    formatEvidence(observation.polybag.evidence)
  );
  compareField(
    "polybag",
    "packagingType",
    groundTruth.polybag.packagingType,
    observation.polybag.packagingType ?? "UNCERTAIN",
    "packagingType",
    formatEvidence(observation.polybag.evidence)
  );

  // 5. Suffocation Warning
  initFeature("suffocationWarning");
  compareField(
    "suffocationWarning",
    "visibility",
    groundTruth.suffocationWarning.visibility,
    observation.suffocationWarning.visibility,
    "visibility",
    formatEvidence(observation.suffocationWarning.evidence)
  );
  compareField(
    "suffocationWarning",
    "legibility",
    groundTruth.suffocationWarning.legibility,
    observation.suffocationWarning.legibility,
    "legibility",
    formatEvidence(observation.suffocationWarning.evidence)
  );
  compareField(
    "suffocationWarning",
    "detectedText",
    groundTruth.suffocationWarning.detectedText,
    observation.suffocationWarning.detectedText,
    "value",
    formatEvidence(observation.suffocationWarning.evidence)
  );

  // 6. Handling Marks
  initFeature("handlingMarks");
  compareField(
    "handlingMarks",
    "visibility",
    groundTruth.handlingMarks.visibility,
    observation.handlingMarks.length > 0 ? "VISIBLE" : "NOT_DETECTED",
    "visibility",
    formatEvidence(observation.handlingMarks.flatMap((h) => h.evidence))
  );

  return {
    unitId: groundTruth.unitId,
    perFeature,
    mismatches,
    totalFieldsEvaluated,
    totalMatches,
    uncertainCount,
    categories,
  };
}

/**
 * Aggregates evaluations across multiple units.
 */
export function aggregateVisionMetrics(
  unitResults: UnitVisionEvaluationResult[]
): AggregateVisionMetrics {
  let totalFieldsEvaluated = 0;
  let totalMatches = 0;
  let visibilityEvaluated = 0;
  let visibilityMatches = 0;
  let legibilityEvaluated = 0;
  let legibilityMatches = 0;
  let valuesEvaluated = 0;
  let valueMatches = 0;
  let placementsEvaluated = 0;
  let placementMatches = 0;

  let hallucinationCount = 0;
  let missCount = 0;
  let unsafeAssertionCount = 0;
  let uncertainCount = 0;

  const perFeature: Record<string, FeatureVisionMetrics> = {};
  const allMismatches: VisionMismatch[] = [];

  for (const ur of unitResults) {
    totalFieldsEvaluated += ur.totalFieldsEvaluated;
    totalMatches += ur.totalMatches;
    uncertainCount += ur.uncertainCount;

    visibilityEvaluated += ur.categories.visibility.evaluated;
    visibilityMatches += ur.categories.visibility.matches;
    legibilityEvaluated += ur.categories.legibility.evaluated;
    legibilityMatches += ur.categories.legibility.matches;
    valuesEvaluated += ur.categories.value.evaluated;
    valueMatches += ur.categories.value.matches;
    placementsEvaluated += ur.categories.placement.evaluated;
    placementMatches += ur.categories.placement.matches;

    for (const [featName, feat] of Object.entries(ur.perFeature)) {
      if (!perFeature[featName]) {
        perFeature[featName] = {
          featureName: featName,
          totalFieldsEvaluated: 0,
          matches: 0,
          mismatches: [],
          hallucinations: 0,
          misses: 0,
          overassertions: 0,
        };
      }
      const agg = perFeature[featName];
      agg.totalFieldsEvaluated += feat.totalFieldsEvaluated;
      agg.matches += feat.matches;
      agg.mismatches.push(...feat.mismatches);
      agg.hallucinations += feat.hallucinations;
      agg.misses += feat.misses;
      agg.overassertions += feat.overassertions;

      hallucinationCount += feat.hallucinations;
      missCount += feat.misses;
      unsafeAssertionCount += feat.overassertions;
    }

    allMismatches.push(...ur.mismatches);
  }

  const totalUnits = unitResults.length;
  const overallAgreementRate =
    totalFieldsEvaluated > 0 ? totalMatches / totalFieldsEvaluated : 0;
  const visibilityAgreementRate =
    visibilityEvaluated > 0 ? visibilityMatches / visibilityEvaluated : 1.0;
  const legibilityAgreementRate =
    legibilityEvaluated > 0 ? legibilityMatches / legibilityEvaluated : 1.0;
  const valueAccuracyRate =
    valuesEvaluated > 0 ? valueMatches / valuesEvaluated : 1.0;
  const placementAgreementRate =
    placementsEvaluated > 0 ? placementMatches / placementsEvaluated : 1.0;

  return {
    totalUnits,
    totalFieldsEvaluated,
    totalMatches,
    overallAgreementRate,
    visibilityEvaluated,
    visibilityMatches,
    visibilityAgreementRate,
    legibilityEvaluated,
    legibilityMatches,
    legibilityAgreementRate,
    valuesEvaluated,
    valueMatches,
    valueAccuracyRate,
    placementsEvaluated,
    placementMatches,
    placementAgreementRate,
    hallucinationCount,
    missCount,
    unsafeAssertionCount,
    uncertainCount,
    perFeature,
    allMismatches,
  };
}
