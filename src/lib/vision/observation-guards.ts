import type { PrepUnitObservation, VisualEvidence } from "./prep-observation.schema";

const EXPIRY_CUE = /\b(expir\w*|use[\s-]*by|best[\s-]*before|best[\s-]*by)\b/i;
const RELATIVE_BEST_BEFORE = /best[\s-]*before\s+\d+\s*(year|month)/i;
const MANUFACTURE_OR_PACK = /\b(mfd|mfg|manufactur\w*|pkd|packed|pack(?:ing)?\s*date|date\s+of\s+manufacture)\b/i;
const NOT_A_BAG = /window\s*carton|display\s*window|blister(?:\s+(?:display|card|pack|window))?|carton\s*window|hang[\s-]*card/i;
const REAL_BAG = /poly\s*bag|polybag|plastic\s*bag|\bsleeve\b|overwrap|shrink[\s-]*wrap/i;
const SUFFOCATION_SENTENCE = /suffocat|chok(?:e|ing)|not a toy|keep away from (?:babies|children|kids)/i;
/** Ruthvik's outsource stand-in: a red handle-with-care / glass-with-care label, when the word "suffocation" is not printed. */
const CARE_LABEL = /handle\s*with\s*care|glass\s*with\s*care/i;

/** Sticker words seen on the hub cartons and retail boxes, mapped to the mark the rule compares. */
export function canonicalHandlingType(text: string | null | undefined): string | null {
  const value = text || "";
  if (/glass\s*with\s*care|handle\s*with\s*care|fragile|broken\s*glass/i.test(value)) return "fragile";
  if (/protect\s*from\s*water|keep\s*dry|umbrella/i.test(value)) return "keep_dry";
  if (/this\s*way\s*up|this\s*side\s*up|arrows?\s*up/i.test(value)) return "this_way_up";
  if (/medicine\s*inside/i.test(value)) return "medicine_inside";
  return null;
}
const ISBN_VALUE = /\bisbn\b|(?:^|[^0-9])97[89]\d{10}(?:[^0-9]|$)/i;
const BACK_CLAIM = /\b(back|rear)\s+(label|panel|side|photo|view)\b/i;
const BACK_IMAGE = /(^|[^a-z0-9])(back|rear)([^a-z0-9]|$)/i;

function blob(value: string | null | undefined, evidence: VisualEvidence[]): string {
  return [value || "", ...evidence.map((row) => row.description)].join(" \n ");
}

/** GS1 check digit for GTIN-8/12/13/14. Null when the string is not a GTIN. */
export function gtinCheckDigitOk(value: string): boolean | null {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return null;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const weight = (body.length - i) % 2 === 0 ? 1 : 3;
    sum += Number(body[i]) * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(digits[digits.length - 1]);
}

const STORAGE_LINE = /store\s+in|cool,?\s*dry|hygienic|not above\s+\d|do not freeze|protect from light|dark place/i;
const SHIPPING_MARK = /glass\s*with\s*care|handle\s*with\s*care|fragile|broken\s*glass|this\s*way\s*up|this\s*side\s*up|keep\s*dry|protect\s*from\s*water|umbrella|arrows?\s*up/i;

function isConsumerExpiry(text: string): boolean {
  if (MANUFACTURE_OR_PACK.test(text) && !EXPIRY_CUE.test(text)) return false;
  return true;
}

/** A printed "best before N years from MFD" rule is visible. The manufacture date on that line is not the expiry. */
function isRelativeBestBefore(text: string): boolean {
  return RELATIVE_BEST_BEFORE.test(text);
}

function suppliedSet(imageIds: string[]): Set<string> {
  return new Set(imageIds);
}

function backWasSupplied(imageIds: string[]): boolean {
  return imageIds.some((id) => BACK_IMAGE.test(id));
}

function keepEvidence(evidence: VisualEvidence[], supplied: Set<string>, allowBackClaims: boolean): VisualEvidence[] {
  return evidence.filter((row) => {
    if (!supplied.has(row.imageId)) return false;
    if (!allowBackClaims && BACK_CLAIM.test(row.description)) return false;
    return true;
  });
}

/**
 * Downgrades false VISIBLE reads. Does not emit PASS or FAIL.
 * Manufacture and pack dates are not expiry. A window carton is not a polybag.
 * An ISBN is not an FNSKU. A back-label claim needs a back image in the request.
 */
