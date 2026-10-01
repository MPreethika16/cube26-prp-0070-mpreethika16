import { z } from "zod";
import type { ComplianceCheckResult } from "../compliance/compliance-result.schema";
import type { PrepInspectionRecord } from "./prep-inspection.schema";
import {
  prepCheckTypeSchema,
  type PrepCheckType,
} from "../compliance/check-types";

/**
 * ============================================================================
 * OPERATIONAL INSPECTION STATUS CONTRACT
 * ============================================================================
 *
 * Deterministic aggregation of individual compliance check evaluations into
 * an operational warehouse workflow status:
 *
 * - STOP_AND_FIX: At least one applicable check failed. The unit has defects
 *   that must be physically remediated before release.
 * - REVIEW_REQUIRED: No failures, but at least one applicable check is uncertain
 *   or insufficient evidence was provided (or zero applicable checks exist).
 * - READY: At least one applicable check exists and all applicable checks passed.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Deterministic pure function: strictly ZERO LLM calls.
 * - NOT_APPLICABLE checks must NEVER count as PASS.
 * - Zero applicable checks must resolve to REVIEW_REQUIRED, never READY.
 * ============================================================================
 */

export const operationalInspectionStatusSchema = z.enum([
  "READY",
  "STOP_AND_FIX",
  "REVIEW_REQUIRED",
]);

export type OperationalInspectionStatus = z.infer<
  typeof operationalInspectionStatusSchema
>;

export const operationalInspectionSummarySchema = z.object({
  status: operationalInspectionStatusSchema,
  passCount: z.number().int().nonnegative(),
  failCount: z.number().int().nonnegative(),
  uncertainCount: z.number().int().nonnegative(),
  notApplicableCount: z.number().int().nonnegative(),
  blockingCheckTypes: z.array(prepCheckTypeSchema),
  uncertainCheckTypes: z.array(prepCheckTypeSchema),
});

export type OperationalInspectionSummary = z.infer<
  typeof operationalInspectionSummarySchema
>;

/**
 * Deterministically aggregates compliance check results from an inspection record
 * into an operational warehouse status.
 */
export function aggregateOperationalStatus(
  inspectionRecord: Pick<PrepInspectionRecord, "checks">
): OperationalInspectionSummary {
  const checks = inspectionRecord.checks;

  let passCount = 0;
  let failCount = 0;
  let uncertainCount = 0;
  let notApplicableCount = 0;

  const blockingCheckTypes: PrepCheckType[] = [];
  const uncertainCheckTypes: PrepCheckType[] = [];

  let applicableCount = 0;

  for (const check of checks) {
    if (check.applicability === "NOT_APPLICABLE") {
      notApplicableCount++;
      // NOT_APPLICABLE must NEVER count as PASS
      continue;
    }

    // Check is APPLICABLE or UNKNOWN
    applicableCount++;

    if (check.verdict === "FAIL") {
      failCount++;
      if (!blockingCheckTypes.includes(check.checkType)) {
        blockingCheckTypes.push(check.checkType);
      }
    } else if (check.verdict === "UNCERTAIN") {
      uncertainCount++;
      if (!uncertainCheckTypes.includes(check.checkType)) {
        uncertainCheckTypes.push(check.checkType);
      }
    } else if (check.verdict === "PASS") {
      passCount++;
    }
  }

  let status: OperationalInspectionStatus;

  // Rule 1: If ANY applicable compliance result has verdict = FAIL -> STOP_AND_FIX
  if (failCount > 0) {
    status = "STOP_AND_FIX";
  }
  // Rule 2: Else if ANY applicable result has verdict = UNCERTAIN -> REVIEW_REQUIRED
  else if (uncertainCount > 0) {
    status = "REVIEW_REQUIRED";
  }
  // Rule 3: Else if one or more applicable results exist and all are PASS -> READY
  else if (applicableCount > 0 && passCount === applicableCount) {
    status = "READY";
  }
  // Rule 4: If there are zero applicable checks -> REVIEW_REQUIRED
  else {
    status = "REVIEW_REQUIRED";
  }

  return operationalInspectionSummarySchema.parse({
    status,
    passCount,
    failCount,
    uncertainCount,
    notApplicableCount,
    blockingCheckTypes,
    uncertainCheckTypes,
  });
}

