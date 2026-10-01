import type { PrepUnitObservation } from "../vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../compliance/work-order.schema";
import type { AuthoritativePrepRule } from "../compliance/authoritative-rule.schema";
import type { PrepCheckType } from "../compliance/check-types";
import {
  RuleRegistry,
  defaultRuleRegistry,
} from "../compliance/rules/registry";
import {
  resolveRequirement,
  type ExplicitPolicyResolutionContext,
} from "../compliance/requirement-resolver";
import type {
  ResolvedFnskuPlacementRequirement,
  ResolvedManufacturerBarcodeCoverageRequirement,
} from "../compliance/resolved-requirement.schema";
import {
  complianceCheckResultSchema,
  type ComplianceCheckResult,
  type ComplianceReasonCode,
} from "../compliance/compliance-result.schema";
import {
  evaluateFnskuIdentity,
  evaluatePolybagPresence,
  evaluatePolybagSeal,
  evaluateSuffocationWarningPresence,
  evaluateSuffocationWarningLegibility,
  evaluateManufacturerBarcodeCoverage,
  evaluateExpiryVisibility,
  evaluateExpiryLegibility,
  evaluateHandlingMarks,
  evaluateFnskuPlacement,
} from "../compliance/evaluators";
import {
  prepInspectionRecordSchema,
  type PrepInspectionRecord,
} from "./prep-inspection.schema";

/**
 * Controlled error thrown when the visual observation unitId does not match
 * the work order unitId.
 */
export class UnitIdentityMismatchError extends Error {
  constructor(observationUnitId: string, workOrderUnitId: string) {
    super(
      `Unit identity mismatch: visual observation unitId ("${observationUnitId}") does not match workOrder unitId ("${workOrderUnitId}").`
    );
    this.name = "UnitIdentityMismatchError";
  }
}

/**
 * All 10 distinct prep compliance check types evaluated in an inspection.
 */
export const SUPPORTED_INSPECTION_CHECKS: readonly PrepCheckType[] = [
  "FNSKU_IDENTITY",
  "POLYBAG_PRESENCE",
  "POLYBAG_SEAL",
  "SUFFOCATION_WARNING_PRESENCE",
  "SUFFOCATION_WARNING_LEGIBILITY",
  "MANUFACTURER_BARCODE_COVERAGE",
  "EXPIRY_VISIBILITY",
  "EXPIRY_LEGIBILITY",
  "HANDLING_MARKS",
  "FNSKU_PLACEMENT",
] as const;

export interface RunPrepInspectionParams {
  /** Day-1 visual observation output from the multimodal vision layer */
  observation: PrepUnitObservation;
  /** Work-order specification contract */
  workOrder: WorkOrderSpecification;
  /** Rule registry or list of authoritative rules to query for checks */
  rules?: RuleRegistry | readonly AuthoritativePrepRule[];
  /** Explicit policy context for checks without work-order intent (placement, barcode coverage) */
  policyContext?: ExplicitPolicyResolutionContext;
  /** Inspection and vision metadata */
  metadata?: {
    inspectionId?: string;
    inspectedAt?: string;
    visionModel?: string;
    visionRequestCount?: number;
  };
}

/**
 * Executes a deterministic compliance inspection pass across a prepped unit.
 *
 * Sits downstream of visual observation:
 * Observation + Work Order + Authoritative Rules + Policy Context
 *   → Identity Guardrail
 *   → Rule Resolution for each check
 *   → Evaluator Invocation
 *   → Validated PrepInspectionRecord
 *
 * ARCHITECTURAL CONSTRAINTS:
 * - Does NOT call Gemini (multimodal perception is strictly upstream).
 * - Does NOT compute an overall pass/fail conclusion.
 * - Does NOT convert DEGRADED/UNUSABLE image quality to FAIL.
 * - Preserves rule provenance throughout all checks.
 */
