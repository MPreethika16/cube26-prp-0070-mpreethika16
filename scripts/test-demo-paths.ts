import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { loadDemoFixtureImages } from "../src/lib/inspection/demo-fixture-loader";
import { analyzePrepUnit, type PrepUnitImageInput } from "../src/lib/vision/analyze-prep-unit";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";
import { ACTIVE_RULES, PRODUCTION_POLICY_CONTEXT } from "../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../src/lib/recovery/recovery-planner";
import { defaultOperationalRouter } from "../src/lib/recovery/operational-router";

async function runDemoPath(unitId: string, options?: { variant?: "default" | "closeup" }) {
  console.log(`\n============================================================`);
  console.log(`RUNNING DEMO PATH FOR: ${unitId} (variant: ${options?.variant || "default"})`);
  console.log(`============================================================`);

  const fixture = loadDemoFixtureImages(unitId, options);
  const images: PrepUnitImageInput[] = fixture.images.map((img) => ({
    imageId: img.imageId,
    mimeType: img.mimeType,
    imageData: img.dataUrl,
  }));

  const workOrder = resolveWorkOrderForUnit(unitId);
  const start = Date.now();
  const visionResult = await analyzePrepUnit(unitId, images);
  const visionLatency = Date.now() - start;

  const record = runPrepInspection({
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

  const operationalStatus = aggregateOperationalStatus(record);
  const recoveryPlan = planEvidenceRecovery({
    inspectionRecord: record,
    operationalStatus,
  });

  const routingDecision = await defaultOperationalRouter.route({
    unitId,
    inspectionRecord: record,
    operationalStatus,
    recoveryPlan,
  });

  console.log("VISION OBSERVATION:", JSON.stringify({
    fnsku: visionResult.observation.fnsku,
    manufacturerBarcode: visionResult.observation.manufacturerBarcode,
    manufacturerBarcodeCoverage: visionResult.observation.manufacturerBarcodeCoverage,
    expiryDate: visionResult.observation.expiryDate,
  }, null, 2));

  console.log("OPERATIONAL STATUS:", operationalStatus.status);
  console.log("ROUTING DECISION:", routingDecision);
  console.log("PASS:", operationalStatus.passCount, "FAIL:", operationalStatus.failCount, "UNCERTAIN:", operationalStatus.uncertainCount);
  console.log("LATENCY: vision:", visionLatency, "ms (preprocessing:", visionResult.metadata.preprocessingMs, "ms)");

  return {
    unitId,
    operationalStatus: operationalStatus.status,
    routingDecision,
    visionResult,
    record,
    recoveryPlan,
  };
}

async function main() {
  // Demo A: Visible Defect (UNIT-0001)
  const demoA = await runDemoPath("UNIT-0001");

  // Demo C: Fully Compliant Unit (DEMO-COMPLIANT)
  const demoC = await runDemoPath("DEMO-COMPLIANT");

  // Demo B: Recovery Flow (DEMO-RECOVERY)
  console.log("\n--- DEMO B: PASS 1 (Blurry Expiry) ---");
  const demoB_pass1 = await runDemoPath("DEMO-RECOVERY", { variant: "default" });

  console.log("\n--- DEMO B: PASS 2 (Targeted Macro Close-up) ---");
  const demoB_pass2 = await runDemoPath("DEMO-RECOVERY", { variant: "closeup" });

  console.log("\n============================================================");
  console.log("ALL DEMO PATHS COMPLETE");
  console.log("Demo A status:", demoA.operationalStatus, "->", demoA.routingDecision);
  console.log("Demo C status:", demoC.operationalStatus, "->", demoC.routingDecision);
  console.log("Demo B Pass 1:", demoB_pass1.operationalStatus, "Recovery actions:", demoB_pass1.recoveryPlan.actions.length);
  console.log("Demo B Pass 2:", demoB_pass2.operationalStatus, "->", demoB_pass2.routingDecision);
  console.log("============================================================");
}

main().catch((err) => {
  console.error("Demo run error:", err);
  process.exit(1);
});
