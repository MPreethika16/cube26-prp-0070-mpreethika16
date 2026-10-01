import type { PrepInspectionRecord } from "../inspection/prep-inspection.schema";
import type { OperationalInspectionSummary } from "../inspection/operational-status";
import type { EvidenceRecoveryPlan } from "./recovery-action.schema";

/**
 * ============================================================================
 * OPERATIONAL ROUTING BOUNDARY (DAY 4 / STEP 2)
 * ============================================================================
 *
 * Pluggable boundary for future multi-agent routing (e.g. Jev integration).
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - DO NOT install or call Jev in this step.
 * - This interface provides an advisory operational decision.
 * - It MUST NOT and CANNOT alter compliance verdicts, inspection records,
 *   or operational aggregation results.
 * - DeterministicOperationalRouter is the default production router.
 * ============================================================================
 */

export type OperationalRoutingDecision =
  | "READY"
  | "FIX_PREP"
  | "RECAPTURE_EVIDENCE"
  | "HUMAN_REVIEW";

export interface OperationalRoutingInput {
  unitId: string;
  inspectionRecord: Pick<PrepInspectionRecord, "unitId" | "checks">;
  operationalStatus: OperationalInspectionSummary;
  recoveryPlan: EvidenceRecoveryPlan;
}

export interface OperationalRouter {
  route(input: OperationalRoutingInput): Promise<OperationalRoutingDecision>;
}

/**
 * Production deterministic implementation of the operational router.
 */
export class DeterministicOperationalRouter implements OperationalRouter {
  async route(
    input: OperationalRoutingInput
  ): Promise<OperationalRoutingDecision> {
    const { operationalStatus, recoveryPlan } = input;

    if (operationalStatus.status === "READY") {
      return "READY";
    }

    if (operationalStatus.status === "STOP_AND_FIX") {
      return "FIX_PREP";
    }

    // Operational status is REVIEW_REQUIRED
    if (recoveryPlan.requiresEvidence && recoveryPlan.actions.length > 0) {
      const hasPhotoRecapture = recoveryPlan.actions.some(
        (a) => a.actionType !== "HUMAN_REVIEW"
      );
      return hasPhotoRecapture ? "RECAPTURE_EVIDENCE" : "HUMAN_REVIEW";
    }

    return "HUMAN_REVIEW";
  }
}

export const defaultOperationalRouter = new DeterministicOperationalRouter();
