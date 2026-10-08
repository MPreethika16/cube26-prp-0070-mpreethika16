import * as fs from "fs";
import * as path from "path";
import {
  parseWorkOrderFromCsvRow,
  type WorkOrderSpecification,
} from "../compliance/work-order.schema";

/**
 * Canonical demo work order for UNIT-0001 (Oblique Tech Pouch box).
 * Note: UNIT-0001 is a merchant/3PL physical fixture not present in prep_sample.csv.
 */
export const DEMO_UNIT_0001_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-3000",
  unitId: "UNIT-0001",
  sku: "SKU-POUCH-TECH",
  asin: "B0DUMMY101",
  expectedFnsku: "X00DUMMY001",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Sample A — Protein Snack demo work order (straight-through READY journey).
 * Internal fixture: DEMO-COMPLIANT
 */
export const DEMO_COMPLIANT_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-3099",
  unitId: "DEMO-COMPLIANT",
  sku: "SKU-PROT-SNACK",
  asin: "B0DUMMY999",
  expectedFnsku: "X00DUMMY001",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Sample B — Tech Pouch demo work order (physical defect / STOP_AND_FIX journey).
 * Internal fixture: DEMO-DEFECT
 */
export const DEMO_DEFECT_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-3097",
  unitId: "DEMO-DEFECT",
  sku: "SKU-TECH-POUCH",
  asin: "B0DUMMY997",
  expectedFnsku: "X00DUMMY002",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Sample C — Organic Tea demo work order (evidence recovery / REVIEW_REQUIRED journey).
 * Internal fixture: DEMO-RECOVERY
 */
export const DEMO_RECOVERY_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-3098",
  unitId: "DEMO-RECOVERY",
  sku: "SKU-ORGANIC-TEA",
  asin: "B0DUMMY998",
  expectedFnsku: "X00DUMMY003",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Real-world packaged clothing item with courier/shipping barcodes (manual test unit).
 */
export const REAL_PACKAGE_001_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-REAL-PKG-01",
  unitId: "REAL-PACKAGE-001",
  sku: "SKU-CLOTHING-APPAR",
  asin: "B0REALPKG01",
  expectedFnsku: "X00REALPKG01",
  requirements: {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

/**
 * Real-world Infinix Smart 8 phone box with QR and regulatory codes (manual test unit).
 */
export const REAL_PHONE_001_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-REAL-PHN-01",
  unitId: "REAL-PHONE-001",
  sku: "SKU-INFINIX-SMART8",
  asin: "B0REALPHN01",
  expectedFnsku: "X00REALPHN01",
  requirements: {
    polybag: "NOT_REQUIRED",
    suffocationWarning: "NOT_REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: {
      state: "NOT_REQUIRED",
      requiredMarks: [],
    },
  },
};

function hubOrder(
  unitId: string,
  sku: string,
  requirements: WorkOrderSpecification["requirements"]
): WorkOrderSpecification {
  return {
    workOrderId: `WO-${unitId}`,
    unitId,
    sku,
    asin: "B0HUBLOCAL",
    expectedFnsku: "NO-FNSKU-ON-UNIT",
    requirements,
  };
}

const noBag = {
  polybag: "NOT_REQUIRED" as const,
  suffocationWarning: "NOT_REQUIRED" as const,
  expiryDate: "NOT_REQUIRED" as const,
  handlingMarks: { state: "NOT_REQUIRED" as const, requiredMarks: [] as string[] },
};

/** Retail units from the 8 Oct hub folder. Requirements follow what is printed, not a guessed grade. */
const HUB_WORK_ORDERS: Record<string, WorkOrderSpecification> = {
  "HUB-DLINK-NFP-0WHI21": hubOrder("HUB-DLINK-NFP-0WHI21", "NFP-0WHI21", {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
  }),
  "HUB-TERABYTE-TB-UB-0110": hubOrder("HUB-TERABYTE-TB-UB-0110", "TB-UB-0110", {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "NOT_REQUIRED",
    handlingMarks: { state: "NOT_REQUIRED", requiredMarks: [] },
  }),
  "HUB-DAHUA-HFW1239": hubOrder("HUB-DAHUA-HFW1239", "DH-IPC-HFW1239TL2-A-IL", {
    ...noBag,
    handlingMarks: { state: "REQUIRED", requiredMarks: ["fragile", "keep_dry", "this_way_up"] },
  }),
  "HUB-VGA-60M": hubOrder("HUB-VGA-60M", "VGA-EXT-60M", noBag),
  "HUB-CPPLUS-TC51": hubOrder("HUB-CPPLUS-TC51", "CP-URC-TC51PL3C-L-V2", noBag),
  "HUB-CPPLUS-Z43Q": hubOrder("HUB-CPPLUS-Z43Q", "CP-Z43Q", noBag),
};

