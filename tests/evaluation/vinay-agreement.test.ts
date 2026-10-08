import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { loadVinayAgreement } from "../../src/lib/evaluation/vinay-agreement";

describe("Vinay second labels", () => {
  it("stores 15 products and leaves the frozen sheet untouched", () => {
    const vinay = JSON.parse(readFileSync("data/labeling/vinay-held-out-15.json", "utf8"));
    const frozen = JSON.parse(readFileSync("held-out-reference-annotations.json", "utf8"));
    assert.equal(vinay.products.length, 15);
    assert.equal(vinay.labeler, "Vinay");
    assert.equal(frozen.metadata.evaluatorMethod.includes("NOT two independent"), true);
    assert.equal(frozen.products[2].annotations.expiry_visible, "YES");
    const product4 = vinay.products.find((row: { productId: string }) => row.productId === "PRODUCT-4");
    assert.equal(product4.judged.manufacturer_barcode_visible, null);
    assert.equal(product4.judged.identifier_kind, "mac_imei");
    const product7 = vinay.products.find((row: { productId: string }) => row.productId === "PRODUCT-7");
    assert.equal(product7.judged.barcode_symbology, "ISBN");
    assert.equal(product7.judged.fnsku_visible, "NO");
    assert.equal(Object.hasOwn(product7.judged, "polybag_sealed"), false);
  });

  it("counts agreement only on fields both sheets actually judged", () => {
    const agreement = loadVinayAgreement();
    assert.deepEqual(agreement.barcode_visible, { compared: 14, agree: 14, disagree: [] });
    assert.deepEqual(agreement.barcode_value, { compared: 13, agree: 13, disagree: [] });
    assert.deepEqual(agreement.fnsku_visible, { compared: 15, agree: 15, disagree: [] });
    assert.deepEqual(agreement.expiry_visible, { compared: 15, agree: 14, disagree: ["PRODUCT-3"] });
    assert.deepEqual(agreement.handling_mark_visible, {
      compared: 15,
      agree: 11,
      disagree: ["PRODUCT-1", "PRODUCT-12", "PRODUCT-13", "PRODUCT-15"],
    });
    assert.equal(agreement.unscored.length, 1);
    assert.match(agreement.unscored[0], /PRODUCT-4/);
  });
});
