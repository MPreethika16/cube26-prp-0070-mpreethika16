import * as fs from "fs";
import * as path from "path";
import { loadEnvConfig } from "@next/env";
import {
  analyzePrepUnit,
  type PrepUnitImageInput,
} from "../src/lib/vision/analyze-prep-unit";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import {
  aggregateOperationalStatus,
  getDeterministicOperatorAction,
} from "../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../src/lib/recovery/recovery-planner";
import { defaultOperationalRouter } from "../src/lib/recovery/operational-router";
import { evaluateEvidenceReadiness } from "../src/lib/evidence-quality/evaluate-evidence-readiness";

// Load environment variables (.env.local)
loadEnvConfig(process.cwd());

interface UnitConfig {
  unitId: string;
  dirPath: string;
  files: { front: string; back: string; label: string };
}

const REAL_UNITS: UnitConfig[] = [
  {
    unitId: "UNIT-0001",
    dirPath: path.join(process.cwd(), "fixtures", "prep", "dev", "UNIT-0001"),
    files: { front: "front.jpeg", back: "back.jpeg", label: "label.jpeg" },
  },
  {
    unitId: "UNIT-0002",
    dirPath: path.join(process.cwd(), "fixtures", "prep", "dev", "UNIT-0002"),
    files: { front: "front.jpeg", back: "back.jpeg", label: "label.jpeg" },
  },
  {
    unitId: "REAL-PACKAGE-001",
    dirPath: path.join(
      process.cwd(),
      "fixtures",
      "prep",
      "dev",
      "REAL-WORLD",
      "REAL-PACKAGE-001"
    ),
    files: { front: "front.jpeg", back: "back.jpeg", label: "label.jpeg" },
  },
  {
    unitId: "REAL-PHONE-001",
    dirPath: path.join(
      process.cwd(),
      "fixtures",
      "prep",
      "dev",
      "REAL-WORLD",
      "REAL-PHONE-001",
      "original"
    ),
    // UNTOUCHED ORIGINAL PHOTOS ONLY: genuine original camera photos
    files: { front: "front.jpeg", back: "back.jpeg", label: "label.jpeg" },
  },
];

async function main() {
  console.log("================================================================================");
  console.log("REAL-WORLD 4-UNIT EVALUATION — OBSERVE FIRST, DO NOT TUNE");
  console.log("================================================================================\n");

  const results: unknown[] = [];

  for (const config of REAL_UNITS) {
    console.log(`\n>>> EVALUATING UNIT: ${config.unitId} <<<`);

    // 1. Work Order Snapshot & Verification
    const workOrder = resolveWorkOrderForUnit(config.unitId);
    console.log("\n[1] WORK-ORDER SNAPSHOT:");
    console.log(JSON.stringify(workOrder, null, 2));

    // 2. Load untouched original photographs
    const prepImages: PrepUnitImageInput[] = [];
    const readinessSlots: Array<{
      slotId: "front" | "back" | "label";
      imageData: Buffer;
      mimeType: string;
    }> = [];

    for (const slot of ["front", "back", "label"] as const) {
      const fileName = config.files[slot];
      const filePath = path.join(config.dirPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const buffer = fs.readFileSync(filePath);
      prepImages.push({
        imageId: slot,
        mimeType: "image/jpeg",
        imageData: buffer,
      });
      readinessSlots.push({
        slotId: slot,
        imageData: buffer,
        mimeType: "image/jpeg",
      });
    }

    // 3. Evidence readiness
    const readiness = evaluateEvidenceReadiness({ slots: readinessSlots });
    console.log("\n[2] EVIDENCE READINESS:", readiness.status);
    console.log("Can inspect:", readiness.canInspect);
    console.log("Warnings:", readiness.warnings);

    // 4. Gemini structured observation
    console.log("\n[3] CALLING GEMINI VISION MODEL...");
    const visionStart = Date.now();
    const visionResult = await analyzePrepUnit(config.unitId, prepImages);
    const visionDuration = Date.now() - visionStart;
    console.log(`Gemini call completed in ${visionDuration}ms (attempts: ${visionResult.metadata.attemptCount})`);
    console.log("Observation:", JSON.stringify(visionResult.observation, null, 2));

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

    // 6. Operational status
    const operationalStatus = aggregateOperationalStatus(inspectionRecord);
    console.log("\n[4] OPERATIONAL STATUS:", operationalStatus.status);
    console.log(`Checks summary: PASS=${operationalStatus.passCount}, FAIL=${operationalStatus.failCount}, UNCERTAIN=${operationalStatus.uncertainCount}, NOT_APPLICABLE=${operationalStatus.notApplicableCount}`);

    console.log("\n[5] INDIVIDUAL COMPLIANCE CHECKS:");
    for (const check of inspectionRecord.checks) {
      const action = getDeterministicOperatorAction(check);
      const verdictStr = check.verdict ?? (check.applicability === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NONE");
      console.log(`  - ${check.checkType.padEnd(35)}: ${verdictStr.padEnd(15)} | ${check.explanation}`);
      if (action) {
        console.log(`    Action: ${action}`);
      }
    }

    // 7. Evidence recovery planning
    const recoveryPlan = planEvidenceRecovery({
      inspectionRecord,
      operationalStatus,
    });
    console.log("\n[6] RECOVERY PLAN:");
    console.log(`Requires evidence: ${recoveryPlan.requiresEvidence}`);
    console.log("Actions:", JSON.stringify(recoveryPlan.actions, null, 2));

    // 8. Operational routing decision
    const routingDecision = await defaultOperationalRouter.route({
      unitId: config.unitId,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
    });
    console.log("\n[7] FINAL ROUTING DECISION:", routingDecision);

    results.push({
      unitId: config.unitId,
      workOrder,
      readiness,
      observation: visionResult.observation,
      inspectionRecord,
      operationalStatus,
      recoveryPlan,
      routingDecision,
    });
  }

  // Save the full evaluation log artifact
  const outPath = path.join(process.cwd(), "real-4unit-evaluation-output.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n\nFull evaluation results saved to: ${outPath}`);
}

main().catch((err) => {
  console.error("FATAL ERROR in real 4-unit evaluation:", err);
  process.exit(1);
});
