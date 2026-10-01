import type { UnitVisionGroundTruth } from "./vision-ground-truth.schema";

/**
 * ============================================================================
 * MANUALLY LABELED VISION GROUND TRUTH (DAY 3 / STEP 5)
 * ============================================================================
 *
 * Sourced purely by manual inspection of the physical fixture photographs:
 * - fixtures/prep/dev/UNIT-0001 (Oblique Tech Pouch box)
 * - fixtures/prep/dev/UNIT-0002 (Banjara's Multani Mitti Face Pack box)
 *
 * STRICT PRINCIPLE:
 * Contains ONLY objectively verifiable physical visual facts.
 * Unlabeled / unconfirmed facts are marked "NOT_LABELED".
 * Never uses Gemini output to generate its own labels.
 * ============================================================================
 */
export const FIXTURE_VISION_GROUND_TRUTH: Record<string, UnitVisionGroundTruth> = {
  "UNIT-0001": {
    unitId: "UNIT-0001",
    description: "Oblique Tech Pouch cardboard retail packaging box",
    manufacturerBarcode: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8906126921460",
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "NOT_LABELED",
      detectedValue: null,
    },
    fnsku: {
      visibility: "NOT_DETECTED",
      legibility: "NOT_LABELED",
      detectedValue: null,
      placement: "NOT_LABELED",
    },
    polybag: {
      visibility: "NOT_DETECTED",
      sealStatus: "NOT_LABELED",
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "NOT_LABELED",
      detectedText: "NOT_LABELED",
    },
    handlingMarks: {
      visibility: "NOT_DETECTED",
      expectedMarks: [],
    },
  },

  "UNIT-0002": {
    unitId: "UNIT-0002",
    description: "Banjara's Multani Mitti Sandal Face Pack 100g retail carton",
    manufacturerBarcode: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8906050590022",
    },
    expiryDate: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "10/2027",
    },
    fnsku: {
      visibility: "NOT_DETECTED",
      legibility: "NOT_LABELED",
      detectedValue: null,
      placement: "NOT_LABELED",
    },
    polybag: {
      visibility: "NOT_DETECTED",
      sealStatus: "NOT_LABELED",
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "NOT_LABELED",
      detectedText: "NOT_LABELED",
    },
    handlingMarks: {
      visibility: "NOT_DETECTED",
      expectedMarks: [],
    },
  },
};
