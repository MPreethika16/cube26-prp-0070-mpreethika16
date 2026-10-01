import { NextRequest, NextResponse } from "next/server";
import { analyzePrepUnit, type PrepUnitImageInput } from "@/lib/vision/analyze-prep-unit";
import { resolveWorkOrderForUnit } from "@/lib/inspection/work-order-resolver";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "@/lib/compliance/rules/active-rules";
import { runPrepInspection } from "@/lib/inspection/run-prep-inspection";
import {
  aggregateOperationalStatus,
  getDeterministicOperatorAction,
} from "@/lib/inspection/operational-status";
import { buildEnrichedCheck } from "@/lib/inspection/inspection-view-model";
import { planEvidenceRecovery } from "@/lib/recovery/recovery-planner";
import { defaultOperationalRouter } from "@/lib/recovery/operational-router";
import { postgresInspectionRepository } from "@/lib/db/inspection-repository";
import { isValidOrgId, ALLOWED_DEMO_ORGS } from "@/lib/db/tenant-context";

import {
  inspectionRequestSchema,
  type InspectionRequestBody,
} from "@/lib/inspection/inspection-request.schema";
export { inspectionRequestSchema, type InspectionRequestBody };

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parseResult = inspectionRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Malformed request payload.",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { unitId, orgId: providedOrgId, images, workOrder: providedWorkOrder } = parseResult.data;

    // Fail-closed tenant validation: missing orgId is rejected with HTTP 400
    if (!providedOrgId || !providedOrgId.trim()) {
      return NextResponse.json(
        {
          error: "Missing required organization context (orgId).",
          code: "MISSING_TENANT_CONTEXT",
        },
        { status: 400 }
      );
    }

    // Fail-closed tenant validation: invalid orgId is rejected with HTTP 400
    if (!isValidOrgId(providedOrgId)) {
      return NextResponse.json(
        {
          error: `Invalid organization context "${providedOrgId}". Must be one of: ${ALLOWED_DEMO_ORGS.join(", ")}.`,
          code: "INVALID_TENANT_CONTEXT",
          allowedOrgs: ALLOWED_DEMO_ORGS,
        },
        { status: 400 }
      );
    }

    const effectiveOrgId = providedOrgId.trim();

    // 1. Resolve work order specification (prefer verified snapshot from client; fallback to resolver)
    let workOrder: typeof providedWorkOrder;
    if (providedWorkOrder) {
      if (providedWorkOrder.unitId !== unitId) {
        return NextResponse.json(
          {
            error: `Work order unitId (${providedWorkOrder.unitId}) does not match request unitId (${unitId}). Context contamination rejected.`,
          },
          { status: 400 }
        );
      }
      workOrder = providedWorkOrder;
    } else {
      try {
        workOrder = resolveWorkOrderForUnit(unitId, effectiveOrgId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 404 });
      }
    }

    // 2. Multimodal visual observation pipeline with fail-open fallback (Rule 3)
    const prepImages: PrepUnitImageInput[] = images.map((img) => ({
      imageId: img.imageId,
      mimeType: img.mimeType,
      imageData: img.imageData,
    }));

    let visionResult: Awaited<ReturnType<typeof analyzePrepUnit>> | null = null;
    let visionError: string | null = null;

    try {
      visionResult = await analyzePrepUnit(unitId, prepImages);
    } catch (vErr: unknown) {
      visionError = vErr instanceof Error ? vErr.message : String(vErr);
      console.warn(`[API Inspection] Vision analysis failed for ${unitId}: ${visionError}. Failing open to pending review.`);
    }

    if (!visionResult) {
      // Rule 3: Fail Open - model failure produces a pending review record rather than blocking
      const fallbackObservation = {
        unitId,
        imageQuality: {
          overall: "DEGRADED" as const,
          issues: [`Vision analysis unavailable: ${visionError || "upstream timeout"}`],
        },
        polybag: {
          visibility: "UNCERTAIN" as const,
          sealStatus: "UNCERTAIN" as const,
          evidence: [],
        },
        suffocationWarning: {
          visibility: "UNCERTAIN" as const,
          legibility: "UNCERTAIN" as const,
          detectedText: null,
          evidence: [],
        },
        fnsku: {
          visibility: "UNCERTAIN" as const,
          legibility: "UNCERTAIN" as const,
          valueCompleteness: "UNCERTAIN" as const,
          detectedValue: null,
          placement: "UNCERTAIN" as const,
          placementDescription: null,
          evidence: [],
        },
        manufacturerBarcode: {
          visibility: "UNCERTAIN" as const,
          legibility: "UNCERTAIN" as const,
          valueCompleteness: "UNCERTAIN" as const,
          detectedValue: null,
          evidence: [],
        },
        manufacturerBarcodeCoverage: {
          status: "UNCERTAIN" as const,
          coveringType: null,
          evidence: [],
        },
        expiryDate: {
          visibility: "UNCERTAIN" as const,
          legibility: "UNCERTAIN" as const,
          detectedValue: null,
          evidence: [],
        },
        handlingMarks: [],
        otherVisibleIssues: [],
      };

      const inspectionRecord = runPrepInspection({
        observation: fallbackObservation,
        workOrder,
        rules: ACTIVE_RULES,
        policyContext: PRODUCTION_POLICY_CONTEXT,
        metadata: {
          inspectedAt: new Date().toISOString(),
          visionModel: "fallback-review-agent",
          visionRequestCount: 0,
        },
      });

      const operationalStatus = aggregateOperationalStatus(inspectionRecord);
      const operatorActions: Record<string, string | null> = {};
      for (const check of inspectionRecord.checks) {
        operatorActions[check.checkType] = getDeterministicOperatorAction(check);
      }

      const enrichedChecks = inspectionRecord.checks.map((check) =>
        buildEnrichedCheck(check, workOrder, fallbackObservation, ACTIVE_RULES)
      );

      const recoveryPlan = planEvidenceRecovery({
        inspectionRecord,
        operationalStatus,
      });

      const routingDecision = await defaultOperationalRouter.route({
        unitId,
        inspectionRecord,
        operationalStatus,
        recoveryPlan,
      });

      return NextResponse.json({
        success: true,
        unitId,
        workOrder,
        observation: fallbackObservation,
        inspectionRecord,
        operationalStatus,
        operatorActions,
        enrichedChecks,
        recoveryPlan,
        routingDecision,
        isFailOpenFallback: true,
        failOpenReason: visionError,
        metadata: {
          model: "fallback-review-agent",
          durationMs: 0,
          attemptCount: 0,
          inspectedAt: inspectionRecord.metadata.inspectedAt,
        },
      });
    }

    // 3. Deterministic compliance pass with active production rules
    const actualModelName = visionResult.metadata.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

    const inspectionRecord = runPrepInspection({
      observation: visionResult.observation,
      workOrder,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
      metadata: {
        inspectedAt: new Date().toISOString(),
        visionModel: actualModelName,
        visionRequestCount: visionResult.metadata.attemptCount,
      },
    });

    // 4. Deterministic operational status aggregation
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);

    // 5. Deterministic operator actions & enriched checks view model
    const operatorActions: Record<string, string | null> = {};
    for (const check of inspectionRecord.checks) {
      operatorActions[check.checkType] = getDeterministicOperatorAction(check);
    }

    const enrichedChecks = inspectionRecord.checks.map((check) =>
      buildEnrichedCheck(check, workOrder, visionResult.observation, ACTIVE_RULES)
    );

    // 6. Evidence Recovery Planning (Step 2)
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });

    // 7. Operational Routing Decision (Step 2)
    const routingDecision = await defaultOperationalRouter.route({
      unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });

    // 8. PostgreSQL RLS Tenant-Isolated Persistence (Phase 5)
    let persistedRecordId: string | null = null;
    let persistenceWarning: string | null = null;
    try {
      const persisted = await postgresInspectionRepository.saveInspection(effectiveOrgId, {
        id: inspectionRecord.inspectionId,
        unitId,
        workOrderId: workOrder.workOrderId,
        status: operationalStatus.status,
        inspectionRecord,
      });
      persistedRecordId = persisted.id;
    } catch (dbErr: unknown) {
      persistenceWarning = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn(`[API Inspection] PostgreSQL RLS persistence notice for ${unitId}: ${persistenceWarning}`);
    }

    return NextResponse.json({
      success: true,
      unitId,
      orgId: effectiveOrgId,
      workOrder,
      observation: visionResult.observation,
      inspectionRecord,
      operationalStatus,
      operatorActions,
      enrichedChecks,
      recoveryPlan,
      routingDecision,
      persistedRecordId,
      persistenceWarning,
      metadata: {
        model: actualModelName,
        preprocessingMs: visionResult.metadata.preprocessingMs,
        visionRequestMs: visionResult.metadata.visionRequestMs,
        totalVisionMs: visionResult.metadata.totalVisionMs,
        durationMs: visionResult.metadata.totalVisionMs,
        attemptCount: visionResult.metadata.attemptCount,
        inspectedAt: inspectionRecord.metadata.inspectedAt,
        preprocessedImages: visionResult.metadata.preprocessedImages,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Inspection failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
