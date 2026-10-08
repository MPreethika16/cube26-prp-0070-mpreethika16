import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyObservationGuards } from "../../src/lib/vision/observation-guards";
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

  it("keeps a use-by and a printed expiry, and drops a best-before rule counted from MFD", () => {
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
    assert.equal(applyObservationGuards(rule, ["front.jpeg"]).expiryDate.visibility, "NOT_DETECTED");
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
