import * as fs from "fs";
import * as path from "path";

/**
 * ============================================================================
 * DEMO FIXTURE LOADER
 * ============================================================================
 *
 * Dedicated helper to load physical photographs for development/demo units
 * (UNIT-0001, UNIT-0002) from fixtures/prep/dev.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Does NOT hardcode or mock inspection results.
 * - Sourced strictly from real development test fixture files on disk.
 * - Used exclusively to populate UI image slots for demo workflow convenience.
 * ============================================================================
 */

export interface DemoFixtureSlot {
  imageId: "front" | "back" | "label";
  filename: string;
  mimeType: string;
  dataUrl: string;
}

export interface DemoFixtureUnitPayload {
  unitId: string;
  images: DemoFixtureSlot[];
}

export const SAMPLE_UNIT_ALIASES: Record<string, string> = {
  "SAMPLE-01": "DEMO-COMPLIANT",
  "SAMPLE-02": "DEMO-DEFECT",
  "SAMPLE-03": "DEMO-RECOVERY",
  "REAL-PACKAGE-001": path.join("REAL-WORLD", "REAL-PACKAGE-001"),
  "REAL-PHONE-001": path.join("REAL-WORLD", "REAL-PHONE-001"),
};

const SUPPORTED_DEMO_UNITS = [
  "UNIT-0001",
  "UNIT-0002",
  "DEMO-COMPLIANT",
  "DEMO-DEFECT",
  "DEMO-RECOVERY",
  "SAMPLE-01",
  "SAMPLE-02",
  "SAMPLE-03",
  "REAL-PACKAGE-001",
  "REAL-PHONE-001",
] as const;

export function isSupportedDemoUnit(
  unitId: string
): unitId is (typeof SUPPORTED_DEMO_UNITS)[number] {
  return SUPPORTED_DEMO_UNITS.includes(
    unitId as (typeof SUPPORTED_DEMO_UNITS)[number]
  );
}

export interface LoadDemoFixtureOptions {
  variant?: "default" | "closeup" | "corrected";
}

/**
 * Loads the 3 physical fixture images (front, back, label) for a demo unit.
 */
export function loadDemoFixtureImages(
  unitId: string,
  options?: LoadDemoFixtureOptions
): DemoFixtureUnitPayload {
  const normalizedId = unitId.trim();
  const dirName = SAMPLE_UNIT_ALIASES[normalizedId] || normalizedId;
  const fixturesDir = path.join(
    process.cwd(),
    "fixtures",
    "prep",
    "dev",
    dirName
  );

  if (!fs.existsSync(fixturesDir)) {
    throw new Error(
      `Demo fixture directory not found for ${normalizedId} (mapped to ${dirName}): ${fixturesDir}`
    );
  }

  const isCloseup = options?.variant === "closeup";
  const isCorrected = options?.variant === "corrected";
  const slots: Array<{
    imageId: "front" | "back" | "label";
    possibleFilenames: string[];
  }> = [
    { imageId: "front", possibleFilenames: ["front.jpeg", "front.jpg"] },
    {
      imageId: "back",
      possibleFilenames: isCorrected
        ? ["back_corrected.jpeg", "back_corrected.jpg", "back.jpeg", "back.jpg"]
        : isCloseup
        ? ["back_closeup.jpeg", "back_closeup.jpg", "back.jpeg", "back.jpg"]
        : ["back.jpeg", "back.jpg"],
    },
    { imageId: "label", possibleFilenames: ["label.jpeg", "label.jpg"] },
  ];

  const images: DemoFixtureSlot[] = [];

  for (const slot of slots) {
    let matchedPath: string | null = null;
    let matchedFilename: string | null = null;

    for (const fn of slot.possibleFilenames) {
      const fullPath = path.join(fixturesDir, fn);
      if (fs.existsSync(fullPath)) {
        matchedPath = fullPath;
        matchedFilename = fn;
        break;
      }
    }

    if (!matchedPath || !matchedFilename) {
      throw new Error(
        `Fixture view '${slot.imageId}' not found in ${fixturesDir}`
      );
    }

    const fileBuf = fs.readFileSync(matchedPath);
    const mimeType = "image/jpeg";
    const base64 = fileBuf.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    images.push({
      imageId: slot.imageId,
      filename: matchedFilename,
      mimeType,
      dataUrl,
    });
  }

  return {
    unitId: normalizedId,
    images,
  };
}

/**
 * Loads a single fixture image (e.g. for targeted recovery close-up injection).
 */
export function loadDemoFixtureSlot(
  unitId: string,
  slotId: "front" | "back" | "label",
  variant: "default" | "closeup" | "corrected" = "default"
): DemoFixtureSlot {
  const normalizedId = unitId.trim();
  const dirName = SAMPLE_UNIT_ALIASES[normalizedId] || normalizedId;
  const fixturesDir = path.join(
    process.cwd(),
    "fixtures",
    "prep",
    "dev",
    dirName
  );

  const possibleFilenames =
    variant === "corrected" && slotId === "back"
      ? ["back_corrected.jpeg", "back_corrected.jpg", "back.jpeg", "back.jpg"]
      : variant === "closeup" && slotId === "back"
      ? ["back_closeup.jpeg", "back_closeup.jpg", "back.jpeg", "back.jpg"]
      : [`${slotId}.jpeg`, `${slotId}.jpg`];

  let matchedPath: string | null = null;
  let matchedFilename: string | null = null;

  for (const fn of possibleFilenames) {
    const fullPath = path.join(fixturesDir, fn);
    if (fs.existsSync(fullPath)) {
      matchedPath = fullPath;
      matchedFilename = fn;
      break;
    }
  }

  if (!matchedPath || !matchedFilename) {
    throw new Error(
      `Fixture slot '${slotId}' (variant: ${variant}) not found in ${fixturesDir}`
    );
  }

  const fileBuf = fs.readFileSync(matchedPath);
  const mimeType = "image/jpeg";
  const base64 = fileBuf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    imageId: slotId,
    filename: matchedFilename,
    mimeType,
    dataUrl,
  };
}
