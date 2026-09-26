import * as fs from "fs";
import * as path from "path";
import { loadEnvConfig } from "@next/env";
import {
  analyzePrepUnit,
  type PrepUnitImageInput,
  type AnalyzePrepUnitResult,
} from "../src/lib/vision/analyze-prep-unit";

// Ensure environment variables from .env.local / .env are loaded
loadEnvConfig(process.cwd());

export function loadUnitImages(unitId: string): PrepUnitImageInput[] {
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
    const fullPath = path.join(fixturesDir, item.filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required fixture image not found: ${fullPath}`);
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

export async function runUnit(unitId: string): Promise<AnalyzePrepUnitResult> {
  const images = loadUnitImages(unitId);
  const result = await analyzePrepUnit(unitId, images);

  // Print ONLY the validated structured observation JSON plus minimal latency/model metadata.
  console.log(JSON.stringify(result.observation, null, 2));
  console.log();
  console.log(`Model: ${result.metadata.model}`);
  console.log(`Latency: ${result.metadata.durationMs} ms`);
  console.log(`Batch Request Count: ${result.metadata.requestCount}`);

  return result;
}

async function main() {
  const arg = process.argv[2] || "UNIT-0001";

  if (arg.toUpperCase() === "ALL") {
    const units = ["UNIT-0001", "UNIT-0002", "UNIT-0003"];
    for (const u of units) {
      console.log(`=== ${u} ===`);
      await runUnit(u);
      console.log();
    }
  } else {
    await runUnit(arg);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Vision observation failed:", message);
  process.exit(1);
});
