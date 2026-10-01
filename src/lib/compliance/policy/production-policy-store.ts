import type { PrepCheckType } from "../check-types";
import {
  productionPolicySchema,
  type PolicyScope,
  type ProductionPolicy,
} from "./production-policy.schema";
import { VERIFIED_PRODUCTION_POLICIES } from "./production-policies";

/**
 * ============================================================================
 * PRODUCTION POLICY STORE & QUERY INTERFACE
 * ============================================================================
 *
 * ARCHITECTURAL CONSTRAINTS:
 * - Pure data store: strictly validates all inputs with productionPolicySchema.
 * - Guardrail: unverified or superseded policies CANNOT behave as active production policy.
 * - Deterministic lookup: unknown check types or scopes return undefined; never fabricates policies.
 * - Clean separation from test/demo rules.
 * ============================================================================
 */

export class ProductionPolicyStore {
  private readonly policies = new Map<string, ProductionPolicy>();

  constructor(initialPolicies: readonly ProductionPolicy[] = []) {
    for (const policy of initialPolicies) {
      this.registerPolicy(policy);
    }
  }

  /**
   * Registers a production policy after strict Zod validation.
   */
  public registerPolicy(policyInput: unknown): ProductionPolicy {
    const validated = productionPolicySchema.parse(policyInput);
    this.policies.set(validated.policyId, Object.freeze(validated));
    return validated;
  }

  /**
   * Retrieves an ACTIVE policy for a specific check type and scope.
   *
   * CRITICAL GUARDRAIL:
   * Returns undefined if:
   * - No policy is registered for the check/scope
   * - Registered policy has status !== "ACTIVE" (e.g. "UNVERIFIED" or "SUPERSEDED")
   *
   * Never silently upgrades an unverified policy to active.
   */
  public getActivePolicy(
    checkType: PrepCheckType,
    scope: PolicyScope = "UNIT_LEVEL_PREP"
  ): ProductionPolicy | undefined {
    for (const policy of this.policies.values()) {
      if (
        policy.checkType === checkType &&
        policy.scope === scope &&
        policy.status === "ACTIVE"
      ) {
        return policy;
      }
    }
    return undefined;
  }

  /**
   * Retrieves a policy by its unique policyId, regardless of status (for audit/provenance).
   */
  public getPolicyById(policyId: string): ProductionPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Lists only ACTIVE production policies.
   */
  public listActivePolicies(): readonly ProductionPolicy[] {
    return Array.from(this.policies.values()).filter(
      (p) => p.status === "ACTIVE"
    );
  }

  /**
   * Lists all registered policies (including UNVERIFIED and SUPERSEDED for audit/provenance).
   */
  public listAllPolicies(): readonly ProductionPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Clears the store (useful for isolated testing).
   */
  public clear(): void {
    this.policies.clear();
  }
}

/**
 * Global default production policy store initialized with verified Amazon policies.
 */
export const defaultProductionPolicyStore = new ProductionPolicyStore(
  VERIFIED_PRODUCTION_POLICIES
);
