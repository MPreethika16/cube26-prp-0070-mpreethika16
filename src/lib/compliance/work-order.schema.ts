import { z } from "zod";

/**
 * ============================================================================
 * WORK ORDER CONTRACT & SPECIFICATION
 * ============================================================================
 *
 * CRITICAL ARCHITECTURAL DISTINCTION:
 *
 * 1. WORK-ORDER INTENT (Represented by this schema):
 *    - Captures what the prep center or seller was CONTRACTED / INSTRUCTED
 *      to do for a physical unit prior to shipment (e.g. "Apply polybag",
 *      "Affix Fragile sticker").
 *    - Sourced from work orders, seller order specifications, or inbound manifests
 *      (e.g. the `wo_*` columns in the CUBE sample data).
 *    - Does NOT record what was observed on the physical unit.
 *
 * 2. OBSERVED COMPLETION (Represented by PrepUnitObservation in Day 1):
 *    - Captures what was physically seen and verifiable in photographs of the unit
 *      after preparation (e.g. `polybag.visibility = "NOT_DETECTED"`).
 *    - Does NOT imply whether the operation was contracted or required.
 *
 * 3. COMPLIANCE DECISION (Separate downstream layer):
 *    - Compares Work-Order Intent + Authoritative Channel Rules against
 *      Observed Completion to determine PASS / FAIL / UNCERTAIN.
 *    - Conflating work-order intent with observed completion creates circular
 *      reasoning or false defect determinations.
 * ============================================================================
 */

/**
 * Tri-state requirement applicability.
 *
 * - REQUIRED: The work order explicitly instructed this prep step to be performed.
 * - NOT_REQUIRED: The work order explicitly indicated this prep step is not needed.
 * - UNKNOWN: The work order is missing, omitted this instruction, or provided an
 *   unparseable value. This must NOT be silently defaulted to NOT_REQUIRED.
 */
export const requirementStateSchema = z.enum([
  "REQUIRED",
  "NOT_REQUIRED",
  "UNKNOWN",
]);

export type RequirementState = z.infer<typeof requirementStateSchema>;

/**
 * Standard handling mark identifiers known from the challenge domain.
 * Handled flexibly so future custom or channel-specific marks are also valid.
 */
export const knownHandlingMarkSchema = z.enum([
  "fragile",
  "liquid",
  "this_way_up",
]);

export type KnownHandlingMark = z.infer<typeof knownHandlingMarkSchema>;

/**
 * Handling marks requirement specification.
 */
export const handlingMarksRequirementSchema = z.object({
  state: requirementStateSchema,
  /** Specific handling marks requested if state is REQUIRED (e.g. ["fragile", "this_way_up"]). */
  requiredMarks: z.array(z.string()),
});

export type HandlingMarksRequirement = z.infer<
  typeof handlingMarksRequirementSchema
>;

/**
 * Grouped prep requirement flags explicitly supported by CUBE prep data.
 */
export const workOrderRequirementsSchema = z.object({
  polybag: requirementStateSchema,
  suffocationWarning: requirementStateSchema,
  expiryDate: requirementStateSchema,
  handlingMarks: handlingMarksRequirementSchema,
});

export type WorkOrderRequirements = z.infer<typeof workOrderRequirementsSchema>;

/**
 * Work-order specification contract for a prepped unit.
 *
 * Encodes only catalog identity and prep instructions from the work order.
 * Strictly excludes any post-prep inspection results or observed conditions.
 */
export const workOrderSpecificationSchema = z.object({
  workOrderId: z.string().min(1),
  unitId: z.string().min(1),
  sku: z.string().min(1),
  asin: z.string().min(1),
  expectedFnsku: z.string().min(1),
  requirements: workOrderRequirementsSchema,
});

export type WorkOrderSpecification = z.infer<
  typeof workOrderSpecificationSchema
>;

