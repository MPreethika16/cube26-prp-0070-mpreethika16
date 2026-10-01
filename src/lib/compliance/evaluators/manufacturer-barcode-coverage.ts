import type {
  ManufacturerBarcodeObservation,
  ManufacturerBarcodeCoverageObservation,
} from "../../vision/prep-observation.schema";
import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
} from "../compliance-result.schema";
import type { ResolvedManufacturerBarcodeCoverageRequirement } from "../resolved-requirement.schema";

export interface EvaluateManufacturerBarcodeCoverageParams {
  checkId?: string;
  requirement?: ResolvedManufacturerBarcodeCoverageRequirement;
  rule?: AuthoritativePrepRule;
  ruleRequiresBarcodeCoverage?: boolean;
  manufacturerBarcodeObservation: ManufacturerBarcodeObservation;
  manufacturerBarcodeCoverageObservation?: ManufacturerBarcodeCoverageObservation | null;
}

/**
 * Evaluates MANUFACTURER_BARCODE_COVERAGE compliance against a ResolvedManufacturerBarcodeCoverageRequirement.
 *
 * Rules:
 * - NOT_APPLICABLE => null verdict, reasonCode NOT_APPLICABLE
 * - UNKNOWN or coverageRequired === null => UNCERTAIN / REQUIREMENT_UNKNOWN
 * - coverageRequired === true AND positively visible barcode OR NOT_COVERED => FAIL / REQUIREMENT_VIOLATED
 * - coverageRequired === true AND positively COVERED with visual evidence => PASS / REQUIREMENT_SATISFIED
 * - coverageRequired === true AND NOT_DETECTED without positive coverage => UNCERTAIN / FEATURE_NOT_DETECTED
 *   (CRITICAL: Never treat NOT_DETECTED as proof of coverage! nonDetectionProvesCompliance = false)
 * - COVERED without evidence => conservatively rejected as UNCERTAIN / INSUFFICIENT_VISUAL_EVIDENCE
 * - coverageRequired === false => do NOT report a fake PASS; represent as NOT_APPLICABLE with null verdict.
 * - Preserves ruleRef throughout the entire chain.
 */
export function evaluateManufacturerBarcodeCoverage(
  params: EvaluateManufacturerBarcodeCoverageParams
): ComplianceCheckResult {
  const { manufacturerBarcodeObservation, manufacturerBarcodeCoverageObservation } =
    params;

  // Adapt legacy parameters if requirement was not directly provided
  const requirement: ResolvedManufacturerBarcodeCoverageRequirement =
    params.requirement ?? {
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability:
        params.ruleRequiresBarcodeCoverage === true
          ? "APPLICABLE"
          : params.ruleRequiresBarcodeCoverage === false
          ? "NOT_APPLICABLE"
          : "UNKNOWN",
      coverageRequired: params.ruleRequiresBarcodeCoverage ?? null,
      ruleRef: params.rule
        ? { ruleId: params.rule.ruleId, version: params.rule.version }
        : { ruleId: "UNRESOLVED_RULE", version: "unknown" },
    };

  const ruleRef = requirement.ruleRef;
  const checkId =
    params.checkId ?? `${ruleRef.ruleId}:MANUFACTURER_BARCODE_COVERAGE`;

  // 1. NOT_APPLICABLE or coverage explicitly false
  if (
    requirement.applicability === "NOT_APPLICABLE" ||
    requirement.coverageRequired === false
  ) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "NOT_APPLICABLE",
      verdict: null,
      reasonCode: "NOT_APPLICABLE",
      explanation:
        "Manufacturer barcode coverage is not required for this product; check is not applicable.",
      rule: ruleRef,
      evidence: manufacturerBarcodeObservation.evidence,
      observedValue: manufacturerBarcodeObservation.visibility,
    });
  }

  // 2. UNKNOWN or coverageRequired is null (could not be resolved safely)
  if (
    requirement.applicability === "UNKNOWN" ||
    requirement.coverageRequired === null
  ) {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "UNKNOWN",
      verdict: "UNCERTAIN",
      reasonCode: "REQUIREMENT_UNKNOWN",
      explanation:
        "Manufacturer barcode coverage requirement could not be safely resolved from context.",
      rule: ruleRef,
      evidence: manufacturerBarcodeObservation.evidence,
      observedValue: manufacturerBarcodeObservation.visibility,
    });
  }

  const coverageObs = manufacturerBarcodeCoverageObservation;

  // 3. Positive visual defect: coverage required, but barcode remains visible or is NOT_COVERED
  if (
    manufacturerBarcodeObservation.visibility === "VISIBLE" ||
    coverageObs?.status === "NOT_COVERED"
  ) {
    const combinedEvidence = [
      ...manufacturerBarcodeObservation.evidence,
      ...(coverageObs?.evidence ?? []),
    ];
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "APPLICABLE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
      explanation:
        "Original manufacturer barcode is visibly uncovered on the product (positive contradictory defect evidence).",
      rule: ruleRef,
      evidence: combinedEvidence,
      observedValue:
        manufacturerBarcodeObservation.detectedValue ?? "VISIBLE_UNCOVERED",
    });
  }

  // 4. Positive visual compliance: barcode area positively verified COVERED with evidence
  if (coverageObs?.status === "COVERED") {
    if (!coverageObs.evidence || coverageObs.evidence.length === 0) {
      // Conservative safety rejection: COVERED without evidence cannot produce PASS
      return complianceCheckResultSchema.parse({
        checkId,
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: "APPLICABLE",
        verdict: "UNCERTAIN",
        reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
        explanation:
          "Manufacturer barcode coverage was reported as COVERED but lacks required visual evidence references.",
        rule: ruleRef,
        evidence: [],
        observedValue: "COVERED_NO_EVIDENCE",
      });
    }

    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "APPLICABLE",
      verdict: "PASS",
      reasonCode: "REQUIREMENT_SATISFIED",
      explanation: `Original manufacturer barcode is positively covered and inaccessible (${coverageObs.coveringType ?? "OPAQUE_LABEL"}).`,
      rule: ruleRef,
      evidence: coverageObs.evidence,
      observedValue: coverageObs.coveringType ?? "COVERED",
    });
  }

  // 5. Barcode NOT_DETECTED without positive coverage evidence:
  // CRITICAL: Never treat NOT_DETECTED as proof of coverage!
  if (manufacturerBarcodeObservation.visibility === "NOT_DETECTED") {
    return complianceCheckResultSchema.parse({
      checkId,
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      applicability: "APPLICABLE",
      verdict: "UNCERTAIN",
      reasonCode: "FEATURE_NOT_DETECTED",
      explanation:
        "Manufacturer barcode was not detected in supplied photographs. Non-detection does not confirm proper coverage or physical compliance.",
      rule: ruleRef,
      evidence: manufacturerBarcodeObservation.evidence,
      observedValue: "NOT_DETECTED",
    });
  }

  // 6. Visibility or coverage is UNCERTAIN
  return complianceCheckResultSchema.parse({
    checkId,
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    applicability: "APPLICABLE",
    verdict: "UNCERTAIN",
    reasonCode: "INSUFFICIENT_VISUAL_EVIDENCE",
    explanation:
      "Manufacturer barcode visibility and coverage are uncertain in supplied photographs.",
    rule: ruleRef,
    evidence: [
      ...manufacturerBarcodeObservation.evidence,
      ...(coverageObs?.evidence ?? []),
    ],
    observedValue: "UNCERTAIN",
  });
}
