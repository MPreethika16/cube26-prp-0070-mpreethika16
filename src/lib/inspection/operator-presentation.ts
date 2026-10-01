import type { PrepCheckType } from "../compliance/check-types";
import type { WorkOrderSpecification } from "../compliance/work-order.schema";
import type { PrepUnitObservation } from "../vision/prep-observation.schema";
import type { EnrichedComplianceCheck } from "./inspection-view-model";
import type { EvidenceRecoveryPlan } from "../recovery/recovery-action.schema";

/**
 * ============================================================================
 * HUMAN-FIRST OPERATOR PRESENTATION LAYER (Day 5 / Step 3.2)
 * ============================================================================
 *
 * CRITICAL ARCHITECTURAL PRINCIPLE:
 * THE OPERATOR SHOULD NEVER HAVE TO INTERPRET A COMPLIANCE RESULT.
 *
 * This layer translates internal compliance checks, AI observations, and
 * recovery directives into human-first, physical warehouse instructions.
 *
 * THIS MAPPING IS STRICTLY PRESENTATION-ONLY:
 * - Internal verdicts (PASS, FAIL, UNCERTAIN, NOT_APPLICABLE) remain unchanged.
 * - Machine results, rules, provenance, and auditability are strictly preserved.
 * - Never used to calculate or alter compliance.
 * - Strictly zero fabricated bounding boxes or coordinates.
 * ============================================================================
 */

export type SlotId = "front" | "back" | "label";

/** Presentation-only mapping of internal verdicts to human states */
export const VERDICT_HUMAN_MAPPING = {
  PASS: "Done",
  FAIL: "Fix needed",
  UNCERTAIN: "Need a clearer photo",
} as const;

/** Presentation-only mapping of check types to physical action titles */
export const CHECK_HUMAN_TITLES: Record<PrepCheckType, string> = {
  MANUFACTURER_BARCODE_COVERAGE: "Cover manufacturer barcode",
  FNSKU_IDENTITY: "Check product label",
  FNSKU_PLACEMENT: "Move product label",
  POLYBAG_SEAL: "Seal the bag",
  POLYBAG_PRESENCE: "Put item in polybag",
  SUFFOCATION_WARNING_PRESENCE: "Add safety warning",
  SUFFOCATION_WARNING_LEGIBILITY: "Make warning readable",
  EXPIRY_VISIBILITY: "Show expiry date",
  EXPIRY_LEGIBILITY: "Retake expiry photo",
  HANDLING_MARKS: "Add required handling label",
};

/** Pre-inspection photo capture guidance */
export const PHOTO_CAPTURE_GUIDANCE: Record<
  SlotId,
  {
    name: string;
    instruction: string;
    shortHint: string;
  }
> = {
  front: {
    name: "Front",
    instruction: "Capture the full front of the item.",
    shortHint: "Keep the whole item visible inside the frame.",
  },
  back: {
    name: "Back",
    instruction: "Capture the full back and any printed dates.",
    shortHint: "Make sure barcodes and printed dates are facing the camera.",
  },
  label: {
    name: "Label",
    instruction: "Get close enough to clearly read the product label and barcode.",
    shortHint: "Barcode bars and text must be sharp and in focus.",
  },
};

/**
 * Strict deterministic ordering for presenting problems to the operator.
 * The operator should never have to decide which technical check to address first.
 *
 * Physical defects (FAIL) are addressed before evidence recovery (UNCERTAIN).
 */
export const DETERMINISTIC_CHECK_TYPE_ORDER: PrepCheckType[] = [
  "MANUFACTURER_BARCODE_COVERAGE",
  "FNSKU_IDENTITY",
  "FNSKU_PLACEMENT",
  "POLYBAG_PRESENCE",
  "POLYBAG_SEAL",
  "SUFFOCATION_WARNING_PRESENCE",
  "SUFFOCATION_WARNING_LEGIBILITY",
  "EXPIRY_VISIBILITY",
  "EXPIRY_LEGIBILITY",
  "HANDLING_MARKS",
];

