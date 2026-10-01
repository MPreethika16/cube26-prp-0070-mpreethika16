import * as fs from "fs";
import * as path from "path";
import {
  parseWorkOrderFromCsvRow,
  type WorkOrderSpecification,
} from "../compliance/work-order.schema";

export interface TenantScopedRecord {
  orgId: string;
  unitId: string;
  workOrderId: string;
  sku: string;
  asin: string;
  expectedFnsku: string;
  prepPriceUsd: string;
  workOrder: WorkOrderSpecification;
}

/**
 * In-memory tenant isolation repository implementing CUBE Rule 1.
 * Loads prep_sample.csv and strictly scopes every query to the caller's organization ID.
 */
export class TenantIsolationRepository {
  private records: TenantScopedRecord[] = [];

  constructor(csvPath?: string) {
    const resolvedPath =
      csvPath || path.join(process.cwd(), "data", "prep_sample.csv");
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        const header = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim());
          const rowObj: Record<string, string> = {};
          for (let j = 0; j < header.length; j++) {
            rowObj[header[j]] = cols[j] ?? "";
          }
          if (rowObj.org_id && rowObj.unit_id) {
            try {
              const workOrder = parseWorkOrderFromCsvRow(rowObj);
              this.records.push({
                orgId: rowObj.org_id,
                unitId: rowObj.unit_id,
                workOrderId: rowObj.work_order_id,
                sku: rowObj.sku,
                asin: rowObj.asin,
                expectedFnsku: rowObj.fnsku,
                prepPriceUsd: rowObj.prep_price_usd,
                workOrder,
              });
            } catch {
              // Ignore unparseable demo rows
            }
          }
        }
      }
    }
  }

  /**
   * Retrieves records strictly filtered by orgId.
   * A caller from org_demo_bravo will NEVER receive records belonging to org_demo_alpha.
   */
  public listUnitsForTenant(orgId: string): TenantScopedRecord[] {
    if (!orgId || !orgId.trim()) return [];
    const normalized = orgId.trim();
    return this.records.filter((r) => r.orgId === normalized);
  }

  /**
   * Retrieves a single unit's work order strictly verified against the tenant.
   * If unit exists under a different tenant, returns null (zero cross-tenant leakage).
   */
  public getUnitForTenant(
    orgId: string,
    unitId: string
  ): TenantScopedRecord | null {
    if (!orgId || !unitId) return null;
    const normalizedOrg = orgId.trim();
    const normalizedUnit = unitId.trim();
    return (
      this.records.find(
        (r) => r.orgId === normalizedOrg && r.unitId === normalizedUnit
      ) ?? null
    );
  }

  /**
   * Resolves work order for unit ensuring organization ownership.
   */
  public resolveWorkOrderForTenant(
    orgId: string,
    unitId: string
  ): WorkOrderSpecification {
    const record = this.getUnitForTenant(orgId, unitId);
    if (!record) {
      throw new Error(
        `Work order for unit "${unitId}" not found for organization "${orgId}". Access denied or unit does not exist in tenant catalog.`
      );
    }
    return record.workOrder;
  }
}

export const defaultTenantRepository = new TenantIsolationRepository();
