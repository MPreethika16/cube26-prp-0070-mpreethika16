import type { PrepUnitObservation } from "../vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../compliance/work-order.schema";
import type { EvaluationCase } from "./evaluation-case.schema";

/**
 * Helper to construct a canonical baseline observation with optional overrides.
 */
function createObservation(
  unitId: string,
  overrides?: Partial<PrepUnitObservation>
): PrepUnitObservation {
  return {
    unitId,
    imageQuality: {
      overall: "GOOD",
      issues: [],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      sealStatus: "UNCERTAIN",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    fnsku: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
    ...overrides,
  };
}

/**
 * Helper to construct a canonical baseline work order with optional overrides.
 */
function createWorkOrder(
  unitId: string,
  overrides?: Partial<WorkOrderSpecification>
): WorkOrderSpecification {
  return {
    workOrderId: `WO-${unitId}`,
    unitId,
    sku: `SKU-${unitId}`,
    asin: "B00TEST123",
    expectedFnsku: "X001TESTFNSKU",
    requirements: {
      polybag: "NOT_REQUIRED",
      suffocationWarning: "NOT_REQUIRED",
      expiryDate: "NOT_REQUIRED",
      handlingMarks: {
        state: "NOT_REQUIRED",
        requiredMarks: [],
      },
    },
    ...overrides,
  };
}

/**
 * ============================================================================
 * DETERMINISTIC LABELED EVALUATION DATASET (DAY 3 / STEP 4)
 * ============================================================================
 *
 * 42 deterministic synthetic test fixtures covering all 10 prep check types,
 * boundary conditions, edge cases, policy gaps, and non-detection safety.
 *
 * Strictly synthetic — NOT production observations, NO Gemini API calls.
 * ============================================================================
 */
export const EVALUATION_DATASET: EvaluationCase[] = [
  // --------------------------------------------------------------------------
  // 1. FNSKU_IDENTITY (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-FNSKU-ID-01",
    description: "Exact expected FNSKU identity match (happy path)",
    checkType: "FNSKU_IDENTITY",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-FNSKU-ID-01", {
      expectedFnsku: "X001TESTFNSKU",
    }),
    observation: createObservation("CASE-FNSKU-ID-01", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X001TESTFNSKU",
        placement: "FLAT_SURFACE",
        placementDescription: "Centered on flat front face",
        evidence: [
          { imageId: "label", description: "Clear view of FNSKU barcode" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-FNSKU-ID-02",
    description: "Mismatched FNSKU identifier (positive defect)",
    checkType: "FNSKU_IDENTITY",
    category: "POSITIVE_DEFECT",
    workOrder: createWorkOrder("CASE-FNSKU-ID-02", {
      expectedFnsku: "X001TESTFNSKU",
    }),
    observation: createObservation("CASE-FNSKU-ID-02", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        valueCompleteness: "COMPLETE",
        detectedValue: "X001WRONGVALUE",
        placement: "FLAT_SURFACE",
        placementDescription: "On flat surface",
        evidence: [
          {
            imageId: "label",
            description: "Visible barcode with incorrect alphanumeric text",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "EXPECTED_VALUE_MISMATCH",
    },
  },
  {
    caseId: "CASE-FNSKU-ID-03",
    description: "FNSKU barcode not detected in photos (conservative abstention)",
    checkType: "FNSKU_IDENTITY",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-FNSKU-ID-03", {
      expectedFnsku: "X001TESTFNSKU",
    }),
    observation: createObservation("CASE-FNSKU-ID-03", {
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-FNSKU-ID-04",
    description: "FNSKU barcode visibly present but text is blurry/illegible",
    checkType: "FNSKU_IDENTITY",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-FNSKU-ID-04", {
      expectedFnsku: "X001TESTFNSKU",
    }),
    observation: createObservation("CASE-FNSKU-ID-04", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [
          { imageId: "label", description: "Severe motion blur on barcode text" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
    },
  },

  // --------------------------------------------------------------------------
  // 2. FNSKU_PLACEMENT (5 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-FNSKU-PLC-01",
    description: "FNSKU placed on smooth flat surface (verified allowed)",
    checkType: "FNSKU_PLACEMENT",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-FNSKU-PLC-01"),
    observation: createObservation("CASE-FNSKU-PLC-01", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TESTFNSKU",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat back panel",
        evidence: [{ imageId: "back", description: "Label flat on back panel" }],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-FNSKU-PLC-02",
    description: "FNSKU wrapped around curved cylinder surface (prohibited)",
    checkType: "FNSKU_PLACEMENT",
    category: "POSITIVE_DEFECT",
    workOrder: createWorkOrder("CASE-FNSKU-PLC-02"),
    observation: createObservation("CASE-FNSKU-PLC-02", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TESTFNSKU",
        placement: "CURVED_SURFACE",
        placementDescription: "Curved around cylindrical bottle body",
        evidence: [
          {
            imageId: "front",
            description: "Barcode distorted across curved cylinder circumference",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "PLACEMENT_INVALID",
    },
  },
  {
    caseId: "CASE-FNSKU-PLC-03",
    description: "FNSKU physically obstructed by tape or packaging flap",
    checkType: "FNSKU_PLACEMENT",
    category: "POSITIVE_DEFECT",
    workOrder: createWorkOrder("CASE-FNSKU-PLC-03"),
    observation: createObservation("CASE-FNSKU-PLC-03", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TESTFNSKU",
        placement: "OBSTRUCTED",
        placementDescription: "Partially covered by opaque packing tape",
        evidence: [
          {
            imageId: "back",
            description: "Tape obstructs right side of the barcode bars",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "PLACEMENT_INVALID",
    },
  },
  {
    caseId: "CASE-FNSKU-PLC-04",
    description:
      "FNSKU placed across package seam (POLICY GAP — conservative abstention)",
    checkType: "FNSKU_PLACEMENT",
    category: "POLICY_GAP",
    workOrder: createWorkOrder("CASE-FNSKU-PLC-04"),
    observation: createObservation("CASE-FNSKU-PLC-04", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X001TESTFNSKU",
        placement: "ACROSS_SEAM",
        placementDescription: "Spans box flap fold seam",
        evidence: [
          {
            imageId: "back",
            description: "Label applied across the opening seam of the carton",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },
  {
    caseId: "CASE-FNSKU-PLC-05",
    description: "FNSKU not detected so placement cannot be evaluated",
    checkType: "FNSKU_PLACEMENT",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-FNSKU-PLC-05"),
    observation: createObservation("CASE-FNSKU-PLC-05", {
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },

  // --------------------------------------------------------------------------
  // 3. MANUFACTURER_BARCODE_COVERAGE (3 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-BARCODE-01",
    description:
      "Original manufacturer barcode is visibly uncovered (positive defect)",
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    category: "POSITIVE_DEFECT",
    workOrder: createWorkOrder("CASE-BARCODE-01"),
    observation: createObservation("CASE-BARCODE-01", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [
          {
            imageId: "back",
            description: "Uncovered UPC barcode plainly visible on retail box",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
    },
  },
  {
    caseId: "CASE-BARCODE-02",
    description:
      "Manufacturer barcode NOT_DETECTED (does NOT prove coverage; UNCERTAIN)",
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-BARCODE-02"),
    observation: createObservation("CASE-BARCODE-02", {
      manufacturerBarcode: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-BARCODE-03",
    description: "Manufacturer barcode area obscured or glare creates UNCERTAIN",
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-BARCODE-03"),
    observation: createObservation("CASE-BARCODE-03", {
      manufacturerBarcode: {
        visibility: "UNCERTAIN",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [
          {
            imageId: "back",
            description: "Flash glare directly over barcode region",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },

  // --------------------------------------------------------------------------
  // 4. POLYBAG_PRESENCE (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-POLY-PRES-01",
    description: "Polybag required by work order and visibly present (happy path)",
    checkType: "POLYBAG_PRESENCE",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-POLY-PRES-01", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-PRES-01", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [
          {
            imageId: "front",
            description: "Clear polybag encasing product unit",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-POLY-PRES-02",
    description: "Polybag required by work order but not detected in photos",
    checkType: "POLYBAG_PRESENCE",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-POLY-PRES-02", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-PRES-02", {
      polybag: {
        visibility: "NOT_DETECTED",
        sealStatus: "UNCERTAIN",
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-POLY-PRES-03",
    description: "Polybag required by work order but visibility is UNCERTAIN",
    checkType: "POLYBAG_PRESENCE",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-POLY-PRES-03", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-PRES-03", {
      polybag: {
        visibility: "UNCERTAIN",
        sealStatus: "UNCERTAIN",
        evidence: [
          { imageId: "front", description: "Uncertain if film is shrink or bag" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },
  {
    caseId: "CASE-POLY-PRES-04",
    description: "Polybag not required by work order (NOT_APPLICABLE)",
    checkType: "POLYBAG_PRESENCE",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-POLY-PRES-04", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-PRES-04"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 5. POLYBAG_SEAL (5 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-POLY-SEAL-01",
    description: "Polybag required and visibly sealed (happy path)",
    checkType: "POLYBAG_SEAL",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-POLY-SEAL-01", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-SEAL-01", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        evidence: [
          {
            imageId: "back",
            description: "Heat-sealed adhesive strip completely closed",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-POLY-SEAL-02",
    description: "Polybag required and visibly unsealed/open (positive defect)",
    checkType: "POLYBAG_SEAL",
    category: "POSITIVE_DEFECT",
    workOrder: createWorkOrder("CASE-POLY-SEAL-02", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-SEAL-02", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "NOT_SEALED",
        evidence: [
          {
            imageId: "back",
            description: "Top flap of polybag is wide open with no seal",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
    },
  },
  {
    caseId: "CASE-POLY-SEAL-03",
    description: "Polybag required but not detected (seal cannot be assessed)",
    checkType: "POLYBAG_SEAL",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-POLY-SEAL-03", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-SEAL-03", {
      polybag: {
        visibility: "NOT_DETECTED",
        sealStatus: "UNCERTAIN",
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-POLY-SEAL-04",
    description:
      "Polybag visible but seal closure is ambiguous/obscured in photo",
    checkType: "POLYBAG_SEAL",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-POLY-SEAL-04", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-SEAL-04", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN",
        evidence: [
          {
            imageId: "back",
            description: "End of bag folded under and hidden from view",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },
  {
    caseId: "CASE-POLY-SEAL-05",
    description: "Polybag not required by work order (NOT_APPLICABLE)",
    checkType: "POLYBAG_SEAL",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-POLY-SEAL-05", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-POLY-SEAL-05"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 6. SUFFOCATION_WARNING_PRESENCE (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-WARN-PRES-01",
    description:
      "Suffocation warning required and visibly detected (happy path)",
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-WARN-PRES-01", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-PRES-01", {
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "WARNING: Keep this bag away from babies and children.",
        evidence: [
          {
            imageId: "front",
            description: "Printed warning paragraph on face of bag",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-WARN-PRES-02",
    description:
      "Suffocation warning required by work order but not detected in photos",
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-WARN-PRES-02", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-PRES-02", {
      suffocationWarning: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-WARN-PRES-03",
    description:
      "Suffocation warning required but visual determination is UNCERTAIN",
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-WARN-PRES-03", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-PRES-03", {
      suffocationWarning: {
        visibility: "UNCERTAIN",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [
          {
            imageId: "front",
            description: "Partial small text block cut off at image boundary",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },
  {
    caseId: "CASE-WARN-PRES-04",
    description:
      "Suffocation warning not required by work order (NOT_APPLICABLE)",
    checkType: "SUFFOCATION_WARNING_PRESENCE",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-WARN-PRES-04", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-PRES-04"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 7. SUFFOCATION_WARNING_LEGIBILITY (5 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-WARN-LEG-01",
    description: "Suffocation warning visibly present and fully legible (happy path)",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-WARN-LEG-01", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-LEG-01", {
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "WARNING: Keep away from small children.",
        evidence: [
          { imageId: "front", description: "Sharp, clearly legible print" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-WARN-LEG-02",
    description:
      "Suffocation warning visibly present but smeared and illegible (evidence cannot establish readability)",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-WARN-LEG-02", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-LEG-02", {
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedText: null,
        evidence: [
          {
            imageId: "front",
            description: "Ink is smudged and text cannot be deciphered",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
    },
  },
  {
    caseId: "CASE-WARN-LEG-03",
    description:
      "Suffocation warning not detected in photos (legibility UNCERTAIN)",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-WARN-LEG-03", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-LEG-03", {
      suffocationWarning: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-WARN-LEG-04",
    description:
      "Suffocation warning visible but legibility is visually UNCERTAIN",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-WARN-LEG-04", {
      requirements: {
        polybag: "REQUIRED",
        suffocationWarning: "REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-LEG-04", {
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [
          {
            imageId: "front",
            description: "Resolution too low to determine legibility",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    },
  },
  {
    caseId: "CASE-WARN-LEG-05",
    description:
      "Suffocation warning legibility not required by work order (NOT_APPLICABLE)",
    checkType: "SUFFOCATION_WARNING_LEGIBILITY",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-WARN-LEG-05", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-WARN-LEG-05"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 8. EXPIRY_VISIBILITY (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-EXP-VIS-01",
    description: "Expiry date required and visibly present (happy path)",
    checkType: "EXPIRY_VISIBILITY",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-EXP-VIS-01", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-VIS-01", {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "EXP 2027-10-31",
        evidence: [
          {
            imageId: "back",
            description: "Clear dot-matrix expiration print on top lid",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-EXP-VIS-02",
    description:
      "Expiry date required by work order but not detected in photos",
    checkType: "EXPIRY_VISIBILITY",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-EXP-VIS-02", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-VIS-02", {
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-EXP-VIS-03",
    description:
      "Expiry date required but visible date is illegible (visibility check produces UNCERTAIN)",
    checkType: "EXPIRY_VISIBILITY",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-EXP-VIS-03", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-VIS-03", {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [
          { imageId: "back", description: "Unreadable faded date stamp" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
    },
  },
  {
    caseId: "CASE-EXP-VIS-04",
    description: "Expiry date not required by work order (NOT_APPLICABLE)",
    checkType: "EXPIRY_VISIBILITY",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-EXP-VIS-04", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-VIS-04"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 9. EXPIRY_LEGIBILITY (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-EXP-LEG-01",
    description: "Expiry date required and fully legible (happy path)",
    checkType: "EXPIRY_LEGIBILITY",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-EXP-LEG-01", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-LEG-01", {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "2027-10",
        evidence: [
          { imageId: "back", description: "Legible laser-etched expiration" },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-EXP-LEG-02",
    description:
      "Expiry date visibly present but stamped illegibly (evidence cannot establish readability)",
    checkType: "EXPIRY_LEGIBILITY",
    category: "AMBIGUOUS_VISUAL",
    workOrder: createWorkOrder("CASE-EXP-LEG-02", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-LEG-02", {
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        evidence: [
          {
            imageId: "back",
            description: "Date stamp is smeared and unreadable",
          },
        ],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "TEXT_ILLEGIBLE",
    },
  },
  {
    caseId: "CASE-EXP-LEG-03",
    description: "Expiry date not detected in photos (legibility UNCERTAIN)",
    checkType: "EXPIRY_LEGIBILITY",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-EXP-LEG-03", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-LEG-03", {
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-EXP-LEG-04",
    description: "Expiry date legibility not required (NOT_APPLICABLE)",
    checkType: "EXPIRY_LEGIBILITY",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-EXP-LEG-04", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    }),
    observation: createObservation("CASE-EXP-LEG-04"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },

  // --------------------------------------------------------------------------
  // 10. HANDLING_MARKS (4 cases)
  // --------------------------------------------------------------------------
  {
    caseId: "CASE-HANDLING-01",
    description:
      "All required handling marks [fragile, this_way_up] positively detected (happy path)",
    checkType: "HANDLING_MARKS",
    category: "HAPPY_PATH",
    workOrder: createWorkOrder("CASE-HANDLING-01", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "REQUIRED",
          requiredMarks: ["fragile", "this_way_up"],
        },
      },
    }),
    observation: createObservation("CASE-HANDLING-01", {
      handlingMarks: [
        {
          detectedType: "fragile",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "FRAGILE - HANDLE WITH CARE",
          evidence: [
            { imageId: "front", description: "Prominent cracked glass icon" },
          ],
        },
        {
          detectedType: "this_way_up",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "THIS WAY UP",
          evidence: [
            { imageId: "front", description: "Two upward pointing arrows" },
          ],
        },
      ],
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
    },
  },
  {
    caseId: "CASE-HANDLING-02",
    description:
      "Required handling mark [fragile] not detected (conservative UNCERTAIN, never FAIL)",
    checkType: "HANDLING_MARKS",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-HANDLING-02", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "REQUIRED",
          requiredMarks: ["fragile"],
        },
      },
    }),
    observation: createObservation("CASE-HANDLING-02", {
      handlingMarks: [],
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-HANDLING-03",
    description:
      "Partial required marks: [fragile] verified but [this_way_up] missing (UNCERTAIN)",
    checkType: "HANDLING_MARKS",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: createWorkOrder("CASE-HANDLING-03", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "REQUIRED",
          requiredMarks: ["fragile", "this_way_up"],
        },
      },
    }),
    observation: createObservation("CASE-HANDLING-03", {
      handlingMarks: [
        {
          detectedType: "fragile",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText: "FRAGILE",
          evidence: [{ imageId: "front", description: "Glass icon visible" }],
        },
      ],
    }),
    expected: {
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
    },
  },
  {
    caseId: "CASE-HANDLING-04",
    description:
      "Handling marks not required by work order (NOT_APPLICABLE)",
    checkType: "HANDLING_MARKS",
    category: "NOT_APPLICABLE",
    workOrder: createWorkOrder("CASE-HANDLING-04", {
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "NOT_REQUIRED",
          requiredMarks: [],
        },
      },
    }),
    observation: createObservation("CASE-HANDLING-04"),
    expected: {
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
    },
  },
];