export interface OperatorActionableTask {
  id: string;
  checkType: PrepCheckType;
  // All checks resolved by this action (e.g. ["FNSKU_IDENTITY", "FNSKU_PLACEMENT"])
  resolvesCheckTypes: PrepCheckType[];
  // Auditability: keep exact internal machine verdict attached underneath
  internalVerdict: "FAIL" | "UNCERTAIN";
  humanVerdictLabel: "Fix needed" | "Need a clearer photo";
  headline: string; // e.g. "🔴 FIX NEEDED" or "📷 TAKE THIS PHOTO AGAIN"
  actionTitle: string; // e.g. "Cover old barcode" or "Retake product label photo"
  humanObservation: string; // e.g. "The old barcode is still visible."
  whatToDoSteps: string[];
  photoRecoveryHints?: {
    checklist: string[];
    exampleText?: string;
  };
  evidenceSlot: SlotId;
  evidenceSlotDisplay: "FRONT" | "BACK" | "LABEL";
  evidenceDescription: string;
  ctaText: string;
  whyExplanation: string;
  // Underneath technical inspection data (strictly separated, never lost)
  technical: {
    checkId: string;
    checkType: PrepCheckType;
    checkName: string;
    verdict: string;
    applicability: string;
    reasonCode: string;
    aiObservation: string;
    expectedRequirement: string;
    policyRule: string;
    publisher: string;
    retrievalDate: string;
  };
  underlyingChecks: Array<{
    checkId: string;
    checkType: PrepCheckType;
    checkName: string;
    verdict: string;
    applicability: string;
    reasonCode: string;
    aiObservation: string;
    expectedRequirement: string;
    policyRule: string;
    publisher: string;
    retrievalDate: string;
  }>;
}

/**
 * Translates raw technical error codes into human-friendly operator guidance.
 */
export function translateErrorToHuman(rawError: string): string {
  if (!rawError) return "An unexpected issue occurred. Please try again.";

  const upper = rawError.toUpperCase();

  if (
    upper.includes("IMAGE_QUALITY_DEGRADED") ||
    upper.includes("BLURRY") ||
    upper.includes("BLUR")
  ) {
    return "This photo is too blurry. Take it again.";
  }

  if (upper.includes("IMAGE_TOO_DARK") || upper.includes("DARK")) {
    return "This photo is too dark. Retake with better lighting.";
  }

  if (
    upper.includes("IMAGE_TOO_SMALL") ||
    upper.includes("LOW_RESOLUTION") ||
    upper.includes("DIMENSIONS_TOO_SMALL")
  ) {
    return "This photo resolution is too low. Take a closer photo.";
  }

  if (
    upper.includes("FNSKU_IDENTITY") &&
    (upper.includes("UNCERTAIN") || upper.includes("INSUFFICIENT"))
  ) {
    return "We can't read the product label. Take a closer photo.";
  }

  if (
    upper.includes("POLYBAG_SEAL") &&
    (upper.includes("FAIL") || upper.includes("UNSEALED"))
  ) {
    return "The bag is open. Seal it completely.";
  }

  if (upper.includes("MANUFACTURER_BARCODE")) {
    if (upper.includes("FAIL")) {
      return "The original manufacturer barcode is still visible. Cover it completely.";
    }
    return "We can't verify whether the manufacturer product barcode is fully covered.";
  }

  if (upper.includes("EXPIRY") && upper.includes("UNCERTAIN")) {
    return "We can't clearly read the expiry date. Take a closer photo.";
  }

  return rawError;
}

/**
 * Resolves the relevant visual evidence slot for a check or group of checks.
 *
 * Priority order:
 * 1. Supporting image ID recorded directly in the check's evidence array.
 * 2. Feature-specific evidence image ID recorded in the visual observation.
 * 3. Suggested slot from the evidence recovery plan action.
 * 4. Standard capture protocol requirement (front/body, back/dates, label/identifier).
 *
 * NEVER hard-codes label or back blindly when real evidence exists.
 */