/**
 * Deterministic operator guidance mapping for FAIL and UNCERTAIN checks.
 *
 * Returns actionable instructions for warehouse floor operators to either
 * fix physical packaging defects or capture necessary visual evidence.
 *
 * Strictly NO LLM calls allowed.
 */
export function getDeterministicOperatorAction(
  check: ComplianceCheckResult
): string | null {
  if (check.applicability === "NOT_APPLICABLE" || check.verdict === "PASS") {
    return null;
  }

  const { checkType, verdict, reasonCode } = check;

  switch (checkType) {
    case "FNSKU_IDENTITY": {
      if (reasonCode === "EXPECTED_VALUE_MISMATCH") {
        return "Verify work order expected FNSKU matches item. Re-label with correct FNSKU label if incorrect.";
      }
      if (
        reasonCode === "FEATURE_NOT_DETECTED" ||
        reasonCode === "INSUFFICIENT_VISUAL_EVIDENCE"
      ) {
        return "Capture a clear image of the product barcode label.";
      }
      if (reasonCode === "TEXT_ILLEGIBLE") {
        return "Capture a clear image of the product barcode label.";
      }
      return verdict === "FAIL"
        ? "Re-label item with the correct FNSKU barcode and re-inspect."
        : "Capture a clear image of the product barcode label.";
    }

    case "MANUFACTURER_BARCODE_COVERAGE": {
      if (verdict === "FAIL" || reasonCode === "REQUIREMENT_VIOLATED") {
        return "Cover the manufacturer barcode and inspect again.";
      }
      return "Cover the manufacturer barcode and inspect again.";
    }

    case "EXPIRY_VISIBILITY": {
      if (
        reasonCode === "FEATURE_NOT_DETECTED" ||
        reasonCode === "INSUFFICIENT_VISUAL_EVIDENCE"
      ) {
        return "Capture a clear image showing the product expiration date.";
      }
      return verdict === "FAIL"
        ? "Ensure product has a valid expiration date printed and re-inspect."
        : "Capture a clear image showing the product expiration date.";
    }

    case "EXPIRY_LEGIBILITY": {
      if (reasonCode === "TEXT_ILLEGIBLE" || verdict === "UNCERTAIN") {
        return "Capture a closer image of the expiry label.";
      }
      return "Capture a closer image of the expiry label.";
    }

    case "POLYBAG_PRESENCE": {
      if (verdict === "FAIL") {
        return "Place the item into an approved polybag and inspect again.";
      }
      return "Capture a full-body view of the unit confirming polybag packaging.";
    }

    case "POLYBAG_SEAL": {
      if (verdict === "FAIL") {
        return "Seal the polybag opening completely with tape or heat seal and re-inspect.";
      }
      return "Capture the complete bag closure.";
    }

    case "SUFFOCATION_WARNING_PRESENCE": {
      if (verdict === "FAIL") {
        return "Affix an Amazon-compliant suffocation warning label to the polybag and re-inspect.";
      }
      return "Capture the surface showing the printed suffocation warning.";
    }

    case "SUFFOCATION_WARNING_LEGIBILITY": {
      return "Capture a clear, unobstructed image of the suffocation warning text.";
    }

    case "HANDLING_MARKS": {
      if (verdict === "FAIL") {
        return "Affix required handling labels (e.g. Fragile / This Way Up) and re-inspect.";
      }
      return "Capture clear views of all required handling mark labels.";
    }

    case "FNSKU_PLACEMENT": {
      if (verdict === "FAIL") {
        return "Re-position FNSKU label onto a flat, smooth surface away from seams and curves.";
      }
      return "Capture a direct, straight-on view of the FNSKU label placement.";
    }

    default: {
      return verdict === "FAIL"
        ? "Remediate packaging according to prep requirements and re-inspect."
        : "Capture additional clear photographs of the unit for supervisor review.";
    }
  }
}
