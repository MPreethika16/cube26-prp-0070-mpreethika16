import type { PrepInspectionRecord } from "../inspection/prep-inspection.schema";
import type { PrepUnitObservation } from "../vision/prep-observation.schema";
import type { OperationalInspectionSummary } from "../inspection/operational-status";
import type { PrepCheckType } from "../compliance/check-types";
import {
  evidenceRecoveryPlanSchema,
  type EvidenceRecoveryAction,
  type EvidenceRecoveryPlan,
} from "./recovery-action.schema";

export interface PlanEvidenceRecoveryParams {
  inspectionRecord: Pick<PrepInspectionRecord, "unitId" | "checks">;
  observation?: PrepUnitObservation;
  operationalStatus: OperationalInspectionSummary;
}

/**
 * Deterministic recovery action planner for UNCERTAIN compliance checks.
 *
 * Rules:
 * 1. ONLY generates recovery actions for checks where verdict === "UNCERTAIN".
 * 2. Checks with verdict === "FAIL" use remediation instructions, NEVER recovery.
 * 3. Checks with verdict === "PASS" or applicability === "NOT_APPLICABLE" require no recovery.
 * 4. Merges/deduplicates co-occurring uncertainties (e.g. FNSKU identity + placement,
 *    expiry visibility + legibility, suffocation presence + legibility).
 * 5. Prioritizes actions that can resolve multiple uncertain checks ("HIGH" priority).
 * 6. Pure deterministic function: strictly zero LLM calls and zero verdict mutations.
 */
function deriveSuggestedSlot(
  primaryEvidence: Array<{ imageId?: string }> | undefined,
  fallback: "front" | "back" | "label"
): "front" | "back" | "label" {
  if (primaryEvidence && primaryEvidence.length > 0) {
    const s = primaryEvidence[0]?.imageId?.toLowerCase();
    if (s === "front" || s === "back" || s === "label") {
      return s;
    }
  }
  return fallback;
}