export function applyObservationGuards(observation: PrepUnitObservation, imageIds: string[]): PrepUnitObservation {
  const supplied = suppliedSet(imageIds);
  const allowBackClaims = backWasSupplied(imageIds);
  const next: PrepUnitObservation = {
    ...observation,
    polybag: { ...observation.polybag, evidence: [...observation.polybag.evidence] },
    suffocationWarning: { ...observation.suffocationWarning, evidence: [...observation.suffocationWarning.evidence] },
    fnsku: { ...observation.fnsku, evidence: [...observation.fnsku.evidence] },
    manufacturerBarcode: { ...observation.manufacturerBarcode, evidence: [...observation.manufacturerBarcode.evidence] },
    expiryDate: { ...observation.expiryDate, evidence: [...observation.expiryDate.evidence] },
    handlingMarks: observation.handlingMarks.map((mark) => ({ ...mark, evidence: [...mark.evidence] })),
  };

  next.expiryDate.evidence = keepEvidence(next.expiryDate.evidence, supplied, allowBackClaims);
  if (next.expiryDate.visibility === "VISIBLE") {
    const text = blob(next.expiryDate.detectedValue, next.expiryDate.evidence);
    const unsupported = !isConsumerExpiry(text) || next.expiryDate.evidence.length === 0;
    if (isRelativeBestBefore(text)) {
      next.expiryDate = {
        ...next.expiryDate,
        visibility: "VISIBLE",
        legibility: "ILLEGIBLE",
        detectedValue: null,
      };
    } else if (unsupported) {
      next.expiryDate = {
        ...next.expiryDate,
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      };
    }
  }

  next.polybag.evidence = keepEvidence(next.polybag.evidence, supplied, allowBackClaims);
  if (next.polybag.visibility === "VISIBLE") {
    const text = blob(null, next.polybag.evidence);
    const windowOnly = NOT_A_BAG.test(text) && !REAL_BAG.test(text);
    if (windowOnly || next.polybag.evidence.length === 0) {
      next.polybag = {
        visibility: "NOT_DETECTED",
        sealStatus: "UNCERTAIN",
        packagingType: "NONE_DETECTED",
        evidence: [],
      };
    }
  }

  next.fnsku.evidence = keepEvidence(next.fnsku.evidence, supplied, allowBackClaims);
  if (next.fnsku.visibility === "VISIBLE") {
    const text = blob(next.fnsku.detectedValue, next.fnsku.evidence);
    const isbn = ISBN_VALUE.test(next.fnsku.detectedValue || "") || /\bisbn\b/i.test(text);
    if (isbn || next.fnsku.evidence.length === 0) {
      next.fnsku = {
        ...next.fnsku,
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        valueCompleteness: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      };
    }
  }

  next.manufacturerBarcode.evidence = keepEvidence(next.manufacturerBarcode.evidence, supplied, allowBackClaims);
  const barcodeDigits = next.manufacturerBarcode.detectedValue;
  if (
    next.manufacturerBarcode.visibility === "VISIBLE"
    && barcodeDigits
    && gtinCheckDigitOk(barcodeDigits) === false
  ) {
    next.manufacturerBarcode = {
      ...next.manufacturerBarcode,
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      detectedValue: null,
    };
  }
  if (next.manufacturerBarcode.visibility === "VISIBLE" && next.manufacturerBarcode.evidence.length === 0) {
    next.manufacturerBarcode = {
      ...next.manufacturerBarcode,
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    };
  }

  next.handlingMarks = next.handlingMarks.map((mark) => {
    const evidence = keepEvidence(mark.evidence, supplied, allowBackClaims);
    if (mark.visibility === "VISIBLE" && evidence.length === 0) {
      return { ...mark, visibility: "NOT_DETECTED" as const, legibility: "UNCERTAIN" as const, detectedText: null, evidence: [] };
    }
    const text = blob(mark.detectedText, evidence) + " " + (mark.detectedType || "");
    if (STORAGE_LINE.test(text) && !SHIPPING_MARK.test(text)) {
      return { ...mark, visibility: "NOT_DETECTED" as const, legibility: "UNCERTAIN" as const, detectedText: null, detectedType: mark.detectedType, evidence };
    }
    const canonical = canonicalHandlingType(text);
    return { ...mark, evidence, detectedType: canonical || mark.detectedType };
  });

  next.suffocationWarning.evidence = keepEvidence(next.suffocationWarning.evidence, supplied, allowBackClaims);
  const warningText = blob(next.suffocationWarning.detectedText, next.suffocationWarning.evidence);
  const warningSentence = SUFFOCATION_SENTENCE.test(warningText);
  const warningCare = CARE_LABEL.test(warningText);
  if (
    next.suffocationWarning.visibility === "VISIBLE"
    && (next.suffocationWarning.evidence.length === 0 || (!warningSentence && !warningCare))
  ) {
    next.suffocationWarning = {
      ...next.suffocationWarning,
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    };
  } else if (next.suffocationWarning.visibility === "VISIBLE" && warningCare && !warningSentence) {
    const phrase = warningText.match(CARE_LABEL)?.[0] ?? "handle with care";
    next.suffocationWarning = { ...next.suffocationWarning, detectedText: phrase };
  }

  if (next.suffocationWarning.visibility !== "VISIBLE") {
    const mark = next.handlingMarks.find((row) => {
      if (row.visibility !== "VISIBLE") return false;
      return CARE_LABEL.test(blob(row.detectedText, row.evidence));
    });
    if (mark) {
      const phrase = blob(mark.detectedText, mark.evidence).match(CARE_LABEL)?.[0] ?? "handle with care";
      next.suffocationWarning = {
        visibility: "VISIBLE",
        legibility: mark.legibility === "LEGIBLE" ? "LEGIBLE" : "UNCERTAIN",
        detectedText: phrase,
        evidence: mark.evidence,
      };
    }
  }

  return next;
}