/**
 * Resolves the WorkOrderSpecification for a given unit ID.
 *
 * 1. Checks UNIT-0001, DEMO-COMPLIANT, DEMO-DEFECT, DEMO-RECOVERY, REAL-WORLD fixture specifications.
 * 2. Parses data/prep_sample.csv for matching unit_id rows.
 * 3. Throws an informative Error if not found.
 */
export function resolveWorkOrderForUnit(unitId: string, orgId?: string): WorkOrderSpecification {
  const normalizedId = unitId.trim();

  if (normalizedId === "UNIT-0001") {
    return DEMO_UNIT_0001_WORK_ORDER;
  }
  if (normalizedId === "SAMPLE-01" || normalizedId === "DEMO-COMPLIANT") {
    return {
      ...DEMO_COMPLIANT_WORK_ORDER,
      unitId: normalizedId,
    };
  }
  if (normalizedId === "SAMPLE-02" || normalizedId === "DEMO-DEFECT") {
    return {
      ...DEMO_DEFECT_WORK_ORDER,
      unitId: normalizedId,
    };
  }
  if (normalizedId === "SAMPLE-03" || normalizedId === "DEMO-RECOVERY") {
    return {
      ...DEMO_RECOVERY_WORK_ORDER,
      unitId: normalizedId,
    };
  }
  if (normalizedId === "REAL-PACKAGE-001") {
    return REAL_PACKAGE_001_WORK_ORDER;
  }
  if (normalizedId === "REAL-PHONE-001") {
    return REAL_PHONE_001_WORK_ORDER;
  }
  if (HUB_WORK_ORDERS[normalizedId]) {
    return HUB_WORK_ORDERS[normalizedId];
  }

  const csvPath = path.join(process.cwd(), "data", "prep_sample.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Work order catalog not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Work order catalog is empty");
  }

  const header = lines[0].split(",").map((h) => h.trim());

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      rowObj[header[j]] = cols[j] ?? "";
    }
    if (rowObj.unit_id === normalizedId) {
      if (orgId && rowObj.org_id && rowObj.org_id.trim() !== orgId.trim()) {
        throw new Error(
          `Unit "${normalizedId}" belongs to organization "${rowObj.org_id}", not "${orgId}". Cross-tenant access denied.`
        );
      }
      return parseWorkOrderFromCsvRow(rowObj);
    }
  }

  throw new Error(
    `Work order not found for unit "${normalizedId}". Please verify the Unit ID.`
  );
}

/**
 * Returns available demo unit definitions with identity metadata.
 * Note: Zero outcome leakage (no pre-inspection verdicts or status hints).
 */
export function getDemoUnitsList(): Array<{
  unitId: string;
  sku: string;
  asin: string;
  expectedFnsku: string;
  description: string;
}> {
  return [
    {
      unitId: "SAMPLE-01",
      sku: "SKU-PROT-SNACK",
      asin: "B0DUMMY999",
      expectedFnsku: "X00DUMMY001",
      description: "Protein Snack Box (Retail carton)",
    },
    {
      unitId: "SAMPLE-02",
      sku: "SKU-TECH-POUCH",
      asin: "B0DUMMY997",
      expectedFnsku: "X00DUMMY002",
      description: "Tech Organizer Pouch (Retail packaging)",
    },
    {
      unitId: "SAMPLE-03",
      sku: "SKU-ORGANIC-TEA",
      asin: "B0DUMMY998",
      expectedFnsku: "X00DUMMY003",
      description: "Organic Herbal Tea box (Expiration-dated product)",
    },
    {
      unitId: "UNIT-0001",
      sku: "SKU-POUCH-TECH",
      asin: "B0DUMMY101",
      expectedFnsku: "X00DUMMY001",
      description: "Oblique Tech Pouch box (Retail packaging)",
    },
    {
      unitId: "UNIT-0002",
      sku: "SKU-CANDLE-3",
      asin: "B0DUMMY964",
      expectedFnsku: "X00DUMMY002",
      description: "Face Pack carton (Fragile handling mark)",
    },
  ];
}