export function planEvidenceRecovery(
  params: PlanEvidenceRecoveryParams
): EvidenceRecoveryPlan {
  const { inspectionRecord, operationalStatus, observation } = params;
  const unitId = inspectionRecord.unitId;

  // Find all checks with verdict === "UNCERTAIN"
  const uncertainChecks = inspectionRecord.checks.filter(
    (c) => c.applicability === "APPLICABLE" && c.verdict === "UNCERTAIN"
  );

  if (
    operationalStatus.status !== "REVIEW_REQUIRED" ||
    uncertainChecks.length === 0
  ) {
    return evidenceRecoveryPlanSchema.parse({
      unitId,
      requiresEvidence: false,
      uncertainCheckCount: 0,
      actions: [],
    });
  }

  const uncertainTypes = new Set<PrepCheckType>(
    uncertainChecks.map((c) => c.checkType)
  );

  const actions: EvidenceRecoveryAction[] = [];
  const handledTypes = new Set<PrepCheckType>();

  // Slot determination derived from actual evidence if available
  const fnskuSlot = deriveSuggestedSlot(observation?.fnsku?.evidence, "label");
  const suffocationSlot = deriveSuggestedSlot(observation?.suffocationWarning?.evidence, "front");
  const expirySlot = deriveSuggestedSlot(observation?.expiryDate?.evidence, "back");
  const barcodeSlot = deriveSuggestedSlot(
    observation?.manufacturerBarcodeCoverage?.evidence || observation?.manufacturerBarcode?.evidence,
    "back"
  );
  const polybagSlot = deriveSuggestedSlot(observation?.polybag?.evidence, "front");
  const handlingSlot = deriveSuggestedSlot(observation?.handlingMarks?.[0]?.evidence, "front");

  // 1. Check FNSKU Deduplication (Identity + Placement)
  const hasFnskuId = uncertainTypes.has("FNSKU_IDENTITY");
  const hasFnskuPlace = uncertainTypes.has("FNSKU_PLACEMENT");

  if (hasFnskuId && hasFnskuPlace) {
    const primaryCheck = uncertainChecks.find(
      (c) => c.checkType === "FNSKU_IDENTITY"
    )!;
    actions.push({
      checkType: "FNSKU_IDENTITY",
      resolvesCheckTypes: ["FNSKU_IDENTITY", "FNSKU_PLACEMENT"],
      reason: primaryCheck.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "full FNSKU label and surrounding package surface",
      instruction:
        "Capture the entire FNSKU label and surrounding package surface. Avoid glare and keep the barcode, text, and edges clearly readable.",
      priority: "HIGH",
      suggestedSlot: fnskuSlot,
    });
    handledTypes.add("FNSKU_IDENTITY");
    handledTypes.add("FNSKU_PLACEMENT");
  } else if (hasFnskuId) {
    const c = uncertainChecks.find((chk) => chk.checkType === "FNSKU_IDENTITY")!;
    actions.push({
      checkType: "FNSKU_IDENTITY",
      resolvesCheckTypes: ["FNSKU_IDENTITY"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "FNSKU label",
      instruction:
        "Capture a clear, glare-free close-up of the product FNSKU barcode label.",
      priority: "MEDIUM",
      suggestedSlot: fnskuSlot,
    });
    handledTypes.add("FNSKU_IDENTITY");
  } else if (hasFnskuPlace) {
    const c = uncertainChecks.find((chk) => chk.checkType === "FNSKU_PLACEMENT")!;
    actions.push({
      checkType: "FNSKU_PLACEMENT",
      resolvesCheckTypes: ["FNSKU_PLACEMENT"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "full FNSKU label and surrounding package surface",
      instruction:
        "Capture the full FNSKU label and surrounding package surface to verify placement relative to edges and seams.",
      priority: "MEDIUM",
      suggestedSlot: fnskuSlot,
    });
    handledTypes.add("FNSKU_PLACEMENT");
  }

  // 2. Check Suffocation Warning Deduplication (Presence + Legibility)
  const hasWarnPres = uncertainTypes.has("SUFFOCATION_WARNING_PRESENCE");
  const hasWarnLeg = uncertainTypes.has("SUFFOCATION_WARNING_LEGIBILITY");

  if (hasWarnPres && hasWarnLeg) {
    const primaryCheck = uncertainChecks.find(
      (c) => c.checkType === "SUFFOCATION_WARNING_PRESENCE"
    )!;
    actions.push({
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      resolvesCheckTypes: [
        "SUFFOCATION_WARNING_PRESENCE",
        "SUFFOCATION_WARNING_LEGIBILITY",
      ],
      reason: primaryCheck.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "suffocation warning text",
      instruction:
        "Capture a sharp, unobstructed close-up of the printed suffocation warning on the polybag.",
      priority: "HIGH",
      suggestedSlot: suffocationSlot,
    });
    handledTypes.add("SUFFOCATION_WARNING_PRESENCE");
    handledTypes.add("SUFFOCATION_WARNING_LEGIBILITY");
  } else if (hasWarnPres) {
    const c = uncertainChecks.find(
      (chk) => chk.checkType === "SUFFOCATION_WARNING_PRESENCE"
    )!;
    actions.push({
      checkType: "SUFFOCATION_WARNING_PRESENCE",
      resolvesCheckTypes: ["SUFFOCATION_WARNING_PRESENCE"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "suffocation warning text",
      instruction:
        "Capture a clear photograph showing the printed suffocation warning on the polybag.",
      priority: "MEDIUM",
      suggestedSlot: suffocationSlot,
    });
    handledTypes.add("SUFFOCATION_WARNING_PRESENCE");
  } else if (hasWarnLeg) {
    const c = uncertainChecks.find(
      (chk) => chk.checkType === "SUFFOCATION_WARNING_LEGIBILITY"
    )!;
    actions.push({
      checkType: "SUFFOCATION_WARNING_LEGIBILITY",
      resolvesCheckTypes: ["SUFFOCATION_WARNING_LEGIBILITY"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "suffocation warning text",
      instruction:
        "Capture a sharp, close-up photograph of the suffocation warning text to verify legibility.",
      priority: "MEDIUM",
      suggestedSlot: suffocationSlot,
    });
    handledTypes.add("SUFFOCATION_WARNING_LEGIBILITY");
  }

  // 3. Check Expiry Date Deduplication (Visibility + Legibility)
  const hasExpVis = uncertainTypes.has("EXPIRY_VISIBILITY");
  const hasExpLeg = uncertainTypes.has("EXPIRY_LEGIBILITY");

  if (hasExpVis && hasExpLeg) {
    const primaryCheck = uncertainChecks.find(
      (c) => c.checkType === "EXPIRY_VISIBILITY"
    )!;
    actions.push({
      checkType: "EXPIRY_VISIBILITY",
      resolvesCheckTypes: ["EXPIRY_VISIBILITY", "EXPIRY_LEGIBILITY"],
      reason: primaryCheck.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "expiry/date area",
      instruction:
        "Capture a sharp close-up photograph of the printed expiration date on the packaging.",
      priority: "HIGH",
      suggestedSlot: expirySlot,
    });
    handledTypes.add("EXPIRY_VISIBILITY");
    handledTypes.add("EXPIRY_LEGIBILITY");
  } else if (hasExpVis) {
    const c = uncertainChecks.find((chk) => chk.checkType === "EXPIRY_VISIBILITY")!;
    actions.push({
      checkType: "EXPIRY_VISIBILITY",
      resolvesCheckTypes: ["EXPIRY_VISIBILITY"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "expiry/date area",
      instruction:
        "Capture a clear photograph showing where the product expiration date is printed.",
      priority: "MEDIUM",
      suggestedSlot: expirySlot,
    });
    handledTypes.add("EXPIRY_VISIBILITY");
  } else if (hasExpLeg) {
    const c = uncertainChecks.find((chk) => chk.checkType === "EXPIRY_LEGIBILITY")!;
    actions.push({
      checkType: "EXPIRY_LEGIBILITY",
      resolvesCheckTypes: ["EXPIRY_LEGIBILITY"],
      reason: c.reasonCode,
      actionType: "CAPTURE_CLOSEUP",
      target: "expiry/date area",
      instruction:
        "Capture a closer, focused photograph of the expiration date text.",
      priority: "MEDIUM",
      suggestedSlot: expirySlot,
    });
    handledTypes.add("EXPIRY_LEGIBILITY");
  }

  // 4. Remaining Individual Checks
  for (const check of uncertainChecks) {
    if (handledTypes.has(check.checkType)) {
      continue;
    }

    switch (check.checkType) {
      case "MANUFACTURER_BARCODE_COVERAGE": {
        actions.push({
          checkType: "MANUFACTURER_BARCODE_COVERAGE",
          resolvesCheckTypes: ["MANUFACTURER_BARCODE_COVERAGE"],
          reason: check.reasonCode,
          actionType: "RECAPTURE_BACK",
          target: "manufacturer barcode area",
          instruction:
            "Capture a clear image of the manufacturer barcode area to verify whether the UPC/EAN is completely covered.",
          priority: "MEDIUM",
          suggestedSlot: barcodeSlot,
        });
        handledTypes.add("MANUFACTURER_BARCODE_COVERAGE");
        break;
      }

      case "POLYBAG_PRESENCE": {
        actions.push({
          checkType: "POLYBAG_PRESENCE",
          resolvesCheckTypes: ["POLYBAG_PRESENCE"],
          reason: check.reasonCode,
          actionType: "CAPTURE_FULL_PACKAGE",
          target: "outer package body",
          instruction:
            "Capture a full-body photograph of the unit showing all outer packaging surfaces.",
          priority: "MEDIUM",
          suggestedSlot: polybagSlot,
        });
        handledTypes.add("POLYBAG_PRESENCE");
        break;
      }

      case "POLYBAG_SEAL": {
        actions.push({
          checkType: "POLYBAG_SEAL",
          resolvesCheckTypes: ["POLYBAG_SEAL"],
          reason: check.reasonCode,
          actionType: "CAPTURE_CLOSEUP",
          target: "complete bag closure",
          instruction:
            "Capture a clear close-up photograph of the complete polybag closure and seal tape/weld.",
          priority: "MEDIUM",
          suggestedSlot: polybagSlot,
        });
        handledTypes.add("POLYBAG_SEAL");
        break;
      }

      case "HANDLING_MARKS": {
        actions.push({
          checkType: "HANDLING_MARKS",
          resolvesCheckTypes: ["HANDLING_MARKS"],
          reason: check.reasonCode,
          actionType: "CAPTURE_FULL_PACKAGE",
          target: "all packaging surfaces",
          instruction:
            "Capture full package photographs of all sides showing any applied handling labels (e.g. Fragile, This Way Up).",
          priority: "MEDIUM",
          suggestedSlot: handlingSlot,
        });
        handledTypes.add("HANDLING_MARKS");
        break;
      }

      default: {
        actions.push({
          checkType: check.checkType,
          resolvesCheckTypes: [check.checkType],
          reason: check.reasonCode,
          actionType: "HUMAN_REVIEW",
          target: check.checkType,
          instruction:
            "Escalate to floor supervisor for visual verification of this feature.",
          priority: "LOW",
        });
        handledTypes.add(check.checkType);
        break;
      }
    }
  }

  // 5. Deterministic Priority Sorting
  // HIGH priority first, then MEDIUM, then LOW
  const priorityWeights: Record<string, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  actions.sort((a, b) => {
    const diff = (priorityWeights[b.priority] ?? 0) - (priorityWeights[a.priority] ?? 0);
    if (diff !== 0) return diff;
    // Stable tie-breaker: number of resolved checks descending, then checkType name
    const countDiff = b.resolvesCheckTypes.length - a.resolvesCheckTypes.length;
    if (countDiff !== 0) return countDiff;
    return a.checkType.localeCompare(b.checkType);
  });

  return evidenceRecoveryPlanSchema.parse({
    unitId,
    requiresEvidence: actions.length > 0,
    uncertainCheckCount: uncertainChecks.length,
    actions,
  });
}
