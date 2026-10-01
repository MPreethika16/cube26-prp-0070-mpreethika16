import type { AuthoritativePrepRule } from "./authoritative-rule.schema";
import type { PrepCheckType } from "./check-types";
import type { WorkOrderSpecification } from "./work-order.schema";
import {
  resolvedRequirementSchema,
  type PolicyPlacementSurface,
  type RequirementResolutionResult,
  type ResolvedRequirement,
} from "./resolved-requirement.schema";

/**
 * ============================================================================
 * EXPLICIT POLICY RESOLUTION CONTEXT
 * ============================================================================
 *
 * For checks whose semantics cannot be derived from work-order intent alone
 * (specifically FNSKU_PLACEMENT and MANUFACTURER_BARCODE_COVERAGE), the caller
 * must supply explicit, typed policy context.
 *
 * The resolver strictly refuses to invent policy from rule titles, URLs,
 * source notes, or observation enum names.
 * ============================================================================
 */

export interface FnskuPlacementPolicyContext {
  allowedPlacements: readonly PolicyPlacementSurface[];
  prohibitedPlacements: readonly PolicyPlacementSurface[];
}

export interface BarcodeCoveragePolicyContext {
  coverageRequired: boolean;
}

export interface ExplicitPolicyResolutionContext {
  fnskuPlacementPolicy?: FnskuPlacementPolicyContext;
  barcodeCoveragePolicy?: BarcodeCoveragePolicyContext;
}

export interface ResolveRequirementParams {
  checkType: PrepCheckType;
  workOrder: WorkOrderSpecification;
  rule: AuthoritativePrepRule;
  context?: ExplicitPolicyResolutionContext;
}

/**
 * Deterministically resolves what a specific check must verify for a specific unit.
 *
 * Inputs:
 * - WorkOrderSpecification
 * - AuthoritativePrepRule
 * - ExplicitPolicyResolutionContext (required for checks without work-order intent)
 *
 * Outputs:
 * - RequirementResolutionResult (RESOLVED with typed ResolvedRequirement, or UNRESOLVED with safe code)
 */
export function resolveRequirement(
  params: ResolveRequirementParams
): RequirementResolutionResult {
  const { checkType, workOrder, rule, context } = params;

  // 1. Rule existence check
  if (!rule) {
    return {
      status: "UNRESOLVED",
      checkType,
      reason: "RULE_NOT_FOUND",
      explanation: `No authoritative rule provided for check type ${checkType}.`,
    };
  }

  const ruleRef = {
    ruleId: rule.ruleId,
    version: rule.version,
  };

  // 2. Rule status check: Inactive rules cannot resolve an active requirement
  if (rule.status !== "ACTIVE") {
    return {
      status: "UNRESOLVED",
      checkType,
      reason: "RULE_INACTIVE",
      explanation: `Rule ${rule.ruleId} is not ACTIVE (current status: ${rule.status}). Inactive rules cannot resolve operational requirements.`,
      ruleRef,
    };
  }

  // 3. Resolve by checkType
  switch (checkType) {
    case "POLYBAG_PRESENCE": {
      const woState = workOrder.requirements.polybag;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "POLYBAG_PRESENCE",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "POLYBAG_SEAL": {
      const woState = workOrder.requirements.polybag;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "POLYBAG_SEAL",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "SUFFOCATION_WARNING_PRESENCE": {
      const woState = workOrder.requirements.suffocationWarning;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "SUFFOCATION_WARNING_PRESENCE",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "SUFFOCATION_WARNING_LEGIBILITY": {
      const woState = workOrder.requirements.suffocationWarning;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "SUFFOCATION_WARNING_LEGIBILITY",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "EXPIRY_VISIBILITY": {
      const woState = workOrder.requirements.expiryDate;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "EXPIRY_VISIBILITY",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "EXPIRY_LEGIBILITY": {
      const woState = workOrder.requirements.expiryDate;
      const applicability =
        woState === "REQUIRED"
          ? "APPLICABLE"
          : woState === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "EXPIRY_LEGIBILITY",
        applicability,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "HANDLING_MARKS": {
      const woMarks = workOrder.requirements.handlingMarks;
      const applicability =
        woMarks.state === "REQUIRED"
          ? "APPLICABLE"
          : woMarks.state === "NOT_REQUIRED"
          ? "NOT_APPLICABLE"
          : "UNKNOWN";

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "HANDLING_MARKS",
        applicability,
        requiredMarks: woMarks.requiredMarks,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "FNSKU_IDENTITY": {
      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "FNSKU_IDENTITY",
        applicability: "APPLICABLE",
        expectedFnsku: workOrder.expectedFnsku,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "FNSKU_PLACEMENT": {
      // Must NOT infer placement policy from rule titles or enum names
      if (!context?.fnskuPlacementPolicy) {
        return {
          status: "UNRESOLVED",
          checkType,
          reason: "INSUFFICIENT_POLICY_SEMANTICS",
          explanation:
            "FNSKU placement policy semantics (allowed/prohibited surfaces) must be explicitly supplied in resolution context. The resolver strictly refuses to infer policy from rule titles, notes, or enum names.",
          ruleRef,
        };
      }

      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "FNSKU_PLACEMENT",
        applicability: "APPLICABLE",
        allowedPlacements: context.fnskuPlacementPolicy.allowedPlacements,
        prohibitedPlacements: context.fnskuPlacementPolicy.prohibitedPlacements,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    case "MANUFACTURER_BARCODE_COVERAGE": {
      // Must NOT invent synthetic fields in WorkOrderSpecification
      if (!context?.barcodeCoveragePolicy) {
        return {
          status: "UNRESOLVED",
          checkType,
          reason: "INSUFFICIENT_POLICY_SEMANTICS",
          explanation:
            "Manufacturer barcode coverage requirement must be explicitly supplied from channel policy context. WorkOrderSpecification does not contain synthetic coverage flags.",
          ruleRef,
        };
      }

      const coverageRequired = context.barcodeCoveragePolicy.coverageRequired;
      const requirement: ResolvedRequirement = resolvedRequirementSchema.parse({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        applicability: coverageRequired ? "APPLICABLE" : "NOT_APPLICABLE",
        coverageRequired,
        ruleRef,
      });

      return {
        status: "RESOLVED",
        checkType,
        requirement,
      };
    }

    default: {
      const unhandled: never = checkType;
      throw new Error(`Unhandled check type in requirement resolver: ${String(unhandled)}`);
    }
  }
}
