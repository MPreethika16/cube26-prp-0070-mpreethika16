import * as fs from "fs";
import * as path from "path";
import type { PrepUnitImageInput } from "./analyze-prep-unit";

/**
 * Loads the 3 physical fixture images for a given unit.
 */
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
