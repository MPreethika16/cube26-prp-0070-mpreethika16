import { z } from "zod";

/**
 * Controlled enumeration of distinct preparation compliance check types.
 *
 * Each check represents an independent physical or labeling condition
 * evaluated against visual observations and authoritative channel rules.
 *
 * Extensible through code changes, not arbitrary runtime strings.
 */
export const prepCheckTypeSchema = z.enum([
  "POLYBAG_PRESENCE",
  "POLYBAG_SEAL",
  "SUFFOCATION_WARNING_PRESENCE",
  "SUFFOCATION_WARNING_LEGIBILITY",
  "FNSKU_IDENTITY",
  "FNSKU_PLACEMENT",
  "MANUFACTURER_BARCODE_COVERAGE",
  "EXPIRY_VISIBILITY",
  "EXPIRY_LEGIBILITY",
  "HANDLING_MARKS",
]);

export type PrepCheckType = z.infer<typeof prepCheckTypeSchema>;
