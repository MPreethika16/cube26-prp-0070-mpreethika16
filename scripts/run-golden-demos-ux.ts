import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { loadDemoFixtureImages } from "../src/lib/inspection/demo-fixture-loader";
import { analyzePrepUnit, type PrepUnitImageInput } from "../src/lib/vision/analyze-prep-unit";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";
import { ACTIVE_RULES, PRODUCTION_POLICY_CONTEXT } from "../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../src/lib/inspection/operational-status";
import { planEvidenceRecovery } from "../src/lib/recovery/recovery-planner";
import { buildEnrichedCheck } from "../src/lib/inspection/inspection-view-model";
import { getOrderedOperatorProblems } from "../src/lib/inspection/operator-presentation";

interface DemoConfig {
  name: string;
  unitId: string;
  variant?: "default" | "closeup" | "corrected";
}

async function runSingleDemo(config: DemoConfig) {
  console.log(`\n======================================================================`);
  console.log(`RUNNING GOLDEN DEMO: ${config.name} (${config.unitId}, variant: ${config.variant ?? "default"}) WITH REAL GEMINI`);
  console.log(`======================================================================`);

  const fixture = loadDemoFixtureImages(config.unitId, { variant: config.variant });
  const images: PrepUnitImageInput[] = fixture.images.map((img) => ({
    imageId: img.imageId,
    mimeType: img.mimeType,
    imageData: img.dataUrl,
  }));

  const workOrder = resolveWorkOrderForUnit(config.unitId);
  const start = Date.now();
  console.log(`Calling Gemini vision API for ${images.length} images...`);
  const visionResult = await analyzePrepUnit(config.unitId, images);
  const duration = Date.now() - start;
  console.log(`Vision response received in ${duration} ms (model: ${visionResult.metadata.model})`);

  const record = runPrepInspection({
    observation: visionResult.observation,
    workOrder,
    rules: ACTIVE_RULES,
    policyContext: PRODUCTION_POLICY_CONTEXT,
    metadata: {
      inspectedAt: new Date().toISOString(),
      visionModel: visionResult.metadata.model,
      visionRequestCount: visionResult.metadata.requestCount,
    },
  });

  const operationalStatus = aggregateOperationalStatus(record);
  const recoveryPlan = planEvidenceRecovery({
    inspectionRecord: record,
    operationalStatus,
  });

  const enrichedChecks = record.checks.map((c) =>
    buildEnrichedCheck(c, workOrder, visionResult.observation, ACTIVE_RULES)
  );

  const operatorTasks = getOrderedOperatorProblems({
    enrichedChecks,
    workOrder,
    observation: visionResult.observation,
    recoveryPlan,
  });

  console.log(`\n[OPERATIONAL STATUS]: ${operationalStatus.status}`);
  console.log(`[PASS CHECKS]: ${operationalStatus.passCount}`);
  console.log(`[FAIL CHECKS]: ${operationalStatus.failCount}`);
  console.log(`[UNCERTAIN CHECKS]: ${operationalStatus.uncertainCount}`);
  console.log(`[TOTAL OPERATOR TASKS GENERATED]: ${operatorTasks.length}`);

  if (operatorTasks.length === 0) {
    console.log(`\n>>> NO OPERATOR PROBLEMS (Unit is ready to pack/ship - 0 tasks).`);
  } else {
    operatorTasks.forEach((task, index) => {
      console.log(`\n--- Task #${index + 1}: "${task.actionTitle}" ---`);
      console.log(`  - Headline:              ${task.headline}`);
      console.log(`  - Action Title:          ${task.actionTitle}`);
      console.log(`  - Human Status:          ${task.humanVerdictLabel}`);
      console.log(`  - Internal Verdict:      ${task.internalVerdict}`);
      console.log(`  - Derived Evidence Slot: ${task.evidenceSlot} (${task.evidenceSlotDisplay})`);
      console.log(`  - Observation:           ${task.humanObservation}`);
      console.log(`  - Resolves Checks (${task.resolvesCheckTypes.length}): ${task.resolvesCheckTypes.join(", ")}`);
      console.log(`  - Underlying Checks (${task.underlyingChecks.length}):`);
      task.underlyingChecks.forEach((uc) => {
        console.log(`      * [${uc.verdict}] ${uc.checkType}: ${uc.checkName} (${uc.policyRule})`);
        console.log(`        Observation: ${uc.aiObservation}`);
      });
      console.log(`  - Guidance Steps:`);
      task.whatToDoSteps.forEach((s) => console.log(`      1. ${s}`));
      if (task.photoRecoveryHints) {
        console.log(`  - Photo Recovery Hints:`);
        task.photoRecoveryHints.checklist.forEach((h) => console.log(`      * ${h}`));
      }
    });
  }

  return {
    config,
    operationalStatus: operationalStatus.status,
    operatorTasks,
    passCount: operationalStatus.passCount,
    failCount: operationalStatus.failCount,
    uncertainCount: operationalStatus.uncertainCount,
  };
}

async function main() {
  const demos: DemoConfig[] = [
    { name: "Sample A — Protein Snack (Straight-Through)", unitId: "SAMPLE-01", variant: "default" },
    { name: "Sample B — Tech Pouch (Before Fix: Exposed Barcode)", unitId: "SAMPLE-02", variant: "default" },
    { name: "Sample B — Tech Pouch (After Fix: Corrected Back Photo)", unitId: "SAMPLE-02", variant: "corrected" },
    { name: "Sample C — Organic Tea (Initial: Blurry Expiry)", unitId: "SAMPLE-03", variant: "default" },
    { name: "Sample C — Organic Tea (Recovery: Macro Close-up Expiry)", unitId: "SAMPLE-03", variant: "closeup" },
  ];

  const results = [];
  for (const demo of demos) {
    const res = await runSingleDemo(demo);
    results.push(res);
  }

  console.log(`\n======================================================================`);
  console.log(`SUMMARY OF ALL GOLDEN DEMOS WITH REAL GEMINI`);
  console.log(`======================================================================`);
  for (const res of results) {
    console.log(`\n• ${res.config.name}:`);
    console.log(`    Unit ID: ${res.config.unitId} (variant: ${res.config.variant})`);
    console.log(`    Status: ${res.operationalStatus} (PASS: ${res.passCount}, FAIL: ${res.failCount}, UNCERTAIN: ${res.uncertainCount})`);
    console.log(`    Operator Tasks (${res.operatorTasks.length}):`);
    if (res.operatorTasks.length === 0) {
      console.log(`      [None - Unit is READY / DONE]`);
    } else {
      res.operatorTasks.forEach((t, i) => {
        console.log(`      ${i + 1}. [${t.internalVerdict}] "${t.actionTitle}" (${t.headline}) - Slot: ${t.evidenceSlotDisplay}`);
        console.log(`         Observation: ${t.humanObservation}`);
      });
    }
  }
  console.log(`\n======================================================================\n`);
}

main().catch((err) => {
  console.error("Fatal error executing golden demos:", err);
  process.exit(1);
});
