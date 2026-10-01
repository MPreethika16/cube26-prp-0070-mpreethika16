import { z } from "zod";
import { prepCheckTypeSchema } from "./check-types";

/**
 * ============================================================================
 * AUTHORITATIVE RULE METADATA & PROVENANCE CONTRACT
 * ============================================================================
 *
 * Engineering Rule 5:
 * "Where the channel publishes the requirement, retrieve it. Don't let a model
 * recall it from memory, and don't infer it from examples. That includes the
 * sample CSVs in this repo. Their requirement flags and fee amounts are dummy values."
 *
 * This schema defines the structure for recording authoritative compliance rules,
 * including verifiable publishing source, version, verifiability tier, and
 * required visual/work-order inputs.
 *
 * It contains PURE METADATA AND PROVENANCE.
 * It strictly avoids executable code, dynamic JS expressions, or ungrounded assertions.
 * ============================================================================
 */

export const visualVerifiabilitySchema = z.enum([
  "FULL",
  "PARTIAL",
  "NOT_VISUALLY_VERIFIABLE",
]);

export type VisualVerifiability = z.infer<typeof visualVerifiabilitySchema>;

export const ruleStatusSchema = z.enum([
  "ACTIVE",
  "SUPERSEDED",
  "UNVERIFIED",
]);

export type RuleStatus = z.infer<typeof ruleStatusSchema>;

/**
 * Provenance of the official published policy document.
 */
export const ruleSourceSchema = z.object({
  /** Official publisher (e.g. "Amazon Services LLC", "Amazon Seller Central"). */
  publisher: z.string().min(1),
  /** Authoritative URL where the rule is published. Must be a valid URL. */
  url: z.string().url(),
  /** ISO timestamp when the rule documentation was retrieved or verified. */
  retrievedAt: z.string().datetime(),
  /** Optional citation or chapter/section identifier in the published standard. */
  sourceNote: z.string().optional(),
});

export type RuleSource = z.infer<typeof ruleSourceSchema>;

/**
 * Criteria defining when this rule applies to a specific unit or shipment.
 */
export const ruleApplicabilitySchema = z.object({
  /** Source of applicability criteria (e.g. "CHANNEL_POLICY", "WORK_ORDER"). */
  source: z.string().min(1),
  /** Key input paths required to assess applicability (e.g. ["workOrder.requirements.polybag"]). */
  requiredInputs: z.array(z.string().min(1)),
});

export type RuleApplicability = z.infer<typeof ruleApplicabilitySchema>;

/**
 * Verification contract detailing what visual observation properties are checked.
 */
export const ruleVerificationSchema = z.object({
  /** Observation fields that must be present in visual evidence (e.g. ["polybag.visibility", "polybag.sealStatus"]). */
  requiredObservationFields: z.array(z.string().min(1)),
  /** Degree to which compliance can be fully verified from camera photos alone. */
  visualVerifiability: visualVerifiabilitySchema,
});

export type RuleVerification = z.infer<typeof ruleVerificationSchema>;

/**
 * Complete authoritative preparation rule contract.
 */
export const authoritativePrepRuleSchema = z.object({
  /** Canonical rule identifier (e.g. "AMZN-FBA-PREP-POLYBAG-001"). */
  ruleId: z.string().min(1),
  /** Rule revision or publication version. */
  version: z.string().min(1),
  /** Controlled check type covered by this rule. */
  checkType: prepCheckTypeSchema,
  /** Human-readable title of the prep requirement. */
  title: z.string().min(1),
  /** Provenance and source publication metadata. */
  source: ruleSourceSchema,
  /** When and how the rule applies. */
  applicability: ruleApplicabilitySchema,
  /** Photographic verifiability criteria. */
  verification: ruleVerificationSchema,
  /** Lifecycle status of the rule. */
  status: ruleStatusSchema,
});

export type AuthoritativePrepRule = z.infer<
  typeof authoritativePrepRuleSchema
>;