export function runPrepInspection(
  params: RunPrepInspectionParams
): PrepInspectionRecord {
  const { observation, workOrder, policyContext } = params;

  // 1. Identity Guardrail: observation unitId MUST equal workOrder unitId
  if (observation.unitId !== workOrder.unitId) {
    throw new UnitIdentityMismatchError(
      observation.unitId,
      workOrder.unitId
    );
  }

  // 2. Prepare registry lookup
  let registry: RuleRegistry;
  if (params.rules instanceof RuleRegistry) {
    registry = params.rules;
  } else if (Array.isArray(params.rules)) {
    registry = new RuleRegistry(params.rules as AuthoritativePrepRule[]);
  } else {
    registry = defaultRuleRegistry;
  }

  // 3. Execution of all 10 supported checks
  const checks: ComplianceCheckResult[] = [];

  for (const checkType of SUPPORTED_INSPECTION_CHECKS) {
    const rule = registry.getActiveRuleForCheck(checkType);

    if (!rule) {
      // Unresolved rule: does not crash the inspection
      checks.push(
        complianceCheckResultSchema.parse({
          checkId: `UNRESOLVED:${checkType}`,
          checkType,
          applicability: "APPLICABLE",
          verdict: "UNCERTAIN",
          reasonCode: "RULE_UNAVAILABLE",
          explanation: `No active authoritative rule registered for check type ${checkType}.`,
          rule: {
            ruleId: "UNRESOLVED_RULE",
            version: "unknown",
          },
          evidence: [],
          observedValue: null,
        })
      );
      continue;
    }

    // Resolve requirement
    const resolution = resolveRequirement({
      checkType,
      workOrder,
      rule,
      context: policyContext,
    });

    if (resolution.status === "UNRESOLVED") {
      let reasonCode: ComplianceReasonCode = "RULE_UNAVAILABLE";
      if (resolution.reason === "REQUIREMENT_INPUT_UNKNOWN") {
        reasonCode = "REQUIREMENT_UNKNOWN";
      }

      checks.push(
        complianceCheckResultSchema.parse({
          checkId: `${resolution.ruleRef?.ruleId ?? rule.ruleId}:${checkType}`,
          checkType,
          applicability: "APPLICABLE",
          verdict: "UNCERTAIN",
          reasonCode,
          explanation: resolution.explanation,
          rule: resolution.ruleRef ?? {
            ruleId: rule.ruleId,
            version: rule.version,
          },
          evidence: [],
          observedValue: null,
        })
      );
      continue;
    }

    const resolvedReq = resolution.requirement;
    const checkId = `${rule.ruleId}:${checkType}`;

    // Invoke the corresponding evaluator
    let checkResult: ComplianceCheckResult;

    switch (checkType) {
      case "FNSKU_IDENTITY": {
        checkResult = evaluateFnskuIdentity({
          checkId,
          expectedFnsku: workOrder.expectedFnsku,
          fnskuObservation: observation.fnsku,
          rule,
        });
        break;
      }

      case "POLYBAG_PRESENCE": {
        checkResult = evaluatePolybagPresence({
          checkId,
          workOrder,
          polybagObservation: observation.polybag,
          rule,
        });
        break;
      }

      case "POLYBAG_SEAL": {
        checkResult = evaluatePolybagSeal({
          checkId,
          workOrder,
          polybagObservation: observation.polybag,
          rule,
        });
        break;
      }

      case "SUFFOCATION_WARNING_PRESENCE": {
        checkResult = evaluateSuffocationWarningPresence({
          checkId,
          workOrder,
          suffocationWarningObservation: observation.suffocationWarning,
          rule,
        });
        break;
      }

      case "SUFFOCATION_WARNING_LEGIBILITY": {
        checkResult = evaluateSuffocationWarningLegibility({
          checkId,
          workOrder,
          suffocationWarningObservation: observation.suffocationWarning,
          rule,
        });
        break;
      }

      case "MANUFACTURER_BARCODE_COVERAGE": {
        checkResult = evaluateManufacturerBarcodeCoverage({
          checkId,
          requirement:
            resolvedReq as ResolvedManufacturerBarcodeCoverageRequirement,
          manufacturerBarcodeObservation: observation.manufacturerBarcode,
          manufacturerBarcodeCoverageObservation:
            observation.manufacturerBarcodeCoverage,
        });
        break;
      }

      case "EXPIRY_VISIBILITY": {
        checkResult = evaluateExpiryVisibility({
          checkId,
          workOrder,
          expiryObservation: observation.expiryDate,
          rule,
        });
        break;
      }

      case "EXPIRY_LEGIBILITY": {
        checkResult = evaluateExpiryLegibility({
          checkId,
          workOrder,
          expiryObservation: observation.expiryDate,
          rule,
        });
        break;
      }

      case "HANDLING_MARKS": {
        checkResult = evaluateHandlingMarks({
          checkId,
          workOrder,
          handlingMarksObservations: observation.handlingMarks,
          rule,
        });
        break;
      }

      case "FNSKU_PLACEMENT": {
        checkResult = evaluateFnskuPlacement({
          checkId,
          requirement: resolvedReq as ResolvedFnskuPlacementRequirement,
          fnskuObservation: observation.fnsku,
        });
        break;
      }

      default: {
        const _exhaustive: never = checkType;
        throw new Error(`Unhandled check type in orchestrator: ${String(_exhaustive)}`);
      }
    }

    checks.push(checkResult);
  }

  // 4. Construct final validated record
  const inspectionId =
    params.metadata?.inspectionId ??
    `INSP-${workOrder.unitId}-${Date.now()}`;
  const inspectedAt =
    params.metadata?.inspectedAt ?? new Date().toISOString();
  const visionModel = params.metadata?.visionModel ?? "gemini-2.5-flash";
  const visionRequestCount = params.metadata?.visionRequestCount ?? 1;

  return prepInspectionRecordSchema.parse({
    inspectionId,
    unitId: workOrder.unitId,
    workOrderId: workOrder.workOrderId,
    sku: workOrder.sku,
    asin: workOrder.asin,
    imageQuality: observation.imageQuality,
    checks,
    metadata: {
      inspectedAt,
      visionModel,
      visionRequestCount,
    },
  });
}
