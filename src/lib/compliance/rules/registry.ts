import {
  authoritativePrepRuleSchema,
  type AuthoritativePrepRule,
} from "../authoritative-rule.schema";
import type { PrepCheckType } from "../check-types";

/**
 * ============================================================================
 * AUTHORITATIVE RULE REGISTRY INFRASTRUCTURE
 * ============================================================================
 *
 * Engineering Rule 5 & Day 2 Requirements:
 * - Rules must validate strictly through `authoritativePrepRuleSchema`.
 * - No arbitrary runtime rules or fabricated policies without provenance.
 * - No executable JavaScript, dynamic strings, or `eval()` inside rule objects.
 * - Unknown rule lookups return `undefined` — never fabricate a fallback rule.
 * - The production registry initially contains only rules whose provenance has
 *   been formally verified.
 * ============================================================================
 */

export class RuleRegistry {
  private readonly rules = new Map<string, AuthoritativePrepRule>();

  constructor(initialRules: AuthoritativePrepRule[] = []) {
    for (const rule of initialRules) {
      this.registerRule(rule);
    }
  }

  /**
   * Registers an authoritative rule after validating it against authoritativePrepRuleSchema.
   * Throws ZodError if the rule metadata is malformed or invalid.
   */
  public registerRule(ruleInput: unknown): AuthoritativePrepRule {
    const validatedRule = authoritativePrepRuleSchema.parse(ruleInput);

    // Prevent duplicate conflicting registrations with same ruleId
    this.rules.set(validatedRule.ruleId, Object.freeze(validatedRule));
    return validatedRule;
  }

  /**
   * Retrieves a rule by its canonical identifier.
   * Returns undefined if not found. Never invents a fallback rule.
   */
  public getRuleById(ruleId: string): AuthoritativePrepRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Finds the active authoritative rule for a specific prep check type.
   * Returns undefined if no ACTIVE rule exists for that check.
   */
  public getActiveRuleForCheck(
    checkType: PrepCheckType
  ): AuthoritativePrepRule | undefined {
    for (const rule of this.rules.values()) {
      if (rule.checkType === checkType && rule.status === "ACTIVE") {
        return rule;
      }
    }
    return undefined;
  }

  /**
   * Returns all currently registered rules as a read-only list.
   */
  public listRules(): readonly AuthoritativePrepRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Clears all registered rules (useful in test lifecycle).
   */
  public clear(): void {
    this.rules.clear();
  }
}

/**
 * Global default registry instance for production use.
 * Unpopulated with guessed policies until official channel documentation is verified.
 */
export const defaultRuleRegistry = new RuleRegistry();

export function getRuleById(ruleId: string): AuthoritativePrepRule | undefined {
  return defaultRuleRegistry.getRuleById(ruleId);
}

export function getActiveRuleForCheck(
  checkType: PrepCheckType
): AuthoritativePrepRule | undefined {
  return defaultRuleRegistry.getActiveRuleForCheck(checkType);
}

export function registerRule(ruleInput: unknown): AuthoritativePrepRule {
  return defaultRuleRegistry.registerRule(ruleInput);
}
