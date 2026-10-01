import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { analyzePrepUnit, type PrepUnitImageInput } from "../src/lib/vision/analyze-prep-unit";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../src/lib/inspection/operational-status";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../src/lib/compliance/rules/active-rules";

// Helper to generate barcode SVG
function generateBarcodeSvg(x: number, y: number, width: number, height: number, codeText: string): string {
  const bars: string[] = [];
  let curX = x;
  const pattern = [2, 1, 3, 1, 2, 2, 1, 4, 1, 1, 3, 2, 1, 2, 2, 3, 1, 1, 2, 4, 1, 2, 3, 1, 1, 3, 2, 2, 1, 1, 4, 2, 1, 1, 2, 3, 1, 2, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1];
  for (let i = 0; i < pattern.length; i++) {
    const barW = pattern[i] * 3;
    if (i % 2 === 0) {
      bars.push(`<rect x="${curX}" y="${y}" width="${barW}" height="${height}" fill="#000000" />`);
    }
    curX += barW;
  }
  const textX = x + (curX - x) / 2;
  return `
    <g id="barcode-group">
      ${bars.join("\n")}
      <text x="${textX}" y="${y + height + 36}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#000000">${codeText}</text>
    </g>
  `;
}

async function createTestLabelImage(outputPath: string): Promise<Buffer> {
  const barcodeSvg = generateBarcodeSvg(180, 480, 600, 240, "X00REALPHN01");
  const svg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="80" y="100" width="800" height="1080" rx="16" fill="#ffffff" stroke="#18181b" stroke-width="4" />
      <text x="480" y="260" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="bold" fill="#000000" text-anchor="middle">TEST FNSKU</text>
      <text x="480" y="340" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#3f3f46" text-anchor="middle">Infinix Smart 8 (Timber Black, 64 GB)</text>
      <line x1="120" y1="400" x2="840" y2="400" stroke="#d4d4d8" stroke-width="2" />
      ${barcodeSvg}
      <text x="480" y="880" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#52525b" text-anchor="middle">Condition: New</text>
      <text x="480" y="940" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#71717a" text-anchor="middle">FBA Amazon Inbound Label</text>
    </svg>
  `;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(outputPath, buf);
  return buf;
}

async function main() {
  console.log("=== REAL EVIDENCE RETEST: REAL-PHONE-001 ===");

  const fixturesDir = path.join(process.cwd(), "fixtures", "prep", "dev", "REAL-WORLD", "REAL-PHONE-001");
  const frontBuf = fs.readFileSync(path.join(fixturesDir, "front.jpeg"));
  const backBuf = fs.readFileSync(path.join(fixturesDir, "back.jpeg"));

  const testLabelPath = path.join(fixturesDir, "test_label_x00realphn01.jpeg");
  const labelBuf = await createTestLabelImage(testLabelPath);

  const workOrder = resolveWorkOrderForUnit("REAL-PHONE-001");
  console.log("\nLoaded Work Order for REAL-PHONE-001:");
  console.log(JSON.stringify(workOrder, null, 2));

  const prepImages: PrepUnitImageInput[] = [
    { imageId: "front", mimeType: "image/jpeg", imageData: frontBuf },
    { imageId: "back", mimeType: "image/jpeg", imageData: backBuf },
    { imageId: "label", mimeType: "image/jpeg", imageData: labelBuf },
  ];

  console.log("\nCalling analyzePrepUnit with Gemini...");
  const visionResult = await analyzePrepUnit("REAL-PHONE-001", prepImages);

  console.log("\n--- RAW STRUCTURED VISION OBSERVATION ---");
  console.log(JSON.stringify(visionResult.observation, null, 2));

  console.log("\nRunning deterministic compliance inspection...");
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

  const operationalStatus = aggregateOperationalStatus(inspectionRecord);

  console.log("\n--- INDIVIDUAL COMPLIANCE CHECKS ---");
  for (const check of inspectionRecord.checks) {
    console.log(`[${check.checkType}] ${check.verdict} (${check.applicability}) - ${check.explanation}`);
  }

  const fnskuCheck = inspectionRecord.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
  console.log("\n==================================================");
  console.log(`FNSKU_IDENTITY: ${fnskuCheck?.verdict}`);
  console.log(`Explanation: ${fnskuCheck?.explanation}`);
  console.log(`Overall Operational Status: ${operationalStatus.status}`);
  console.log(`Blocking checks: ${operationalStatus.blockingCheckTypes.join(", ") || "none"}`);
  console.log(`Uncertain checks: ${operationalStatus.uncertainCheckTypes.join(", ") || "none"}`);
  console.log("==================================================");

  // Clean up temporary test label image
  if (fs.existsSync(testLabelPath)) {
    fs.unlinkSync(testLabelPath);
  }
}

main().catch((err) => {
  console.error("Retest failed:", err);
  process.exit(1);
});
