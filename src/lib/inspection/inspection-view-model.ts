import type { ComplianceCheckResult } from "../compliance/compliance-result.schema";
import type { WorkOrderSpecification } from "../compliance/work-order.schema";
import type { PrepUnitObservation } from "../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../compliance/authoritative-rule.schema";
import type { PrepCheckType } from "../compliance/check-types";
import { getDeterministicOperatorAction } from "./operational-status";

export const CHECK_DISPLAY_NAMES: Record<PrepCheckType, string> = {
  FNSKU_IDENTITY: "FNSKU Barcode Identity",
  POLYBAG_PRESENCE: "Polybag Packaging Presence",
  POLYBAG_SEAL: "Polybag Seal & Closure",
  SUFFOCATION_WARNING_PRESENCE: "Suffocation Warning Presence",
  SUFFOCATION_WARNING_LEGIBILITY: "Suffocation Warning Legibility",
  MANUFACTURER_BARCODE_COVERAGE: "Manufacturer Barcode Coverage",
  EXPIRY_VISIBILITY: "Expiration Date Visibility",
  EXPIRY_LEGIBILITY: "Expiration Date Legibility",
  HANDLING_MARKS: "Handling Marks Presence",
  FNSKU_PLACEMENT: "FNSKU Label Placement",
};

export interface EnrichedComplianceCheck {
  checkId: string;
  checkType: PrepCheckType;
  checkName: string;
  applicability: string;
  verdict: "PASS" | "FAIL" | "UNCERTAIN" | null;
  reasonCode: string;
  shortReason: string;
  observedFact: string;
  expectedRequirement: string;
  observationDetails: string;
  evidence: Array<{ imageId: string; description: string }>;
  policyTitle: string;
  policySource: {
    publisher: string;
    url: string;
    retrievalDate: string;
  };
  operatorAction: string | null;
}