/**
 * Helper to parse a raw boolean-like CSV flag into RequirementState.
 *
 * Rules:
 * - True, "true", "TRUE", "1", "yes", "YES" -> REQUIRED
 * - False, "false", "FALSE", "0", "no", "NO" -> NOT_REQUIRED
 * - undefined, null, "", or any other unrecognized value -> UNKNOWN
 *
 * Crucially, missing or invalid values remain UNKNOWN and are NOT silently
 * coerced into NOT_REQUIRED.
 */
export function parseRequirementFlag(value: unknown): RequirementState {
  if (value === true) return "REQUIRED";
  if (value === false) return "NOT_REQUIRED";

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true" || trimmed === "1" || trimmed === "yes") {
      return "REQUIRED";
    }
    if (trimmed === "false" || trimmed === "0" || trimmed === "no") {
      return "NOT_REQUIRED";
    }
  }

  return "UNKNOWN";
}

/**
 * Helper to parse raw semicolon-delimited handling marks from a work-order field.
 *
 * Examples:
 * - "fragile;this_way_up" -> { state: "REQUIRED", requiredMarks: ["fragile", "this_way_up"] }
 * - "fragile" -> { state: "REQUIRED", requiredMarks: ["fragile"] }
 * - "" (explicit empty string) -> { state: "NOT_REQUIRED", requiredMarks: [] }
 * - undefined | null -> { state: "UNKNOWN", requiredMarks: [] }
 */
export function parseHandlingMarksRequirement(
  value: unknown
): HandlingMarksRequirement {
  if (value === undefined || value === null) {
    return { state: "UNKNOWN", requiredMarks: [] };
  }

  if (typeof value !== "string") {
    return { state: "UNKNOWN", requiredMarks: [] };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { state: "NOT_REQUIRED", requiredMarks: [] };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "none" || lower === "false" || lower === "no") {
    return { state: "NOT_REQUIRED", requiredMarks: [] };
  }

  const marks = trimmed
    .split(";")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  if (marks.length === 0) {
    return { state: "NOT_REQUIRED", requiredMarks: [] };
  }

  return {
    state: "REQUIRED",
    requiredMarks: marks,
  };
}

/**
 * Converts a raw row (e.g. from prep_sample.csv) into a validated WorkOrderSpecification.
 *
 * IMPORTANT:
 * - Only reads work-order specification fields (`work_order_id`, `unit_id`, `sku`,
 *   `asin`, `fnsku`, `wo_polybag`, `wo_suffocation_warning`, `wo_expiry_date`,
 *   `wo_handling_marks`).
 * - Completely ignores observed-result columns (`polybag_present_sealed`,
 *   `suffocation_warning`, `fnsku_label_placement`, `original_barcode_covered`,
 *   `expiry_date`, `handling_marks`, `operator_id`, `captured_at`).
 */
export function parseWorkOrderFromCsvRow(
  row: Record<string, unknown>
): WorkOrderSpecification {
  const workOrderId = String(row.work_order_id ?? row.workOrderId ?? "").trim();
  const unitId = String(row.unit_id ?? row.unitId ?? "").trim();
  const sku = String(row.sku ?? "").trim();
  const asin = String(row.asin ?? "").trim();
  const expectedFnsku = String(row.fnsku ?? row.expectedFnsku ?? "").trim();

  const polybag = parseRequirementFlag(row.wo_polybag ?? row.woPolybag);
  const suffocationWarning = parseRequirementFlag(
    row.wo_suffocation_warning ?? row.woSuffocationWarning
  );
  const expiryDate = parseRequirementFlag(
    row.wo_expiry_date ?? row.woExpiryDate
  );
  const handlingMarks = parseHandlingMarksRequirement(
    row.wo_handling_marks ?? row.woHandlingMarks
  );

  return workOrderSpecificationSchema.parse({
    workOrderId,
    unitId,
    sku,
    asin,
    expectedFnsku,
    requirements: {
      polybag,
      suffocationWarning,
      expiryDate,
      handlingMarks,
    },
  });
}