export function deriveEvidenceSlot(params: {
  checks: EnrichedComplianceCheck[];
  observation?: PrepUnitObservation;
  recoveryPlan?: EvidenceRecoveryPlan | null;
}): SlotId {
  const { checks, observation, recoveryPlan } = params;

  // 1. Direct evidence from any of the checks
  for (const check of checks) {
    for (const ev of check.evidence || []) {
      if (ev?.imageId) {
        const s = ev.imageId.toLowerCase();
        if (s === "front" || s === "back" || s === "label") {
          return s as SlotId;
        }
      }
    }
  }

  // 2. Feature-specific observation evidence
  if (observation) {
    const checkTypes = checks.map((c) => c.checkType);

    if (
      checkTypes.includes("FNSKU_IDENTITY") ||
      checkTypes.includes("FNSKU_PLACEMENT")
    ) {
      for (const ev of observation.fnsku?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
    }

    if (checkTypes.includes("MANUFACTURER_BARCODE_COVERAGE")) {
      for (const ev of observation.manufacturerBarcodeCoverage?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
      for (const ev of observation.manufacturerBarcode?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
    }

    if (
      checkTypes.includes("EXPIRY_VISIBILITY") ||
      checkTypes.includes("EXPIRY_LEGIBILITY")
    ) {
      for (const ev of observation.expiryDate?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
    }

    if (
      checkTypes.includes("POLYBAG_PRESENCE") ||
      checkTypes.includes("POLYBAG_SEAL")
    ) {
      for (const ev of observation.polybag?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
    }

    if (
      checkTypes.includes("SUFFOCATION_WARNING_PRESENCE") ||
      checkTypes.includes("SUFFOCATION_WARNING_LEGIBILITY")
    ) {
      for (const ev of observation.suffocationWarning?.evidence || []) {
        if (ev?.imageId) {
          const s = ev.imageId.toLowerCase();
          if (s === "front" || s === "back" || s === "label") return s as SlotId;
        }
      }
    }

    if (checkTypes.includes("HANDLING_MARKS")) {
      for (const mark of observation.handlingMarks || []) {
        for (const ev of mark.evidence || []) {
          if (ev?.imageId) {
            const s = ev.imageId.toLowerCase();
            if (s === "front" || s === "back" || s === "label") return s as SlotId;
          }
        }
      }
    }
  }

  // 3. Recovery plan suggested slot
  if (recoveryPlan) {
    const checkTypes = checks.map((c) => c.checkType);
    const planAction = recoveryPlan.actions.find(
      (a) =>
        checkTypes.includes(a.checkType) ||
        a.resolvesCheckTypes?.some((t) => checkTypes.includes(t))
    );
    if (planAction?.suggestedSlot) {
      const s = planAction.suggestedSlot.toLowerCase();
      if (s === "front" || s === "back" || s === "label") {
        return s as SlotId;
      }
    }
  }

  // 4. Capture protocol requirement based on inspection specification
  const firstType = checks[0]?.checkType;
  if (firstType === "FNSKU_IDENTITY" || firstType === "FNSKU_PLACEMENT") {
    return "label";
  }
  if (
    firstType === "POLYBAG_PRESENCE" ||
    firstType === "POLYBAG_SEAL" ||
    firstType === "SUFFOCATION_WARNING_PRESENCE" ||
    firstType === "SUFFOCATION_WARNING_LEGIBILITY" ||
    firstType === "HANDLING_MARKS"
  ) {
    return "front";
  }
  return "back";
}

/**
 * Deterministically maps an internal check result to a human-first actionable task.
 * Returns null if the check is PASS or NOT_APPLICABLE.
 *
 * Supports optional groupedChecks when multiple UNCERTAIN checks resolve via a single
 * photographic recovery action.
 */
export function buildOperatorActionableTask(params: {
  enrichedCheck: EnrichedComplianceCheck;
  workOrder: WorkOrderSpecification;
  observation: PrepUnitObservation;
  recoveryPlan?: EvidenceRecoveryPlan | null;
  groupedChecks?: EnrichedComplianceCheck[];
}): OperatorActionableTask | null {
  const { enrichedCheck, workOrder, recoveryPlan, groupedChecks } = params;

  // 1. NOT_APPLICABLE and PASS are hidden from primary operator action UI
  if (
    enrichedCheck.applicability === "NOT_APPLICABLE" ||
    enrichedCheck.verdict === "PASS" ||
    enrichedCheck.verdict === null
  ) {
    return null;
  }

  const allChecks =
    groupedChecks && groupedChecks.length > 0 ? groupedChecks : [enrichedCheck];
  const resolvesCheckTypes = allChecks.map((c) => c.checkType);
  const checkType = enrichedCheck.checkType;
  const verdict = enrichedCheck.verdict; // strictly "FAIL" | "UNCERTAIN"

  const humanVerdictLabel =
    verdict === "FAIL" ? VERDICT_HUMAN_MAPPING.FAIL : VERDICT_HUMAN_MAPPING.UNCERTAIN;

  const headline =
    verdict === "FAIL" ? "🔴 FIX NEEDED" : "📷 TAKE THIS PHOTO AGAIN";

  let actionTitle = CHECK_HUMAN_TITLES[checkType] ?? "Check packaging";
  if (verdict === "UNCERTAIN") {
    if (
      resolvesCheckTypes.includes("FNSKU_IDENTITY") &&
      resolvesCheckTypes.includes("FNSKU_PLACEMENT")
    ) {
      actionTitle = "Retake product label photo";
    } else if (
      resolvesCheckTypes.includes("EXPIRY_VISIBILITY") &&
      resolvesCheckTypes.includes("EXPIRY_LEGIBILITY")
    ) {
      actionTitle = "Retake expiry photo";
    } else if (
      resolvesCheckTypes.includes("SUFFOCATION_WARNING_PRESENCE") &&
      resolvesCheckTypes.includes("SUFFOCATION_WARNING_LEGIBILITY")
    ) {
      actionTitle = "Retake warning photo";
    } else if (
      resolvesCheckTypes.includes("POLYBAG_PRESENCE") &&
      resolvesCheckTypes.includes("POLYBAG_SEAL")
    ) {
      actionTitle = "Retake packaging photo";
    } else if (checkType === "MANUFACTURER_BARCODE_COVERAGE") {
      actionTitle = "Take a clearer photo of the barcode area";
    } else if (
      checkType === "EXPIRY_VISIBILITY" ||
      checkType === "EXPIRY_LEGIBILITY"
    ) {
      actionTitle = "Retake expiry photo";
    } else if (
      checkType === "FNSKU_IDENTITY" ||
      checkType === "FNSKU_PLACEMENT"
    ) {
      actionTitle = "Retake product label photo";
    } else if (
      checkType === "POLYBAG_PRESENCE" ||
      checkType === "POLYBAG_SEAL"
    ) {
      actionTitle = "Retake packaging photo";
    } else if (
      checkType === "SUFFOCATION_WARNING_PRESENCE" ||
      checkType === "SUFFOCATION_WARNING_LEGIBILITY"
    ) {
      actionTitle = "Retake warning photo";
    } else if (checkType === "HANDLING_MARKS") {
      actionTitle = "Retake package photo";
    }
  }

  // Determine relevant visual evidence slot derived from actual evidence
  const evidenceSlot = deriveEvidenceSlot({
    checks: allChecks,
    observation: params.observation,
    recoveryPlan,
  });

  const evidenceSlotDisplay = evidenceSlot.toUpperCase() as "FRONT" | "BACK" | "LABEL";
  const evidenceDescription =
    allChecks.find((c) => c.evidence[0]?.description)?.evidence[0]?.description ||
    `Visual observation captured for ${evidenceSlotDisplay} view`;

  let humanObservation = "";
  let whatToDoSteps: string[] = [];
  let photoRecoveryHints: OperatorActionableTask["photoRecoveryHints"] = undefined;
  let ctaText = verdict === "FAIL" ? "TAKE NEW PHOTO" : "RETAKE PHOTO";
  let whyExplanation = "";

  // Handle multi-check UNCERTAIN grouped combinations first
  if (
    verdict === "UNCERTAIN" &&
    resolvesCheckTypes.includes("FNSKU_IDENTITY") &&
    resolvesCheckTypes.includes("FNSKU_PLACEMENT")
  ) {
    humanObservation = "We can't verify the expected Amazon/FNSKU label from this photo.";
    whatToDoSteps = [
      "1. Locate the Amazon/FNSKU product label on the unit.",
      "2. Capture the complete label, including its barcode and printed identifier.",
      "3. Make sure the label is sharp, fully visible, and unobstructed.",
    ];
    photoRecoveryHints = {
      checklist: [
        "Locate Amazon/FNSKU label",
        "Ensure complete barcode is visible",
        "Make sure text is sharp and readable",
      ],
      exampleText: `Expected from work order: ${workOrder.expectedFnsku}`,
    };
    ctaText =
      evidenceSlot === "label"
        ? "RETAKE LABEL PHOTO"
        : `RETAKE ${evidenceSlotDisplay} PHOTO`;
    whyExplanation =
      "Amazon requires a clear, flat FNSKU label barcode and legible human-readable text on an outer surface so items can be received and scanned without delay.";
  } else if (
    verdict === "UNCERTAIN" &&
    resolvesCheckTypes.includes("EXPIRY_VISIBILITY") &&
    resolvesCheckTypes.includes("EXPIRY_LEGIBILITY")
  ) {
    humanObservation = "We can't clearly read the expiry date.";
    whatToDoSteps = [
      "1. Take a clear, focused photo showing the complete expiration date.",
      "2. Ensure no glare or blur obscures the expiration numbers.",
    ];
    photoRecoveryHints = {
      checklist: [
        "Keep the expiry date visible",
        "Move closer",
        "Keep the camera steady",
        "Avoid glare",
      ],
      exampleText: "EXP: 10/2027",
    };
    ctaText =
      evidenceSlot === "back"
        ? "RETAKE BACK PHOTO"
        : `RETAKE ${evidenceSlotDisplay} PHOTO`;
    whyExplanation =
      "Expiration dates must be readable in MM/DD/YYYY or open format so warehouse systems can track expiration windows.";
  } else if (
    verdict === "UNCERTAIN" &&
    resolvesCheckTypes.includes("SUFFOCATION_WARNING_PRESENCE") &&
    resolvesCheckTypes.includes("SUFFOCATION_WARNING_LEGIBILITY")
  ) {
    humanObservation = "We can't clearly see or read the suffocation warning on the bag.";
    whatToDoSteps = [
      "1. Flatten the bag surface to make the warning visible.",
      "2. Take a sharp, well-lit close-up photo showing all warning text clearly.",
    ];
    photoRecoveryHints = {
      checklist: ["visible", "sharp", "not covered"],
      exampleText: "WARNING: To avoid danger of suffocation...",
    };
    ctaText =
      evidenceSlot === "front"
        ? "RETAKE FRONT PHOTO"
        : `RETAKE ${evidenceSlotDisplay} PHOTO`;
    whyExplanation =
      "Polybags with an opening of 5 inches or larger must display a clear, legible suffocation warning to prevent infant and child accidents.";
  } else if (
    verdict === "UNCERTAIN" &&
    resolvesCheckTypes.includes("POLYBAG_PRESENCE") &&
    resolvesCheckTypes.includes("POLYBAG_SEAL")
  ) {
    humanObservation = "We can't clearly see if the item is polybagged and sealed.";
    whatToDoSteps = [
      "1. Capture a clear view of the package and bag opening.",
      "2. Ensure the plastic polybag and closure seal are clearly visible.",
    ];
    ctaText =
      evidenceSlot === "front"
        ? "RETAKE FRONT PHOTO"
        : `RETAKE ${evidenceSlotDisplay} PHOTO`;
    whyExplanation =
      "Amazon requires polybagging and secure seals to protect products from dirt and moisture during fulfillment.";
  } else {
    // Individual checks switch
    switch (checkType) {
      case "MANUFACTURER_BARCODE_COVERAGE": {
        if (verdict === "FAIL") {
          humanObservation = "The original manufacturer barcode is still visible.";
          whatToDoSteps = [
            "1. Cover the manufacturer barcode completely with an opaque label.",
            "2. Make sure the original barcode cannot be scanned.",
            "3. Take a new photo showing the corrected area.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation =
            "We can't verify whether the manufacturer product barcode is fully covered.";
          whatToDoSteps = [
            "1. Locate the original manufacturer product barcode (UPC/EAN/etc.) if present.",
            "2. Capture the complete barcode area.",
            "3. Make sure the area is sharp, visible and unobstructed.",
          ];
          photoRecoveryHints = {
            checklist: [
              "Locate manufacturer barcode",
              "Keep barcode area visible",
              "Avoid glare and obstruction",
            ],
          };
          ctaText = "RETAKE BACK PHOTO";
        }
        whyExplanation =
          "Amazon fulfillment centers scan items automatically. If the original manufacturer barcode (UPC/EAN) is exposed, scanners may read the wrong code, leading to inventory misplacement or delivery errors.";
        break;
      }

      case "FNSKU_IDENTITY": {
        if (verdict === "FAIL") {
          humanObservation = `Product label does not match expected FNSKU (${workOrder.expectedFnsku}).`;
          whatToDoSteps = [
            "1. Check the work order for the correct FNSKU.",
            `2. Apply the correct label: ${workOrder.expectedFnsku}.`,
            "3. Take a new photo of the label.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't verify the expected Amazon/FNSKU label from this photo.";
          whatToDoSteps = [
            "1. Locate the Amazon/FNSKU product label on the unit.",
            "2. Capture the complete label, including its barcode and printed identifier.",
            "3. Make sure the label is sharp, fully visible, and unobstructed.",
          ];
          photoRecoveryHints = {
            checklist: [
              "Locate Amazon/FNSKU label",
              "Ensure complete barcode is visible",
              "Make sure text is sharp and readable",
            ],
            exampleText: `Expected from work order: ${workOrder.expectedFnsku}`,
          };
          ctaText = "RETAKE LABEL PHOTO";
        }
        whyExplanation =
          "Every unit in Amazon fulfillment must carry the unique FNSKU barcode assigned to your listing so it can be received and tracked in the warehouse.";
        break;
      }

      case "FNSKU_PLACEMENT": {
        if (verdict === "FAIL") {
          humanObservation = "The product label is folded over an edge, curve, or seam.";
          whatToDoSteps = [
            "1. Peel or cover the misplaced label.",
            "2. Stick the Amazon/FNSKU label completely flat on the smoothest surface.",
            "3. Take a new photo.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly see where the label is placed on the package.";
          whatToDoSteps = [
            "1. Take a straight-on photo showing the label and surrounding package.",
            "2. Ensure the photo is well-lit and not blurry.",
          ];
          ctaText = "RETAKE LABEL PHOTO";
        }
        whyExplanation =
          "Labels placed over seams or curved corners can wrinkle or fail to scan, causing shipment delays.";
        break;
      }

      case "POLYBAG_PRESENCE": {
        if (verdict === "FAIL") {
          humanObservation = "The item is not in an approved polybag.";
          whatToDoSteps = [
            "1. Place the item inside a clear polybag.",
            "2. Seal the bag securely.",
            "3. Take a new photo.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly see if the item is in a polybag.";
          whatToDoSteps = [
            "1. Capture a clear view of the packaging.",
            "2. Ensure lighting shows the plastic polybag if present.",
          ];
          ctaText = "RETAKE FRONT PHOTO";
        }
        whyExplanation =
          "This product category requires polybagging to protect products from dirt, moisture, and warehouse handling.";
        break;
      }

      case "POLYBAG_SEAL": {
        if (verdict === "FAIL") {
          humanObservation = "The bag is open. Seal it completely.";
          whatToDoSteps = [
            "1. Seal the polybag opening with adhesive tape or heat seal.",
            "2. Make sure the item cannot slip out of the bag.",
            "3. Take a new photo.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly see if the bag is sealed.";
          whatToDoSteps = [
            "1. Capture a clear close-up of the bag closure.",
            "2. Ensure the tape or seal is visible.",
          ];
          ctaText = "RETAKE PHOTO";
        }
        whyExplanation =
          "Amazon requires polybags to be completely sealed so items cannot fall out or become exposed during handling.";
        break;
      }

      case "SUFFOCATION_WARNING_PRESENCE": {
        if (verdict === "FAIL") {
          humanObservation = "The safety suffocation warning is missing from the bag.";
          whatToDoSteps = [
            "1. Affix an approved suffocation warning label to the polybag.",
            "2. Make sure it is placed prominently on the front of the bag.",
            "3. Take a new photo.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly see the suffocation warning on the bag.";
          whatToDoSteps = [
            "1. Flatten the bag surface to make the warning visible.",
            "2. Take a clear photo of the warning area.",
          ];
          ctaText = "RETAKE FRONT PHOTO";
        }
        whyExplanation =
          "Polybags with an opening of 5 inches or larger must display a suffocation warning to prevent infant and child accidents.";
        break;
      }

      case "SUFFOCATION_WARNING_LEGIBILITY": {
        humanObservation = "The safety warning text cannot be read clearly.";
        whatToDoSteps = [
          "1. Smooth out wrinkles over the warning text.",
          "2. Take a sharp, well-lit close-up photo showing all warning text clearly.",
        ];
        photoRecoveryHints = {
          checklist: ["visible", "sharp", "not covered"],
          exampleText: "WARNING: To avoid danger of suffocation...",
        };
        ctaText = "RETAKE PHOTO";
        whyExplanation =
          "Safety warnings must be clearly legible to warehouse workers and end customers.";
        break;
      }

      case "EXPIRY_VISIBILITY": {
        if (verdict === "FAIL") {
          humanObservation = "No expiration date was found on the package.";
          whatToDoSteps = [
            "1. Locate the printed expiration date on the product.",
            "2. If missing, apply a compliant expiration date label.",
            "3. Take a new photo showing the date clearly.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly read the expiry date.";
          whatToDoSteps = [
            "1. Take a clear, focused photo showing the complete expiration date.",
            "2. Ensure no glare or blur obscures the expiration numbers.",
          ];
          photoRecoveryHints = {
            checklist: [
              "Keep the expiry date visible",
              "Move closer",
              "Keep the camera steady",
              "Avoid glare",
            ],
            exampleText: "EXP: 10/2027",
          };
          ctaText = "RETAKE BACK PHOTO";
        }
        whyExplanation =
          "Amazon requires all date-sensitive products to display an expiration date in a clear, visible location.";
        break;
      }

      case "EXPIRY_LEGIBILITY": {
        humanObservation = "We can't clearly read the expiry date.";
        whatToDoSteps = [
          "1. Take a clear, focused photo showing the complete expiration date.",
          "2. Ensure no glare or blur obscures the expiration numbers.",
        ];
        photoRecoveryHints = {
          checklist: [
            "Keep the expiry date visible",
            "Move closer",
            "Keep the camera steady",
            "Avoid glare",
          ],
          exampleText: "EXP: 10/2027",
        };
        ctaText = "RETAKE BACK PHOTO";
        whyExplanation =
          "Expiration dates must be readable in MM/DD/YYYY or open format so warehouse systems can track expiration windows.";
        break;
      }

      case "HANDLING_MARKS": {
        if (verdict === "FAIL") {
          humanObservation = "Required handling marks (e.g. Fragile / This Way Up) are missing.";
          whatToDoSteps = [
            "1. Apply the required handling mark labels to the package.",
            "2. Ensure labels are straight and unobstructed.",
            "3. Take a new photo.",
          ];
          ctaText = "TAKE NEW PHOTO";
        } else {
          humanObservation = "We can't clearly see if required handling marks are present.";
          whatToDoSteps = [
            "1. Rotate the package to capture all sides clearly.",
            "2. Ensure handling labels are well-lit and in focus.",
          ];
          ctaText = "RETAKE PHOTO";
        }
        whyExplanation =
          "Fragile or orientation-sensitive products require clear handling labels to prevent damage during fulfillment.";
        break;
      }

      default: {
        humanObservation = enrichedCheck.shortReason || "Packaging issue requires physical check.";
        whatToDoSteps = [
          "1. Check the packaging requirements.",
          "2. Remediate the unit.",
          "3. Take a new photo.",
        ];
        ctaText = verdict === "FAIL" ? "TAKE NEW PHOTO" : "RETAKE PHOTO";
        whyExplanation = "Packaging must adhere to Amazon inbound prep requirements.";
        break;
      }
    }
  }

  const primaryTechnical = {
    checkId: enrichedCheck.checkId,
    checkType: enrichedCheck.checkType,
    checkName: enrichedCheck.checkName,
    verdict: enrichedCheck.verdict ?? "UNKNOWN",
    applicability: enrichedCheck.applicability,
    reasonCode: enrichedCheck.reasonCode,
    aiObservation: enrichedCheck.observationDetails || enrichedCheck.observedFact,
    expectedRequirement: enrichedCheck.expectedRequirement,
    policyRule: enrichedCheck.policyTitle,
    publisher: enrichedCheck.policySource.publisher,
    retrievalDate: enrichedCheck.policySource.retrievalDate,
  };

  const underlyingChecks = allChecks.map((c) => ({
    checkId: c.checkId,
    checkType: c.checkType,
    checkName: c.checkName,
    verdict: c.verdict ?? "UNKNOWN",
    applicability: c.applicability,
    reasonCode: c.reasonCode,
    aiObservation: c.observationDetails || c.observedFact,
    expectedRequirement: c.expectedRequirement,
    policyRule: c.policyTitle,
    publisher: c.policySource.publisher,
    retrievalDate: c.policySource.retrievalDate,
  }));

  const taskId =
    allChecks.length > 1
      ? `grp-${allChecks.map((c) => c.checkType).join("-")}`
      : enrichedCheck.checkId;

  return {
    id: taskId,
    checkType,
    resolvesCheckTypes,
    internalVerdict: verdict,
    humanVerdictLabel,
    headline,
    actionTitle,
    humanObservation,
    whatToDoSteps,
    photoRecoveryHints,
    evidenceSlot,
    evidenceSlotDisplay,
    evidenceDescription,
    ctaText,
    whyExplanation,
    technical: primaryTechnical,
    underlyingChecks,
  };
}

/**
 * Deterministically orders actionable tasks so the operator never has to decide
 * which check to address first.
 *
 * Sorting rules:
 * 1. Physical defects (verdict === "FAIL") ALWAYS precede evidence recovery ("UNCERTAIN").
 * 2. Within each verdict group, sorted by fixed hierarchy (DETERMINISTIC_CHECK_TYPE_ORDER).
 */
export function sortOperatorActionableTasks(
  tasks: OperatorActionableTask[]
): OperatorActionableTask[] {
  return [...tasks].sort((a, b) => {
    // 1. FAIL before UNCERTAIN
    if (a.internalVerdict !== b.internalVerdict) {
      return a.internalVerdict === "FAIL" ? -1 : 1;
    }

    // 2. Fixed deterministic order by check type
    const indexA = DETERMINISTIC_CHECK_TYPE_ORDER.indexOf(a.checkType);
    const indexB = DETERMINISTIC_CHECK_TYPE_ORDER.indexOf(b.checkType);
    const rankA = indexA === -1 ? 999 : indexA;
    const rankB = indexB === -1 ? 999 : indexB;

    return rankA - rankB;
  });
}

/**
 * Convenience helper to collect and deterministically order all actionable problems
 * for the human operator from an inspection result.
 *
 * Rules:
 * 1. PASS and NOT_APPLICABLE checks are strictly excluded.
 * 2. FAIL checks represent physical corrective actions and are NEVER grouped with UNCERTAIN actions.
 * 3. Multiple UNCERTAIN checks that resolve via the same photographic recovery action
 *    (e.g. FNSKU_IDENTITY + FNSKU_PLACEMENT, EXPIRY_VISIBILITY + EXPIRY_LEGIBILITY,
 *     SUFFOCATION_WARNING_PRESENCE + SUFFOCATION_WARNING_LEGIBILITY, POLYBAG_PRESENCE + POLYBAG_SEAL)
 *    are grouped into a single operator task with all underlying checks preserved.
 * 4. Deterministically sorted: FAIL physical fixes first, then UNCERTAIN recovery tasks.
 */
export function getOrderedOperatorProblems(params: {
  enrichedChecks: EnrichedComplianceCheck[];
  workOrder: WorkOrderSpecification;
  observation: PrepUnitObservation;
  recoveryPlan?: EvidenceRecoveryPlan | null;
}): OperatorActionableTask[] {
  const tasks: OperatorActionableTask[] = [];

  // Exclude non-actionable checks (PASS, NOT_APPLICABLE, null)
  const failChecks = params.enrichedChecks.filter(
    (c) => c.applicability === "APPLICABLE" && c.verdict === "FAIL"
  );
  const uncertainChecks = params.enrichedChecks.filter(
    (c) => c.applicability === "APPLICABLE" && c.verdict === "UNCERTAIN"
  );

  // 1. FAIL physical defects: Never group with UNCERTAIN actions
  for (const failCheck of failChecks) {
    const task = buildOperatorActionableTask({
      enrichedCheck: failCheck,
      workOrder: params.workOrder,
      observation: params.observation,
      recoveryPlan: params.recoveryPlan,
      groupedChecks: [failCheck],
    });
    if (task) {
      tasks.push(task);
    }
  }

  // 2. UNCERTAIN checks: Group multiple checks requiring the same photo recovery action
  const handledUncertain = new Set<PrepCheckType>();

  const addGroupedUncertain = (matching: EnrichedComplianceCheck[]) => {
    if (matching.length === 0) return;
    const primary = matching[0];
    const task = buildOperatorActionableTask({
      enrichedCheck: primary,
      workOrder: params.workOrder,
      observation: params.observation,
      recoveryPlan: params.recoveryPlan,
      groupedChecks: matching,
    });
    if (task) {
      tasks.push(task);
    }
    for (const m of matching) {
      handledUncertain.add(m.checkType);
    }
  };

  // Group 1: FNSKU Identity + Placement (both uncertain)
  const fnskuGroup = uncertainChecks.filter(
    (c) => c.checkType === "FNSKU_IDENTITY" || c.checkType === "FNSKU_PLACEMENT"
  );
  if (fnskuGroup.length > 1) {
    addGroupedUncertain(fnskuGroup);
  }

  // Group 2: Expiry Visibility + Legibility (both uncertain)
  const expiryGroup = uncertainChecks.filter(
    (c) =>
      !handledUncertain.has(c.checkType) &&
      (c.checkType === "EXPIRY_VISIBILITY" || c.checkType === "EXPIRY_LEGIBILITY")
  );
  if (expiryGroup.length > 1) {
    addGroupedUncertain(expiryGroup);
  }

  // Group 3: Suffocation Warning Presence + Legibility (both uncertain)
  const suffocationGroup = uncertainChecks.filter(
    (c) =>
      !handledUncertain.has(c.checkType) &&
      (c.checkType === "SUFFOCATION_WARNING_PRESENCE" ||
        c.checkType === "SUFFOCATION_WARNING_LEGIBILITY")
  );
  if (suffocationGroup.length > 1) {
    addGroupedUncertain(suffocationGroup);
  }

  // Group 4: Polybag Presence + Seal (both uncertain)
  const polybagGroup = uncertainChecks.filter(
    (c) =>
      !handledUncertain.has(c.checkType) &&
      (c.checkType === "POLYBAG_PRESENCE" || c.checkType === "POLYBAG_SEAL")
  );
  if (polybagGroup.length > 1) {
    addGroupedUncertain(polybagGroup);
  }

  // Group 5: External recovery plan action grouping
  if (params.recoveryPlan) {
    for (const action of params.recoveryPlan.actions) {
      if (action.resolvesCheckTypes && action.resolvesCheckTypes.length > 1) {
        const matching = uncertainChecks.filter(
          (c) =>
            !handledUncertain.has(c.checkType) &&
            action.resolvesCheckTypes.includes(c.checkType)
        );
        if (matching.length > 1) {
          addGroupedUncertain(matching);
        }
      }
    }
  }

  // Group 6: Remaining individual UNCERTAIN checks
  for (const check of uncertainChecks) {
    if (handledUncertain.has(check.checkType)) {
      continue;
    }
    const task = buildOperatorActionableTask({
      enrichedCheck: check,
      workOrder: params.workOrder,
      observation: params.observation,
      recoveryPlan: params.recoveryPlan,
      groupedChecks: [check],
    });
    if (task) {
      tasks.push(task);
    }
    handledUncertain.add(check.checkType);
  }

  return sortOperatorActionableTasks(tasks);
}
