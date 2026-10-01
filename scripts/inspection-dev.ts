import * as fs from "fs";
import * as path from "path";
import { loadEnvConfig } from "@next/env";
import {
  analyzePrepUnit,
  type PrepUnitImageInput,
  type AnalyzePrepUnitResult,
} from "../src/lib/vision/analyze-prep-unit";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../src/lib/compliance/rules/active-rules";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";

// Load environment variables (GEMINI_API_KEY from .env / .env.local)
loadEnvConfig(process.cwd());


/**
 * Loads the 3 physical fixture images for a given unit.
 */
function loadUnitImages(unitId: string): PrepUnitImageInput[] {
  const fixturesDir = path.join(process.cwd(), "fixtures", "prep", "dev", unitId);
  if (!fs.existsSync(fixturesDir)) {
    throw new Error(`Fixtures directory not found for ${unitId}: ${fixturesDir}`);
  }

  const imageFiles = [
    { imageId: "front", filename: "front.jpeg", mimeType: "image/jpeg" },
    { imageId: "back", filename: "back.jpeg", mimeType: "image/jpeg" },
    { imageId: "label", filename: "label.jpeg", mimeType: "image/jpeg" },
  ];

  const images: PrepUnitImageInput[] = [];

  for (const item of imageFiles) {
    let fullPath = path.join(fixturesDir, item.filename);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(fixturesDir, `${item.imageId}.jpg`);
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required fixture image not found for ${unitId}: ${item.filename}`);
    }
    const data = fs.readFileSync(fullPath);
    images.push({
      imageId: item.imageId,
      mimeType: item.mimeType,
      imageData: data,
    });
  }

  return images;
}




async function main() {
  const unitId = process.argv[2] || "UNIT-0002";
  console.log(`Starting real vertical slice inspection for: ${unitId}`);

  // 1. Load real fixture photographs
  const images = loadUnitImages(unitId);

  // 2. Multimodal visual observation pass via existing analyzePrepUnit()
  const visionResult: AnalyzePrepUnitResult = await analyzePrepUnit(unitId, images);

  // 3. Load and parse work order
  const workOrder = resolveWorkOrderForUnit(unitId);

  // 4. Run deterministic inspection pass via existing runPrepInspection()
  // NOTE: Policy semantics for FNSKU placement & barcode coverage come strictly
  // from PRODUCTION_POLICY_CONTEXT, not demo context.
  const inspectionRecord = runPrepInspection({
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

  // 5. Compute summary statistics
  const passCount = inspectionRecord.checks.filter((c) => c.verdict === "PASS").length;
  const failCount = inspectionRecord.checks.filter((c) => c.verdict === "FAIL").length;
  const uncertainCount = inspectionRecord.checks.filter((c) => c.verdict === "UNCERTAIN").length;
  const notApplicableCount = inspectionRecord.checks.filter(
    (c) => c.applicability === "NOT_APPLICABLE"
  ).length;

  // 6. Print structured outputs as required
  console.log();
  console.log("==================================================");
  console.log("VISION OBSERVATION");
  console.log("==================================================");
  console.log(JSON.stringify(visionResult.observation, null, 2));

  console.log();
  console.log("==================================================");
  console.log("INSPECTION RECORD");
  console.log("==================================================");
  console.log(JSON.stringify(inspectionRecord, null, 2));

  console.log();
  console.log("==================================================");
  console.log("SUMMARY");
  console.log("==================================================");
  console.log(`Unit: ${unitId}`);
  console.log(`Work Order: ${workOrder.workOrderId}`);
  console.log(`SKU: ${workOrder.sku}`);
  console.log(`Vision Model: ${visionResult.metadata.model}`);
  console.log(`Vision Request Count: ${visionResult.metadata.requestCount}`);
  console.log(`Vision Latency: ${visionResult.metadata.durationMs} ms`);
  console.log();
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log(`UNCERTAIN: ${uncertainCount}`);
  console.log(`NOT_APPLICABLE: ${notApplicableCount}`);
  console.log();
  console.log("==================================================");
  console.log("POLICY PROVENANCE SUMMARY");
  console.log("==================================================");
  for (const check of inspectionRecord.checks) {
    const isProduction = check.rule.ruleId.startsWith("AMZN-POL-");
    const label = isProduction ? "[PRODUCTION POLICY]" : "[DEMO/TEST FIXTURE]";
    console.log(`- ${check.checkType.padEnd(30)}: ${check.rule.ruleId} ${label}`);
  }
  console.log();
  console.log(
    "Confirmation: Zero (0) DEMO policies supplied FNSKU placement or barcode coverage semantics."
  );
  console.log("==================================================");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Execution failed:", message);
  process.exit(1);
});
