import type { AuthoritativePrepRule } from "../authoritative-rule.schema";
import {
  defaultProductionPolicyStore,
  buildExplicitPolicyContext,
  createRulesFromPolicyStore,
} from "../policy";
import type { ExplicitPolicyResolutionContext } from "../requirement-resolver";

/**
 * ============================================================================
 * ACTIVE RULES AND POLICY CONTEXT CONFIGURATION
 * ============================================================================
 *
 * Provides the single source of truth for active rules and policy context across:
 * - Real Inspection Development Pipeline (scripts/inspection-dev.ts)
 * - Deterministic Evaluation Harness (src/lib/evaluation/run-evaluation.ts)
 * - Compliance test suites
 * ============================================================================
 */

/**
 * 1. Verified Production Policies bridged into AuthoritativePrepRule format.
 * Covers all 10 prep checks with Amazon Seller Central published standards:
 * - FNSKU_IDENTITY (AMZN-POL-FNSKU-IDENTITY-2026)
 * - FNSKU_PLACEMENT (AMZN-POL-FNSKU-PLACEMENT-2026)
 * - MANUFACTURER_BARCODE_COVERAGE (AMZN-POL-BARCODE-COVERAGE-2026)
 * - POLYBAG_SEAL (AMZN-POL-POLYBAG-SEAL-2026)
 * - SUFFOCATION_WARNING_PRESENCE (AMZN-POL-SUFFOCATION-WARN-2026)
 * - POLYBAG_PRESENCE (AMZN-POL-POLYBAG-PRESENCE-2026)
 * - SUFFOCATION_WARNING_LEGIBILITY (AMZN-POL-SUFFOCATION-WARN-LEG-2026)
 * - EXPIRY_VISIBILITY (AMZN-POL-EXPIRY-VISIBILITY-2026)
 * - EXPIRY_LEGIBILITY (AMZN-POL-EXPIRY-LEGIBILITY-2026)
 * - HANDLING_MARKS (AMZN-POL-HANDLING-MARKS-2026)
 */
export const PRODUCTION_RULES: AuthoritativePrepRule[] = createRulesFromPolicyStore(
  defaultProductionPolicyStore
);

/**
 * 2. Explicit Policy Context built purely from ACTIVE ProductionPolicy records.
 * STRICT: Zero DEMO/TEST policy semantics are used in production.
 */
export const PRODUCTION_POLICY_CONTEXT: ExplicitPolicyResolutionContext =
  buildExplicitPolicyContext(defaultProductionPolicyStore);

/**
 * 3. Zero remaining DEMO / TEST rules in production.
 * All 10 checks have been graduated to verified production policies with provenance.
 */
export const REMAINING_DEMO_TEST_RULES: AuthoritativePrepRule[] = [];

/**
 * Combined active rule set: pure verified production policies.
 */
export const ACTIVE_RULES: AuthoritativePrepRule[] = [
  ...PRODUCTION_RULES,
];
