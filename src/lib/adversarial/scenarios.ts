import type { PrepUnitObservation, FnskuObservation } from "../vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../compliance/work-order.schema";
import type { AdversarialScenario } from "./scenario.schema";

/**
 * Creates a baseline compliant observation fixture for a given unitId.
 */
export function createCompliantObservation(
  unitId: string,
  overrides?: Partial<PrepUnitObservation>
): PrepUnitObservation {
  const baseFnsku: FnskuObservation = {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    valueCompleteness: "COMPLETE",
    detectedValue: "X00DUMMY001",
    placement: "FLAT_SURFACE",
    placementDescription: "Centered on flat back surface",
    evidence: [
      {
        imageId: "label",
        description: "Clear FNSKU barcode on back panel",
      },
    ],
  };

  return {
    unitId,
    imageQuality: {
      overall: "GOOD",
      issues: [],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      sealStatus: "UNCERTAIN",
      packagingType: "NONE_DETECTED",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    fnsku: baseFnsku,
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    manufacturerBarcodeCoverage: {
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [
        {
          imageId: "label",
          description: "Manufacturer barcode is covered by opaque label",
        },
      ],
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
    ...(overrides?.fnsku ? { fnsku: { ...baseFnsku, ...overrides.fnsku } } : {}),
  };
}

/**
 * Baseline standard work order for retail box unit without polybag/expiry requirements.
 */
export const BASE_WORK_ORDER_UNIT_1: WorkOrderSpecification = {
  workOrderId: "WO-3000",
  unitId: "UNIT-0001",
  sku: "SKU-POUCH-TECH",
  asin: "B0DUMMY101",
  expectedFnsku: "X00DUMMY001",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Work order requiring polybag + suffocation warning (synthetic test fixture).
 */
export const BASE_WORK_ORDER_POLYBAG: WorkOrderSpecification = {
  workOrderId: "WO-3000",
  unitId: "SYNTHETIC-POLYBAG",
  sku: "SKU-PUZZLE-500",
  asin: "B0DUMMY729",
  expectedFnsku: "X00DUMMY003",
  requirements: {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Work order requiring fragile handling mark (like UNIT-0002).
 */
export const BASE_WORK_ORDER_HANDLING: WorkOrderSpecification = {
  workOrderId: "WO-3000",
  unitId: "UNIT-0002",
  sku: "SKU-CANDLE-3",
  asin: "B0DUMMY964",
  expectedFnsku: "X00DUMMY002",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "REQUIRED",
      requiredMarks: ["fragile"],
    },
  },
};

/**
 * Work order requiring expiry date.
 */
export const BASE_WORK_ORDER_EXPIRY: WorkOrderSpecification = {
  workOrderId: "WO-3000",
  unitId: "UNIT-0004",
  sku: "SKU-PROT-1KG",
  asin: "B0DUMMY357",
  expectedFnsku: "X00DUMMY004",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * 25 Canonical Adversarial Scenarios
 */
export const ADVERSARIAL_SCENARIOS: readonly AdversarialScenario[] = [
  // --------------------------------------------------------------------------
  // 1. Fully Compliant Unit -> READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-01-HAPPY-PATH",
    description: "Fully compliant unit with verified FNSKU, flat placement, and covered barcode",
    category: "HAPPY_PATH",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001"),
    expectedOperationalStatus: "READY",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "PASS",
        reasonCode: "REQUIREMENT_SATISFIED",
      },
      FNSKU_PLACEMENT: {
        applicability: "APPLICABLE",
        verdict: "PASS",
        reasonCode: "REQUIREMENT_SATISFIED",
      },
      MANUFACTURER_BARCODE_COVERAGE: {
        applicability: "APPLICABLE",
        verdict: "PASS",
        reasonCode: "REQUIREMENT_SATISFIED",
      },
    },
    expectedRecovery: {
      requiresEvidence: false,
      exactActionCount: 0,
    },
    expectedSafetyProperties: [
      "All applicable checks are PASS",
      "Operational status aggregates strictly to READY",
      "No recovery actions are generated",
    ],
  },

  // --------------------------------------------------------------------------
  // 2. Wrong FNSKU -> FAIL -> STOP_AND_FIX
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-02-WRONG-FNSKU",
    description: "Item labeled with incorrect FNSKU string different from work order",
    category: "VISIBLE_DEFECT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00WRONG999",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "label", description: "Mismatched FNSKU label" }],
      },
    }),
    expectedOperationalStatus: "STOP_AND_FIX",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "FAIL",
        reasonCode: "EXPECTED_VALUE_MISMATCH",
      },
    },
    expectedRecovery: {
      requiresEvidence: false,
      exactActionCount: 0,
    },
    expectedSafetyProperties: [
      "FNSKU value mismatch produces authoritative FAIL",
      "Operational status is STOP_AND_FIX",
      "FAIL never triggers recovery recapture",
    ],
  },

  // --------------------------------------------------------------------------
  // 3. Manufacturer Barcode Positively Visible When Coverage Required -> FAIL -> STOP_AND_FIX
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-03-BARCODE-UNCOVERED",
    description: "Manufacturer UPC/EAN barcode is positively visible and uncovered on product",
    category: "VISIBLE_DEFECT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      manufacturerBarcode: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "012345678905",
        evidence: [
          {
            imageId: "back",
            description: "Original UPC barcode is fully visible and uncovered",
          },
        ],
      },
    }),
    expectedOperationalStatus: "STOP_AND_FIX",
    expectedCriticalChecks: {
      MANUFACTURER_BARCODE_COVERAGE: {
        applicability: "APPLICABLE",
        verdict: "FAIL",
        reasonCode: "REQUIREMENT_VIOLATED",
      },
    },
    expectedRecovery: {
      requiresEvidence: false,
      exactActionCount: 0,
    },
    expectedSafetyProperties: [
      "Visible original barcode produces authoritative FAIL",
      "Operational status is STOP_AND_FIX",
    ],
  },

  // --------------------------------------------------------------------------
  // 4. FNSKU Not Detected -> UNCERTAIN -> REVIEW_REQUIRED -> targeted FNSKU recapture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-04-FNSKU-NOT-DETECTED",
    description: "FNSKU barcode was not detected in supplied photographs",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      },
      FNSKU_PLACEMENT: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      minActionCount: 1,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
    },
    expectedSafetyProperties: [
      "Non-detection never produces PASS or FAIL",
      "Operational status is REVIEW_REQUIRED",
      "Recovery agent plans targeted close-up action",
    ],
  },

  // --------------------------------------------------------------------------
  // 5. FNSKU Illegible -> UNCERTAIN -> targeted close-up
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-05-FNSKU-ILLEGIBLE",
    description: "FNSKU label visible but text is blurred / illegible",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
        placement: "FLAT_SURFACE",
        placementDescription: "Flat back surface",
        evidence: [{ imageId: "label", description: "Blurred barcode label" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "TEXT_ILLEGIBLE",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
    },
    expectedSafetyProperties: [
      "Illegible text never guessed or passed",
      "Verdict is strictly UNCERTAIN",
    ],
  },

  // --------------------------------------------------------------------------
  // 6. Uncertain FNSKU Identity + Placement -> One Deduplicated Recovery Action
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-06-FNSKU-IDENTITY-PLACEMENT-UNCERTAIN",
    description: "Co-occurring uncertain FNSKU identity and placement deduplicate into one action",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: "Partial view only",
        evidence: [{ imageId: "label", description: "Partial view of label" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      },
      FNSKU_PLACEMENT: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      exactActionCount: 1,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
      resolvedCheckTypes: ["FNSKU_IDENTITY", "FNSKU_PLACEMENT"],
    },
    expectedSafetyProperties: [
      "Both checks resolve to UNCERTAIN",
      "Recovery actions strictly deduplicate to 1 HIGH priority action",
    ],
  },

  // --------------------------------------------------------------------------
  // 7. Polybag Required But Presence Uncertain -> REVIEW_REQUIRED -> full package capture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-07-POLYBAG-REQUIRED-UNCERTAIN",
    description: "Polybag required by work order, but visual presence is UNCERTAIN",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: BASE_WORK_ORDER_POLYBAG,
    observationFixture: createCompliantObservation("SYNTHETIC-POLYBAG", {
      polybag: {
        visibility: "UNCERTAIN",
        sealStatus: "UNCERTAIN",
        packagingType: "UNCERTAIN",
        evidence: [{ imageId: "front", description: "Glare obscures outer wrap" }],
      },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat outer surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      POLYBAG_PRESENCE: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_FULL_PACKAGE"],
    },
    expectedSafetyProperties: [
      "Uncertain presence cannot satisfy work order requirement",
      "Recovery requests full package capture",
    ],
  },

  // --------------------------------------------------------------------------
  // 8. Polybag Visible But Seal Uncertain -> targeted seal capture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-08-POLYBAG-SEAL-UNCERTAIN",
    description: "Polybag is visible, but closure seal cannot be verified",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_POLYBAG,
    observationFixture: createCompliantObservation("SYNTHETIC-POLYBAG", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN",
        packagingType: "POLYBAG",
        evidence: [{ imageId: "front", description: "Polybag present but opening cropped out" }],
      },
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "WARNING: Keep this bag away from babies and children.",
        evidence: [{ imageId: "front", description: "Suffocation warning text" }],
      },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat outer surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      POLYBAG_PRESENCE: {
        applicability: "APPLICABLE",
        verdict: "PASS",
        reasonCode: "REQUIREMENT_SATISFIED",
      },
      POLYBAG_SEAL: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
    },
    expectedSafetyProperties: [
      "POLYBAG_PRESENCE is PASS while POLYBAG_SEAL is UNCERTAIN",
      "Operational status is REVIEW_REQUIRED",
      "Recovery targets bag closure",
    ],
  },

  // --------------------------------------------------------------------------
  // 9. Warning Required But Unreadable (Uncertain) -> targeted warning capture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-09-WARNING-UNREADABLE",
    description: "Suffocation warning required, printed block visible but text unreadable / uncertain",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_POLYBAG,
    observationFixture: createCompliantObservation("SYNTHETIC-POLYBAG", {
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "SEALED",
        packagingType: "POLYBAG",
        evidence: [{ imageId: "front", description: "Sealed polybag" }],
      },
      suffocationWarning: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [{ imageId: "front", description: "Unreadable text block on bag" }],
      },
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY003",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat outer surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      SUFFOCATION_WARNING_PRESENCE: {
        applicability: "APPLICABLE",
        verdict: "PASS",
      },
      SUFFOCATION_WARNING_LEGIBILITY: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
    },
    expectedSafetyProperties: [
      "Uncertain warning does not pass compliance",
      "Targeted warning recapture is generated",
    ],
  },

  // --------------------------------------------------------------------------
  // 10. Expiry Required But Unreadable (Uncertain) -> targeted expiry capture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-10-EXPIRY-UNREADABLE",
    description: "Expiration date required by work order, stamp is unreadable / uncertain",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_EXPIRY,
    observationFixture: createCompliantObservation("UNIT-0004", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY004",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
      expiryDate: {
        visibility: "VISIBLE",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [{ imageId: "back", description: "Smudged expiration stamp" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      EXPIRY_VISIBILITY: {
        applicability: "APPLICABLE",
        verdict: "PASS",
      },
      EXPIRY_LEGIBILITY: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_CLOSEUP"],
    },
    expectedSafetyProperties: [
      "Uncertain expiry produces UNCERTAIN",
      "Operational status is REVIEW_REQUIRED",
    ],
  },

  // --------------------------------------------------------------------------
  // 11. Handling Mark Required But Evidence Insufficient -> targeted package recapture
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-11-HANDLING-MARKS-INSUFFICIENT",
    description: "Fragile handling mark required, but not detected in supplied views",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: BASE_WORK_ORDER_HANDLING,
    observationFixture: createCompliantObservation("UNIT-0002", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY002",
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      },
      handlingMarks: [],
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      HANDLING_MARKS: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "FEATURE_NOT_DETECTED",
      },
    },
    expectedRecovery: {
      requiresEvidence: true,
      expectedActionTypes: ["CAPTURE_FULL_PACKAGE"],
    },
    expectedSafetyProperties: [
      "Missing handling mark is UNCERTAIN (non-detection is not confirmation of absence)",
      "Operational status is REVIEW_REQUIRED",
      "Recovery requests full package recapture",
    ],
  },

  // --------------------------------------------------------------------------
  // 12. FAIL + UNCERTAIN Simultaneously -> overall STOP_AND_FIX -> FAIL must dominate
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-12-FAIL-PLUS-UNCERTAIN",
    description: "Unit has an active defect (wrong FNSKU) and an uncertain check (polybag seal)",
    category: "MIXED_FAIL_UNCERTAIN",
    workOrder: BASE_WORK_ORDER_POLYBAG,
    observationFixture: createCompliantObservation("SYNTHETIC-POLYBAG", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00WRONG999", // FAIL
        placement: "FLAT_SURFACE",
        placementDescription: "Flat surface",
        evidence: [{ imageId: "label", description: "Wrong FNSKU" }],
      },
      polybag: {
        visibility: "VISIBLE",
        sealStatus: "UNCERTAIN", // UNCERTAIN
        packagingType: "POLYBAG",
        evidence: [{ imageId: "front", description: "Seal uncertain" }],
      },
    }),
    expectedOperationalStatus: "STOP_AND_FIX",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: {
        applicability: "APPLICABLE",
        verdict: "FAIL",
      },
      POLYBAG_SEAL: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
      },
    },
    expectedRecovery: {
      requiresEvidence: false, // in STOP_AND_FIX, floor action is physical fix, not photo recapture
      exactActionCount: 0,
    },
    expectedSafetyProperties: [
      "FAIL strictly dominates UNCERTAIN in operational status aggregation",
      "Status is STOP_AND_FIX, never REVIEW_REQUIRED or READY",
    ],
  },

  // --------------------------------------------------------------------------
  // 13. Multiple FAIL Checks -> STOP_AND_FIX -> All Blocking Checks Retained
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-13-MULTIPLE-FAILS",
    description: "Unit with multiple physical defects: wrong FNSKU + uncovered manufacturer barcode",
    category: "MULTIPLE_DEFECTS",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00WRONG999", // FAIL
        placement: "CURVED_SURFACE", // FAIL (prohibited)
        placementDescription: "Wrapped around cylindrical curve",
        evidence: [{ imageId: "label", description: "Wrong FNSKU on curve" }],
      },
      manufacturerBarcode: {
        visibility: "VISIBLE", // FAIL (uncovered)
        legibility: "LEGIBLE",
        detectedValue: "8906050590022",
        evidence: [{ imageId: "back", description: "Uncovered barcode" }],
      },
    }),
    expectedOperationalStatus: "STOP_AND_FIX",
    expectedCriticalChecks: {
      FNSKU_IDENTITY: { verdict: "FAIL" },
      FNSKU_PLACEMENT: { verdict: "FAIL" },
      MANUFACTURER_BARCODE_COVERAGE: { verdict: "FAIL" },
    },
    expectedRecovery: {
      requiresEvidence: false,
      exactActionCount: 0,
    },
    expectedSafetyProperties: [
      "All failing check types retained in blockingCheckTypes",
      "Status is STOP_AND_FIX",
    ],
  },

  // --------------------------------------------------------------------------
  // 14. All Checks NOT_APPLICABLE -> REVIEW_REQUIRED -> never READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-14-ALL-NOT-APPLICABLE",
    description: "Work order where every requirement is not applicable (zero applicable checks)",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: {
      workOrderId: "WO-EMPTY",
      unitId: "UNIT-EMPTY",
      sku: "SKU-EMPTY",
      asin: "B0EMPTY",
      expectedFnsku: "X00EMPTY",
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "NOT_REQUIRED",
          requiredMarks: [],
        },
      },
    },
    // Observation where all checks resolve to NOT_APPLICABLE (handled specially in test harness)
    observationFixture: createCompliantObservation("UNIT-EMPTY"),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedSafetyProperties: [
      "Zero applicable checks must NEVER resolve to READY",
      "Operational status is strictly REVIEW_REQUIRED",
    ],
  },

  // --------------------------------------------------------------------------
  // 15. Unknown Work-Order Requirement -> Conservative Result -> Never NOT_REQUIRED
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-15-UNKNOWN-WORK-ORDER-REQUIREMENT",
    description: "Work order with UNKNOWN requirement state resolves conservatively to UNCERTAIN",
    category: "INSUFFICIENT_EVIDENCE",
    workOrder: {
      workOrderId: "WO-UNKNOWN-REQ",
      unitId: "UNIT-0001",
      sku: "SKU-POUCH-TECH",
      asin: "B0DUMMY101",
      expectedFnsku: "X00DUMMY001",
      requirements: {
        polybag: "UNKNOWN",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: {
          state: "NOT_REQUIRED",
          requiredMarks: [],
        },
      },
    },
    observationFixture: createCompliantObservation("UNIT-0001"),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      POLYBAG_PRESENCE: {
        applicability: "UNKNOWN",
        verdict: "UNCERTAIN",
        reasonCode: "REQUIREMENT_UNKNOWN",
      },
    },
    expectedSafetyProperties: [
      "UNKNOWN requirement intent is never silently treated as NOT_REQUIRED",
      "Verdict is UNCERTAIN, reasonCode is REQUIREMENT_UNKNOWN",
      "Operational status is REVIEW_REQUIRED",
    ],
  },

  // --------------------------------------------------------------------------
  // 16. ACROSS_SEAM Without Verified Unit-Level Policy -> UNCERTAIN -> Never Invent FAIL/PASS
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-16-ACROSS-SEAM-UNVERIFIED",
    description: "FNSKU placed across package seam; unit policy only specifies FLAT vs CURVED/OBSTRUCTED",
    category: "AMBIGUOUS_EVIDENCE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001", {
      fnsku: {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue: "X00DUMMY001",
        placement: "ACROSS_SEAM",
        placementDescription: "Label placed across box edge seam",
        evidence: [{ imageId: "label", description: "Label across seam" }],
      },
    }),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedCriticalChecks: {
      FNSKU_PLACEMENT: {
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
      },
    },
    expectedSafetyProperties: [
      "ACROSS_SEAM does not trigger synthetic FAIL or PASS",
      "Verdict remains safely UNCERTAIN pending verified policy",
    ],
  },

  // --------------------------------------------------------------------------
  // 17. Evidence Quality Missing Required Image -> Inspection Blocked Before Model Call
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-17-QUALITY-MISSING-SLOT",
    description: "Evidence readiness gate blocks inspection when required slot is missing",
    category: "BAD_INPUT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedSafetyProperties: [
      "Evidence quality gate rejects input with canInspect = false",
      "Model inference is strictly blocked",
    ],
  },

  // --------------------------------------------------------------------------
  // 18. Duplicate Evidence Across Slots -> WARNING -> Inspection May Continue
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-18-DUPLICATE-SLOT-EVIDENCE",
    description: "Identical image uploaded for multiple slots produces WARNING but canInspect = true",
    category: "BAD_INPUT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedSafetyProperties: [
      "Evidence quality gate flags DUPLICATE_IMAGE issue with status WARNING",
      "canInspect remains true, allowing inspection to continue",
    ],
  },

  // --------------------------------------------------------------------------
  // 19. Low-Resolution Evidence -> WARNING -> Inspection May Continue
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-19-LOW-RES-EVIDENCE",
    description: "Image below recommended resolution produces WARNING without hard failure",
    category: "BAD_INPUT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedSafetyProperties: [
      "Low resolution produces slot status WARNING",
      "canInspect remains true",
    ],
  },

  // --------------------------------------------------------------------------
  // 20. Malformed API Input -> Safe Structured Error
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-20-MALFORMED-API-INPUT",
    description: "API payload missing required fields returns HTTP 400 structured error",
    category: "BAD_INPUT",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    rawObservation: { invalidField: true },
    expectedError: {
      isExpected: true,
      errorType: "ZodError",
      messageSnippet: "Malformed request payload",
    },
    expectedSafetyProperties: [
      "API never crashes with unhandled exception",
      "Returns HTTP 400 with structured validation details",
    ],
  },

  // --------------------------------------------------------------------------
  // 21. Model Failure: Gemini Exception -> Handled Safely, Never READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-21-MODEL-FAILURE-GEMINI-EXCEPTION",
    description: "Gemini client throws 503 or network error",
    category: "MODEL_FAILURE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedError: {
      isExpected: true,
      errorType: "Error",
      messageSnippet: "Gemini service unavailable",
    },
    expectedSafetyProperties: [
      "Model failure never produces READY or PASS",
      "Controlled error returned upstream",
    ],
  },

  // --------------------------------------------------------------------------
  // 22. Model Failure: Malformed JSON Output -> Handled Safely, Never READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-22-MODEL-FAILURE-MALFORMED-JSON",
    description: "Gemini returns non-JSON or truncated string",
    category: "MODEL_FAILURE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedError: {
      isExpected: true,
      errorType: "SyntaxError",
      messageSnippet: "JSON",
    },
    expectedSafetyProperties: [
      "Malformed model text is rejected at JSON parse boundary",
      "System never fabricates default observations",
    ],
  },

  // --------------------------------------------------------------------------
  // 23. Model Failure: Schema-Invalid Enum -> Handled Safely, Never READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-23-MODEL-FAILURE-INVALID-ENUM",
    description: "Gemini returns invented enum string not in prepObservationSchema",
    category: "MODEL_FAILURE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    expectedError: {
      isExpected: true,
      errorType: "ZodError",
      messageSnippet: "Invalid enum value",
    },
    expectedSafetyProperties: [
      "Invalid enum value rejected by Zod parser",
      "System never converts schema failure to PASS",
    ],
  },

  // --------------------------------------------------------------------------
  // 24. Work Order Cannot Be Resolved -> Safe Error, Never READY
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-24-WORK-ORDER-NOT-FOUND",
    description: "Work order resolver queries an unregistered unit ID",
    category: "BAD_INPUT",
    workOrder: {
      workOrderId: "WO-NONEXISTENT",
      unitId: "UNIT-9999",
      sku: "SKU-UNKNOWN",
      asin: "B0UNKNOWN",
      expectedFnsku: "X00UNKNOWN",
      requirements: {
        polybag: "NOT_REQUIRED",
        suffocationWarning: "NOT_REQUIRED",
        expiryDate: "NOT_REQUIRED",
        handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
      },
    },
    expectedError: {
      isExpected: true,
      errorType: "Error",
      messageSnippet: "Work order not found",
    },
    expectedSafetyProperties: [
      "Unresolved work order throws clear error",
      "System never invents synthetic work order specs",
    ],
  },

  // --------------------------------------------------------------------------
  // 25. Policy Lookup Unavailable / Missing -> Conservative UNCERTAIN
  // --------------------------------------------------------------------------
  {
    scenarioId: "SCENARIO-25-POLICY-LOOKUP-MISSING",
    description: "Rule registry missing rule for check produces UNCERTAIN / RULE_UNAVAILABLE",
    category: "MODEL_FAILURE",
    workOrder: BASE_WORK_ORDER_UNIT_1,
    observationFixture: createCompliantObservation("UNIT-0001"),
    expectedOperationalStatus: "REVIEW_REQUIRED",
    expectedSafetyProperties: [
      "Missing rule never crashes the inspection orchestrator",
      "Check outcome is UNCERTAIN with reasonCode RULE_UNAVAILABLE",
      "Operational status is REVIEW_REQUIRED, never READY",
    ],
  },
];
