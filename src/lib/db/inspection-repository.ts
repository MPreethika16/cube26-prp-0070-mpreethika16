import { randomUUID } from "crypto";
import type { PrepInspectionRecord } from "../inspection/prep-inspection.schema";
import { withTenant } from "./tenant-context";

export interface PersistedInspectionRecord {
  id: string;
  orgId: string;
  unitId: string;
  workOrderId: string | null;
  status: string;
  inspectionRecord: PrepInspectionRecord;
  createdAt: string;
  updatedAt: string;
}

export class PostgresInspectionRepository {
  /**
   * Saves an inspection record under the given tenant context using PostgreSQL RLS.
   */
  async saveInspection(
    orgId: string,
    params: {
      id?: string;
      unitId: string;
      workOrderId?: string | null;
      status: string;
      inspectionRecord: PrepInspectionRecord;
    }
  ): Promise<PersistedInspectionRecord> {
    const id = params.id || randomUUID();
    const workOrderId = params.workOrderId ?? null;

    return withTenant(orgId, async (client) => {
      const res = await client.query<PersistedInspectionRecord>(
        `INSERT INTO prep_inspections (
          id, org_id, unit_id, work_order_id, status, inspection_record, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          inspection_record = EXCLUDED.inspection_record,
          updated_at = NOW()
        RETURNING 
          id,
          org_id as "orgId",
          unit_id as "unitId",
          work_order_id as "workOrderId",
          status,
          inspection_record as "inspectionRecord",
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        [id, orgId, params.unitId, workOrderId, params.status, JSON.stringify(params.inspectionRecord)]
      );

      return res.rows[0];
    });
  }

  /**
   * Retrieves an inspection record by ID under the given tenant context.
   * RLS automatically ensures that records belonging to other tenants return 0 rows.
   */
  async getInspectionById(orgId: string, id: string): Promise<PersistedInspectionRecord | null> {
    return withTenant(orgId, async (client) => {
      const res = await client.query<PersistedInspectionRecord>(
        `SELECT 
          id,
          org_id as "orgId",
          unit_id as "unitId",
          work_order_id as "workOrderId",
          status,
          inspection_record as "inspectionRecord",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM prep_inspections
        WHERE id = $1`,
        [id]
      );

      return res.rows[0] ?? null;
    });
  }

  /**
   * Lists all inspections for the active tenant.
   */
  async listInspections(orgId: string, limit = 50): Promise<PersistedInspectionRecord[]> {
    return withTenant(orgId, async (client) => {
      const res = await client.query<PersistedInspectionRecord>(
        `SELECT 
          id,
          org_id as "orgId",
          unit_id as "unitId",
          work_order_id as "workOrderId",
          status,
          inspection_record as "inspectionRecord",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM prep_inspections
        ORDER BY created_at DESC
        LIMIT $1`,
        [limit]
      );

      return res.rows;
    });
  }
}

export const postgresInspectionRepository = new PostgresInspectionRepository();
