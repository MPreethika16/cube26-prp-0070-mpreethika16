import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyObservationGuards, canonicalHandlingType, gtinCheckDigitOk } from "../../src/lib/vision/observation-guards";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

function blank(): PrepUnitObservation {
  return {
    unitId: "PRODUCT-1",
    imageQuality: { overall: "GOOD", issues: [] },
    polybag: { visibility: "NOT_DETECTED", sealStatus: "UNCERTAIN", packagingType: "NONE_DETECTED", evidence: [] },
    suffocationWarning: { visibility: "NOT_DETECTED", legibility: "UNCERTAIN", detectedText: null, evidence: [] },
    fnsku: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [],
    },
    manufacturerBarcode: { visibility: "NOT_DETECTED", legibility: "UNCERTAIN", detectedValue: null, evidence: [] },
    expiryDate: { visibility: "NOT_DETECTED", legibility: "UNCERTAIN", detectedValue: null, evidence: [] },
    handlingMarks: [],
    otherVisibleIssues: [],
  };
}

const front = [{ imageId: "front.jpeg", description: "front panel" }];

describe("observation guards", () => {
  it("drops a barcode whose check digit is impossible and keeps a valid GTIN", () => {
    assert.equal(gtinCheckDigitOk("8904250627722"), true);
    assert.equal(gtinCheckDigitOk("8904425062772"), false);
    const bad = blank();
    bad.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8904425062772",
      evidence: [{ imageId: "front.jpeg", description: "barcode digits" }],
    };
    const guarded = applyObservationGuards(bad, ["front.jpeg"]);
    assert.equal(guarded.manufacturerBarcode.visibility, "UNCERTAIN");
    assert.equal(guarded.manufacturerBarcode.detectedValue, null);
    const good = blank();
    good.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8904250627722",
      evidence: front,
    };
    assert.equal(applyObservationGuards(good, ["front.jpeg"]).manufacturerBarcode.detectedValue, "8904250627722");
  });

  it("drops manufacture and pack dates that were marked as expiry", () => {
    for (const detectedValue of ["MFD 04/2025", "PKD 08/2019", "packed AUG-2025", "mfg September 2025"]) {
      const observation = blank();
      observation.expiryDate = {
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedValue,
        evidence: [{ imageId: "front.jpeg", description: detectedValue }],
      };
      const guarded = applyObservationGuards(observation, ["front.jpeg"]);
      assert.equal(guarded.expiryDate.visibility, "NOT_DETECTED", detectedValue);
      assert.equal(guarded.expiryDate.detectedValue, null);
    }
  });

  it("keeps a use-by and a printed expiry, and keeps a best-before rule without storing the MFD as the date", () => {
    const useBy = blank();
    useBy.expiryDate = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "Use by AUG 26",
      evidence: [{ imageId: "front.jpeg", description: "Use by AUG 26 on the jar" }],
    };
    assert.equal(applyObservationGuards(useBy, ["front.jpeg"]).expiryDate.visibility, "VISIBLE");

    const exp = blank();
    exp.expiryDate = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "09/2027",
      evidence: [{ imageId: "front.jpeg", description: "Expiry date 09/2027" }],
    };
    assert.equal(applyObservationGuards(exp, ["front.jpeg"]).expiryDate.detectedValue, "09/2027");

    const rule = blank();
    rule.expiryDate = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "Best before 3 years from MFD June 2026",
      evidence: [{ imageId: "front.jpeg", description: "MFD June 2026" }],
    };
    const guardedRule = applyObservationGuards(rule, ["front.jpeg"]);
    assert.equal(guardedRule.expiryDate.visibility, "VISIBLE");
    assert.equal(guardedRule.expiryDate.legibility, "ILLEGIBLE");
    assert.equal(guardedRule.expiryDate.detectedValue, null);
  });

  it("does not treat a storage line as a shipping mark", () => {
    for (const detectedText of [
      "Store in a cool, dry and hygienic place",
      "Store not above 30°C, protect from light and moisture, do not freeze",
      "Store in a cool, dry and dark place",
    ]) {
      const observation = blank();
      observation.handlingMarks = [
        {
          detectedType: "label",
          visibility: "VISIBLE",
          legibility: "LEGIBLE",
          detectedText,
          evidence: [{ imageId: "label.jpeg", description: detectedText }],
        },
      ];
      const guarded = applyObservationGuards(observation, ["label.jpeg"]);
      assert.equal(guarded.handlingMarks[0].visibility, "NOT_DETECTED", detectedText);
      assert.equal(guarded.suffocationWarning.visibility, "NOT_DETECTED");
    }
  });

  it("does not treat a window carton as a polybag", () => {
    const observation = blank();
    observation.polybag = {
      visibility: "VISIBLE",
      sealStatus: "SEALED",
      packagingType: "POLYBAG",
      evidence: [{ imageId: "front.jpeg", description: "window carton with a display window" }],
    };
    const guarded = applyObservationGuards(observation, ["front.jpeg"]);
    assert.equal(guarded.polybag.visibility, "NOT_DETECTED");
    assert.equal(guarded.polybag.packagingType, "NONE_DETECTED");
    assert.notEqual(guarded.polybag.sealStatus, "SEALED");
  });

  it("does not accept an ISBN as an FNSKU", () => {
    const observation = blank();
    observation.fnsku = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "9780195692587",
      placement: "FLAT_SURFACE",
      placementDescription: "ISBN barcode",
      evidence: front,
    };
    const guarded = applyObservationGuards(observation, ["front.jpeg"]);
    assert.equal(guarded.fnsku.visibility, "NOT_DETECTED");
    assert.equal(guarded.fnsku.detectedValue, null);
  });

  it("does not treat a blister card as a polybag", () => {
    const observation = blank();
    observation.polybag = {
      visibility: "VISIBLE",
      sealStatus: "SEALED",
      packagingType: "POLYBAG",
      evidence: [{ imageId: "front.jpeg", description: "VGA extender on a blister card" }],
    };
    const guarded = applyObservationGuards(observation, ["front.jpeg"]);
    assert.equal(guarded.polybag.visibility, "NOT_DETECTED");
  });

  it("keeps a real polybag and drops a warning that has no suffocation sentence", () => {
    const observation = blank();
    observation.polybag = {
      visibility: "VISIBLE",
      sealStatus: "SEALED",
      packagingType: "POLYBAG",
      evidence: [{ imageId: "front.jpeg", description: "D-Link faceplate in a sealed plastic bag" }],
    };
    observation.suffocationWarning = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedText: "recycle mark and a crossed-out person icon",
      evidence: [{ imageId: "back.jpeg", description: "crossed-out person icon, no warning sentence" }],
    };
    const guarded = applyObservationGuards(observation, ["front.jpeg", "back.jpeg"]);
    assert.equal(guarded.polybag.visibility, "VISIBLE");
    assert.equal(guarded.suffocationWarning.visibility, "NOT_DETECTED");
    assert.equal(guarded.suffocationWarning.detectedText, null);
  });

  it("maps hub sticker words onto the handling mark the rule compares", () => {
    assert.equal(canonicalHandlingType("GLASS WITH CARE"), "fragile");
    assert.equal(canonicalHandlingType("PROTECT FROM WATER"), "keep_dry");
    assert.equal(canonicalHandlingType("THIS WAY UP"), "this_way_up");
    const observation = blank();
    observation.handlingMarks = [
      {
        detectedType: "label",
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "GLASS WITH CARE",
        evidence: [{ imageId: "front.jpeg", description: "red GLASS WITH CARE sticker" }],
      },
    ];
    const guarded = applyObservationGuards(observation, ["front.jpeg"]);
    assert.equal(guarded.handlingMarks[0].detectedType, "fragile");
    assert.equal(guarded.suffocationWarning.visibility, "VISIBLE");
    assert.equal(guarded.suffocationWarning.detectedText, "GLASS WITH CARE");
  });

  it("does not treat a crossed-out person icon as the care-label stand-in", () => {
    const observation = blank();
    observation.handlingMarks = [
      {
        detectedType: "icon",
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "crossed-out person",
        evidence: [{ imageId: "back.jpeg", description: "crossed-out person icon" }],
      },
    ];
    const guarded = applyObservationGuards(observation, ["back.jpeg"]);
    assert.equal(guarded.suffocationWarning.visibility, "NOT_DETECTED");
  });

  it("drops a back-label read when no back photo was supplied", () => {
    const observation = blank();
    observation.expiryDate = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "Use by AUG 26",
      evidence: [{ imageId: "front.jpeg", description: "read from the back label" }],
    };
    observation.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "8906071886920",
      evidence: [{ imageId: "back.jpeg", description: "barcode on the back" }],
    };
    const guarded = applyObservationGuards(observation, ["front.jpeg", "label.jpeg"]);
    assert.equal(guarded.expiryDate.visibility, "NOT_DETECTED");
    assert.equal(guarded.manufacturerBarcode.visibility, "NOT_DETECTED");
  });
});
