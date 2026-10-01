import type { ExplicitPolicyResolutionContext } from "../requirement-resolver";
import {
  authoritativePrepRuleSchema,
  type AuthoritativePrepRule,
} from "../authoritative-rule.schema";
import {
  type PolicyScope,
  type ProductionPolicy,
} from "./production-policy.schema";
import { ProductionPolicyStore } from "./production-policy-store";

/**
 * ============================================================================
 * POLICY → RESOLVER ADAPTER (DAY 3 / STEP 3)
 * ============================================================================
 *
 * ARCHITECTURAL PRINCIPLE:
 * Strictly converts ACTIVE verified ProductionPolicy records into typed
 * policy context understood by the existing RequirementResolver.
 *
 * CONSTRAINTS:
 * - Does NOT evaluate observations.
 * - Does NOT produce PASS/FAIL.
 * - Does NOT call Gemini.
 * - Does NOT interpret arbitrary natural language.
 * - Does NOT parse sourceNote or evidenceNote to discover rules.
 * - Does NOT infer missing semantics or fabricate fallbacks.
 * - Uses ONLY machine-readable `semantics.evaluation`.
 * ============================================================================
 */

/**
 * Adapts active production policies from a ProductionPolicyStore into an
 * ExplicitPolicyResolutionContext.
 *
 * Guardrails:
 * - Only ACTIVE policies supply context (SUPERSEDED and UNVERIFIED return undefined).
 * - Missing active policies produce undefined in context; no fallback is fabricated.
 * - ACROSS_SEAM remains strictly unmapped for unit-level FNSKU placement.
 */
export function buildExplicitPolicyContext(
  store: ProductionPolicyStore,
  scope: PolicyScope = "UNIT_LEVEL_PREP"
): ExplicitPolicyResolutionContext {
  const context: ExplicitPolicyResolutionContext = {};

  // 1. FNSKU Placement Policy
  const fnskuPlacementPolicy = store.getActivePolicy("FNSKU_PLACEMENT", scope);
  if (
    fnskuPlacementPolicy &&
    fnskuPlacementPolicy.semantics.checkType === "FNSKU_PLACEMENT"
  ) {
    context.fnskuPlacementPolicy = {
      allowedPlacements: [
        ...fnskuPlacementPolicy.semantics.evaluation.allowedPlacements,
      ],
      prohibitedPlacements: [
        ...fnskuPlacementPolicy.semantics.evaluation.prohibitedPlacements,
      ],
    };
  }

  // 2. Manufacturer Barcode Coverage Policy
  const barcodePolicy = store.getActivePolicy(
    "MANUFACTURER_BARCODE_COVERAGE",
    scope
  );
  if (
    barcodePolicy &&
    barcodePolicy.semantics.checkType === "MANUFACTURER_BARCODE_COVERAGE"
  ) {
    context.barcodeCoveragePolicy = {
      coverageRequired:
        barcodePolicy.semantics.evaluation.coverageRequired,
    };
  }

  return context;
}

/**
 * Bridges an ACTIVE ProductionPolicy into an AuthoritativePrepRule so that
 * the existing requirement resolver and inspection orchestrator carry the
 * real production policy identity (policyId, version, source) end-to-end into
 * ResolvedRequirement and ComplianceCheckResult.
 */
export function productionPolicyToAuthoritativeRule(
  policy: ProductionPolicy
): AuthoritativePrepRule {
  return authoritativePrepRuleSchema.parse({
    ruleId: policy.policyId,
    version: policy.version,
    checkType: policy.checkType,
    title: policy.sourceNote,
    source: {
      publisher: policy.publisher,
      url: policy.sourceUrl,
      retrievedAt: policy.retrievedAt,
      sourceNote: policy.sourceReference?.evidenceNote ?? policy.sourceNote,
    },
    applicability: {
      source: policy.semantics.applicability.trigger,
      requiredInputs: [policy.semantics.applicability.description],
    },
    verification: {
      requiredObservationFields: policy.verificationLimitations.limitations,
      visualVerifiability: policy.verificationLimitations.visualVerifiability,
    },
    status: policy.status,
  });
}

/**
 * Converts all ACTIVE policies in a ProductionPolicyStore into a list of
 * validated AuthoritativePrepRule objects.
 */
export function createRulesFromPolicyStore(
  store: ProductionPolicyStore
): AuthoritativePrepRule[] {
  return store
    .listActivePolicies()
    .map((policy) => productionPolicyToAuthoritativeRule(policy));
}
