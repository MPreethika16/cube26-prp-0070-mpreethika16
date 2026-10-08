import { readFileSync } from "fs";
import path from "path";

type YesNo = "YES" | "NO";

export type VinayJudged = {
  manufacturer_barcode_visible: YesNo | null;
  manufacturer_barcode_value: string | null;
  fnsku_visible: YesNo;
  expiry_visible: YesNo;
  handling_mark_visible: YesNo;
  identifier_kind?: string;
  barcode_symbology?: string;
  expiry_read?: string;
};

export type FieldAgreement = {
  compared: number;
  agree: number;
  disagree: string[];
};

export type VinayAgreement = {
  barcode_visible: FieldAgreement;
  barcode_value: FieldAgreement;
  fnsku_visible: FieldAgreement;
  expiry_visible: FieldAgreement;
  handling_mark_visible: FieldAgreement;
  unscored: string[];
};

type FrozenProduct = {
  productId: string;
  annotations: Record<string, string>;
  notes?: string;
};

type VinayProduct = { productId: string; judged: VinayJudged };

function tally(rows: Array<{ id: string; same: boolean }>): FieldAgreement {
  return {
    compared: rows.length,
    agree: rows.filter((row) => row.same).length,
    disagree: rows.filter((row) => !row.same).map((row) => row.id),
  };
}

export function compareVinayToFrozen(vinayProducts: VinayProduct[], frozenProducts: FrozenProduct[]): VinayAgreement {
  const frozen = new Map(frozenProducts.map((product) => [product.productId, product]));
  const barcodeVisible: Array<{ id: string; same: boolean }> = [];
  const barcodeValue: Array<{ id: string; same: boolean }> = [];
  const fnsku: Array<{ id: string; same: boolean }> = [];
  const expiry: Array<{ id: string; same: boolean }> = [];
  const handling: Array<{ id: string; same: boolean }> = [];
  const unscored: string[] = [];

  for (const product of vinayProducts) {
    const reference = frozen.get(product.productId);
    if (!reference) throw new Error(`Frozen sheet has no ${product.productId}`);
    const judged = product.judged;
    if (judged.manufacturer_barcode_visible === null) {
      unscored.push(`${product.productId} barcode: Vinay did not judge a GTIN (${judged.identifier_kind || "unspecified"})`);
    } else {
      barcodeVisible.push({
        id: product.productId,
        same: judged.manufacturer_barcode_visible === reference.annotations.manufacturer_barcode_visible,
      });
    }
    if (judged.manufacturer_barcode_value) {
      barcodeValue.push({
        id: product.productId,
        same: (reference.notes || "").includes(judged.manufacturer_barcode_value),
      });
    }
    fnsku.push({ id: product.productId, same: judged.fnsku_visible === reference.annotations.fnsku_visible });
    expiry.push({ id: product.productId, same: judged.expiry_visible === reference.annotations.expiry_visible });
    handling.push({
      id: product.productId,
      same: judged.handling_mark_visible === reference.annotations.handling_mark_visible,
    });
  }

  return {
    barcode_visible: tally(barcodeVisible),
    barcode_value: tally(barcodeValue),
    fnsku_visible: tally(fnsku),
    expiry_visible: tally(expiry),
    handling_mark_visible: tally(handling),
    unscored,
  };
}

export function loadVinayAgreement(root = process.cwd()): VinayAgreement {
  const vinay = JSON.parse(readFileSync(path.join(root, "data/labeling/vinay-held-out-15.json"), "utf8")) as {
    products: VinayProduct[];
  };
  const frozen = JSON.parse(readFileSync(path.join(root, "held-out-reference-annotations.json"), "utf8")) as {
    products: FrozenProduct[];
  };
  return compareVinayToFrozen(vinay.products, frozen.products);
}
