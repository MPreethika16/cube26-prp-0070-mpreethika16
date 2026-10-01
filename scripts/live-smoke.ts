import * as fs from "fs";
import * as path from "path";
import { loadEnvConfig } from "@next/env";
import {
  analyzePrepUnit,
  type PrepUnitImageInput,
} from "../src/lib/vision/analyze-prep-unit";

import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../src/lib/recovery/recovery-planner";
import { defaultOperationalRouter } from "../src/lib/recovery/operational-router";
import { evaluateEvidenceReadiness } from "../src/lib/evidence-quality/evaluate-evidence-readiness";

// Load environment variables (.env.local)
loadEnvConfig(process.cwd());

import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";

function loadUnitImages(unitId: string): {
  imagesForAnalysis: PrepUnitImageInput[];
  imagesForReadiness: Array<{
    slotId: "front" | "back" | "label";
    imageData: Buffer;
    mimeType: string;
  }>;
} {
  const fixturesDir = path.join(process.cwd(), "fixtures", "prep", "dev", unitId);
  const slots: Array<"front" | "back" | "label"> = ["front", "back", "label"];
  const imagesForAnalysis: PrepUnitImageInput[] = [];
  const imagesForReadiness: Array<{
    slotId: "front" | "back" | "label";
    imageData: Buffer;
    mimeType: string;
  }> = [];

  for (const slot of slots) {
    let filePath = path.join(fixturesDir, `${slot}.jpeg`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(fixturesDir, `${slot}.jpg`);
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture image not found for ${unitId}: ${slot}`);
    }
    const buffer = fs.readFileSync(filePath);
    imagesForAnalysis.push({
      imageId: slot,
      mimeType: "image/jpeg",
      imageData: buffer,
    });
    imagesForReadiness.push({
      slotId: slot,
      imageData: buffer,
      mimeType: "image/jpeg",
    });
  }

  return { imagesForAnalysis, imagesForReadiness };
}

async function runSmokeForUnit(unitId: string) {
  console.log(`\n============================================================`);
  console.log(`LIVE SMOKE TEST: ${unitId}`);
  console.log(`============================================================`);

  const startTime = Date.now();

  // 1. Load images
  const { imagesForAnalysis, imagesForReadiness } = loadUnitImages(unitId);

  // 2. Evidence Quality Gate / Readiness
  const readiness = evaluateEvidenceReadiness({
    slots: imagesForReadiness,
  });

  // 3. Work order resolution
  const workOrder = resolveWorkOrderForUnit(unitId);

  // 4. Multimodal visual observation (real Gemini call)
  const visionStart = Date.now();
  const visionResult = await analyzePrepUnit(unitId, imagesForAnalysis);
  const visionLatency = Date.now() - visionStart;

  // 5. Deterministic compliance inspection
  const inspectionRecord = runPrepInspection({
    observation: visionResult.observation,
    workOrder,
    rules: ACTIVE_RULES,
    policyContext: PRODUCTION_POLICY_CONTEXT,
    metadata: {
      inspectedAt: new Date().toISOString(),
      visionModel: "gemini-2.5-flash",
      visionRequestCount: visionResult.metadata.attemptCount,
    },
  });

  // 6. Operational status aggregation
  const operationalStatus = aggregateOperationalStatus(inspectionRecord);

  // 7. Evidence recovery planning
  const recoveryPlan = planEvidenceRecovery({
    inspectionRecord,
    operationalStatus,
  });

  // 8. Routing decision
  const routingDecision = await defaultOperationalRouter.route({
    unitId,
    inspectionRecord,
    operationalStatus,
    recoveryPlan,
  });

  const totalLatency = Date.now() - startTime;

  console.log(
    JSON.stringify(
      {
        unitId,
        diagnostics: {
          preprocessingMs: visionResult.metadata.preprocessingMs,
          visionRequestMs: visionResult.metadata.visionRequestMs,
          totalVisionMs: visionResult.metadata.totalVisionMs,
          attemptCount: visionResult.metadata.attemptCount,
          totalMs: totalLatency,
          preprocessedImages: visionResult.metadata.preprocessedImages,
        },
        evidenceReadiness: {
          status: readiness.status,
          canInspect: readiness.canInspect,
          missingSlots: readiness.missingSlots,
          warnings: readiness.warnings,
        },
        visionObservation: {
          fnsku: visionResult.observation.fnsku,
          polybag: visionResult.observation.polybag,
          suffocationWarning: visionResult.observation.suffocationWarning,
          manufacturerBarcode: visionResult.observation.manufacturerBarcode,
          manufacturerBarcodeCoverage: visionResult.observation.manufacturerBarcodeCoverage,
          expiryDate: visionResult.observation.expiryDate,
        },
        complianceResults: inspectionRecord.checks.map((c) => ({
          checkType: c.checkType,
          verdict: c.verdict,
          reasonCode: c.reasonCode,
          explanation: c.explanation,
        })),
        operationalStatus: {
          status: operationalStatus.status,
          passCount: operationalStatus.passCount,
          failCount: operationalStatus.failCount,
          uncertainCount: operationalStatus.uncertainCount,
          blockingCheckTypes: operationalStatus.blockingCheckTypes,
          uncertainCheckTypes: operationalStatus.uncertainCheckTypes,
        },
        recoveryActions: recoveryPlan.actions.map((a) => ({
          checkType: a.checkType,
          actionType: a.actionType,
          target: a.target,
          priority: a.priority,
          instruction: a.instruction,
        })),
        routingDecision,
      },
      null,
      2
    )
  );

  return {
    unitId,
    totalLatency,
    visionLatency,
    operationalStatus: operationalStatus.status,
    routingDecision,
    passCount: operationalStatus.passCount,
    failCount: operationalStatus.failCount,
    uncertainCount: operationalStatus.uncertainCount,
  };
}

async function main() {
  const units = ["UNIT-0001", "UNIT-0002"];
  const summary: unknown[] = [];

  for (const unitId of units) {
    try {
      const res = await runSmokeForUnit(unitId);
      summary.push(res);
    } catch (err: unknown) {
      console.error(`Smoke test failed for ${unitId}:`, err);
      summary.push({ unitId, error: String(err) });
    }
  }

  console.log("\n============================================================");
  console.log("SMOKE TEST SUMMARY");
  console.log("============================================================");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error);