export function buildEnrichedCheck(
  check: ComplianceCheckResult,
  workOrder: WorkOrderSpecification,
  observation: PrepUnitObservation,
  activeRules: readonly AuthoritativePrepRule[]
): EnrichedComplianceCheck {
  const matchedRule = activeRules.find(
    (r) => r.ruleId === check.rule.ruleId || r.checkType === check.checkType
  );

  const policyTitle = matchedRule?.title ?? `Authoritative Rule (${check.rule.ruleId})`;
  const policySource = {
    publisher: matchedRule?.source?.publisher ?? "Amazon Fulfillment Services",
    url: matchedRule?.source?.url ?? "https://sellercentral.amazon.com/help/hub/reference/G200141500",
    retrievalDate: matchedRule?.source?.retrievedAt ?? "2026-09-27",
  };

  let expectedRequirement = "";
  let observedFact = "";
  let observationDetails = "";

  switch (check.checkType) {
    case "FNSKU_IDENTITY": {
      expectedRequirement = `FNSKU must match expected value: ${workOrder.expectedFnsku}`;
      observedFact = observation.fnsku.detectedValue
        ? `Detected FNSKU: ${observation.fnsku.detectedValue}`
        : `FNSKU visibility: ${observation.fnsku.visibility}`;
      observationDetails = `Visibility: ${observation.fnsku.visibility}, Legibility: ${observation.fnsku.legibility}, Value: ${observation.fnsku.detectedValue ?? "none"}`;
      break;
    }
    case "POLYBAG_PRESENCE": {
      expectedRequirement = `Polybag packaging requirement: ${workOrder.requirements.polybag}`;
      observedFact = `Polybag visibility: ${observation.polybag.visibility} (type: ${observation.polybag.packagingType ?? "not specified"})`;
      observationDetails = `Observed packaging type: ${observation.polybag.packagingType ?? "NONE_DETECTED"}, Visibility: ${observation.polybag.visibility}`;
      break;
    }
    case "POLYBAG_SEAL": {
      expectedRequirement = "Polybag opening must be completely sealed with tape or heat seal";
      observedFact = `Seal status: ${observation.polybag.sealStatus}`;
      observationDetails = `Observed seal condition: ${observation.polybag.sealStatus}`;
      break;
    }
    case "SUFFOCATION_WARNING_PRESENCE": {
      expectedRequirement = `Suffocation warning label requirement: ${workOrder.requirements.suffocationWarning}`;
      observedFact = `Warning visibility: ${observation.suffocationWarning.visibility}`;
      observationDetails = `Suffocation warning presence: ${observation.suffocationWarning.visibility}, detected text: ${observation.suffocationWarning.detectedText ?? "none"}`;
      break;
    }
    case "SUFFOCATION_WARNING_LEGIBILITY": {
      expectedRequirement = "Suffocation warning text must be fully legible if required";
      observedFact = `Warning legibility: ${observation.suffocationWarning.legibility}`;
      observationDetails = `Warning text legibility: ${observation.suffocationWarning.legibility}`;
      break;
    }
    case "MANUFACTURER_BARCODE_COVERAGE": {
      expectedRequirement = "Original manufacturer barcode (EAN/UPC) must be completely covered";
      const covStatus = observation.manufacturerBarcodeCoverage?.status;
      const covType = observation.manufacturerBarcodeCoverage?.coveringType;
      observedFact =
        covStatus === "COVERED"
          ? `Manufacturer barcode is positively covered (${covType ?? "opaque label"})`
          : observation.manufacturerBarcode.visibility === "VISIBLE"
          ? `Manufacturer barcode is exposed and visible (${observation.manufacturerBarcode.detectedValue ?? "uncovered"})`
          : `Manufacturer barcode: ${observation.manufacturerBarcode.visibility}, coverage: ${covStatus ?? "UNCERTAIN"}`;
      observationDetails = `Coverage status: ${covStatus ?? "UNCERTAIN"}${covType ? ` (${covType})` : ""}, Barcode visibility: ${observation.manufacturerBarcode.visibility}`;
      break;
    }
    case "EXPIRY_VISIBILITY": {
      expectedRequirement = `Product expiration date requirement: ${workOrder.requirements.expiryDate}`;
      observedFact = `Expiry visibility: ${observation.expiryDate.visibility} (value: ${observation.expiryDate.detectedValue ?? "none"})`;
      observationDetails = `Expiry date visibility: ${observation.expiryDate.visibility}, detected text: ${observation.expiryDate.detectedValue ?? "none"}`;
      break;
    }
    case "EXPIRY_LEGIBILITY": {
      expectedRequirement = "Expiration date must be legible in MM/DD/YYYY or open date format if required";
      observedFact = `Expiry legibility: ${observation.expiryDate.legibility}`;
      observationDetails = `Expiry date text legibility: ${observation.expiryDate.legibility}`;
      break;
    }
    case "HANDLING_MARKS": {
      const marks = workOrder.requirements.handlingMarks.requiredMarks.join(", ");
      expectedRequirement = `Handling marks requirement: ${workOrder.requirements.handlingMarks.state}${marks ? ` [${marks}]` : ""}`;
      const detectedTypes = observation.handlingMarks.map((m) => m.detectedType).filter(Boolean);
      const visibleCount = observation.handlingMarks.filter((m) => m.visibility === "VISIBLE").length;
      observedFact = detectedTypes.length > 0
        ? `Observed marks: ${detectedTypes.join(", ")} (${visibleCount} visible)`
        : "No handling marks detected in supplied views";
      observationDetails = `Detected marks: ${detectedTypes.join(", ") || "none"}, Total observed: ${observation.handlingMarks.length}`;
      break;
    }
    case "FNSKU_PLACEMENT": {
      expectedRequirement = "FNSKU label must be placed flat, away from curves, seams, or corners";
      observedFact = `Label placement: ${observation.fnsku.placement}`;
      observationDetails = `Placement location: ${observation.fnsku.placement}`;
      break;
    }
  }

  const operatorAction = getDeterministicOperatorAction(check);

  return {
    checkId: check.checkId,
    checkType: check.checkType,
    checkName: CHECK_DISPLAY_NAMES[check.checkType] ?? check.checkType,
    applicability: check.applicability,
    verdict: check.verdict,
    reasonCode: check.reasonCode,
    shortReason: check.explanation,
    observedFact,
    expectedRequirement,
    observationDetails,
    evidence: check.evidence.map((e) => ({
      imageId: e.imageId,
      description: e.description,
    })),
    policyTitle,
    policySource,
    operatorAction,
  };
}
