import * as fs from "fs";
import * as path from "path";
import { loadEnvConfig } from "@next/env";
import {
  analyzePrepUnit,
  type PrepUnitImageInput,
} from "../src/lib/vision/analyze-prep-unit";
import { runPrepInspection } from "../src/lib/inspection/run-prep-inspection";
import { aggregateOperationalStatus } from "../src/lib/inspection/operational-status";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../src/lib/compliance/rules/active-rules";
import { resolveWorkOrderForUnit } from "../src/lib/inspection/work-order-resolver";
import type { PrepUnitObservation } from "../src/lib/vision/prep-observation.schema";

loadEnvConfig(process.cwd());

interface SingleRunResult {
  runIndex: number;
  durationMs: number;
  observation: PrepUnitObservation | null;
  parseSuccess: boolean;
  fnskuVisibility: string;
  fnskuLegibility: string;
  fnskuValueCompleteness?: string;
  fnskuDetectedValue: string | null;
  imageQualityOverall: string;
  imageQualityIssues: string[];
  downstreamCheckVerdict: string;
  downstreamReasonCode: string;
  operationalStatus: string;
  isFalsePass: boolean;
  isUnsafeConfident: boolean;
  error?: string;
}

interface ScenarioReport {
  scenarioId: string;
  name: string;
  description: string;
  featureChallenged: string;
  expectedLegibility: string;
  expectedValue: string | null;
  runs: SingleRunResult[];
  repeatability: {
    exactAgreement: boolean;
    visibilityAgreement: boolean;
    legibilityAgreement: boolean;
    detectedValueAgreement: boolean;
    unsafeConfidentCount: number;
  };
}

const STRESS_DIR = path.join(process.cwd(), "fixtures", "prep", "stress_test");
const DEV_DIR = path.join(process.cwd(), "fixtures", "prep", "dev");

const TEST_SCENARIOS = [
  {
    id: "CONTROL-CLEAN",
    name: "Clean Control (Unaltered Baseline)",
    dir: path.join(DEV_DIR, "DEMO-COMPLIANT"),
    featureChallenged: "Clean baseline FNSKU label and packaging",
    expectedLegibility: "LEGIBLE",
    expectedValue: "X00DUMMY001",
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-01-MODERATE-BLUR",
    name: "Moderate Optical Blur (sigma=5)",
    dir: path.join(STRESS_DIR, "STRESS-01-MODERATE-BLUR"),
    featureChallenged: "FNSKU legibility under motion blur",
    expectedLegibility: "ILLEGIBLE_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-02-SEVERE-BLUR",
    name: "Severe Out-of-Focus Blur (sigma=18)",
    dir: path.join(STRESS_DIR, "STRESS-02-SEVERE-BLUR"),
    featureChallenged: "FNSKU legibility under severe defocus (must not guess text)",
    expectedLegibility: "ILLEGIBLE_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-03-PARTIAL-CROP",
    name: "Partial Horizontal Crop (45% clipped)",
    dir: path.join(STRESS_DIR, "STRESS-03-PARTIAL-CROP"),
    featureChallenged: "FNSKU barcode and text completeness (must not hallucinate truncated characters)",
    expectedLegibility: "ILLEGIBLE_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-04-GLARE-OCCLUSION",
    name: "Specular Glare Occlusion",
    dir: path.join(STRESS_DIR, "STRESS-04-GLARE-OCCLUSION"),
    featureChallenged: "FNSKU barcode decode under reflective glare (must not reconstruct hidden bars)",
    expectedLegibility: "ILLEGIBLE_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-05-LOW-CONTRAST",
    name: "Severe Low Contrast & Washout",
    dir: path.join(STRESS_DIR, "STRESS-05-LOW-CONTRAST"),
    featureChallenged: "Barcode and label detection under extreme underexposure/washout",
    expectedLegibility: "ILLEGIBLE_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
  {
    id: "STRESS-06-PARTIAL-LABEL",
    name: "Corner View Only (Partial Label)",
    dir: path.join(STRESS_DIR, "STRESS-06-PARTIAL-LABEL"),
    featureChallenged: "Missing label view (must not claim absence of label on product)",
    expectedLegibility: "NOT_DETECTED_OR_UNCERTAIN",
    expectedValue: null,
    workOrderUnit: "DEMO-COMPLIANT",
  },
];

function loadImages(dirPath: string): PrepUnitImageInput[] {
  const imageFiles = [
    { imageId: "front", filename: "front.jpeg", mimeType: "image/jpeg" },
    { imageId: "back", filename: "back.jpeg", mimeType: "image/jpeg" },
    { imageId: "label", filename: "label.jpeg", mimeType: "image/jpeg" },
  ];

  return imageFiles.map((f) => ({
    imageId: f.imageId,
    mimeType: f.mimeType,
    imageData: fs.readFileSync(path.join(dirPath, f.filename)),
  }));
}

async function runStressSuite() {
  console.log("==================================================");
  console.log("STARTING REAL GEMINI PERCEPTION STRESS TEST SUITE");
  console.log("Model:", process.env.GEMINI_MODEL || "gemini-3.5-flash-lite");
  console.log("Scenarios:", TEST_SCENARIOS.length);
  console.log("Runs per scenario: 3");
  console.log("Total Gemini calls planned:", TEST_SCENARIOS.length * 3);
  console.log("==================================================\n");

  const filterId = process.argv[2];
  const scenariosToRun = filterId
    ? TEST_SCENARIOS.filter((s) => s.id === filterId || s.id.includes(filterId))
    : TEST_SCENARIOS;

  const outputPath = path.join(process.cwd(), "stress-test-results.json");
  let existingReports: ScenarioReport[] = [];
  if (fs.existsSync(outputPath)) {
    try {
      existingReports = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch {
      existingReports = [];
    }
  }

  const reports: ScenarioReport[] = [...existingReports];

  for (const scenario of scenariosToRun) {
    console.log(`\n>>> Testing [REAL_GEMINI]: ${scenario.id} (${scenario.name})`);
    const images = loadImages(scenario.dir);
    const workOrder = resolveWorkOrderForUnit(scenario.workOrderUnit);

    const singleRuns: SingleRunResult[] = [];

    for (let runIdx = 1; runIdx <= 3; runIdx++) {
      process.stdout.write(`  Run ${runIdx}/3 ... `);
      try {
        const result = await analyzePrepUnit("DEMO-COMPLIANT", images);
        const obs = result.observation;

        // Downstream inspection pass
        const inspection = runPrepInspection({
          observation: obs,
          workOrder,
          rules: ACTIVE_RULES,
          policyContext: PRODUCTION_POLICY_CONTEXT,
        });

        const fnskuCheck = inspection.checks.find(
          (c) => c.checkType === "FNSKU_IDENTITY"
        );
        const opStatus = aggregateOperationalStatus(inspection);

        // Check for unsafe confident claim
        // An unsafe confident claim occurs on degraded images if the model claims LEGIBLE and outputs a confident string when the image was degraded
        const isDegradedScenario = scenario.id !== "CONTROL-CLEAN";
        const isUnsafeConfident =
          isDegradedScenario &&
          obs.fnsku.legibility === "LEGIBLE" &&
          obs.fnsku.detectedValue !== null &&
          (scenario.id === "STRESS-02-SEVERE-BLUR" ||
            scenario.id === "STRESS-03-PARTIAL-CROP" ||
            scenario.id === "STRESS-06-PARTIAL-LABEL");

        // False PASS check:
        // A false PASS occurs if degraded evidence produced PASS on a check whose feature was degraded/unverifiable
        const isFalsePass =
          isDegradedScenario && fnskuCheck?.verdict === "PASS";

        const runRes: SingleRunResult = {
          runIndex: runIdx,
          durationMs: result.metadata.durationMs,
          observation: obs,
          parseSuccess: true,
          fnskuVisibility: obs.fnsku.visibility,
          fnskuLegibility: obs.fnsku.legibility,
          fnskuValueCompleteness: obs.fnsku.valueCompleteness ?? "MISSING",
          fnskuDetectedValue: obs.fnsku.detectedValue,
          imageQualityOverall: obs.imageQuality.overall,
          imageQualityIssues: obs.imageQuality.issues,
          downstreamCheckVerdict: fnskuCheck?.verdict ?? "NONE",
          downstreamReasonCode: fnskuCheck?.reasonCode ?? "NONE",
          operationalStatus: opStatus.status,
          isFalsePass,
          isUnsafeConfident,
        };

        singleRuns.push(runRes);
        console.log(
          `DONE in ${result.metadata.durationMs}ms | FNSKU: ${obs.fnsku.visibility}/${obs.fnsku.legibility}/${obs.fnsku.valueCompleteness ?? "NONE"} ("${obs.fnsku.detectedValue}") | Quality: ${obs.imageQuality.overall} | Verdict: ${fnskuCheck?.verdict} | Status: ${opStatus.status}`
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED with error: ${errorMsg}`);
        singleRuns.push({
          runIndex: runIdx,
          durationMs: 0,
          observation: null,
          parseSuccess: false,
          fnskuVisibility: "ERROR",
          fnskuLegibility: "ERROR",
          fnskuValueCompleteness: "ERROR",
          fnskuDetectedValue: null,
          imageQualityOverall: "ERROR",
          imageQualityIssues: [],
          downstreamCheckVerdict: "ERROR",
          downstreamReasonCode: "ERROR",
          operationalStatus: "ERROR",
          isFalsePass: false,
          isUnsafeConfident: false,
          error: errorMsg,
        });
      }

      // Small delay between calls to avoid harsh rate limiting
      await new Promise((r) => setTimeout(r, 600));
    }

    // Repeatability analysis
    const v0 = singleRuns[0]?.fnskuVisibility;
    const l0 = singleRuns[0]?.fnskuLegibility;
    const val0 = singleRuns[0]?.fnskuDetectedValue;

    const visibilityAgreement = singleRuns.every((r) => r.fnskuVisibility === v0);
    const legibilityAgreement = singleRuns.every((r) => r.fnskuLegibility === l0);
    const detectedValueAgreement = singleRuns.every(
      (r) => r.fnskuDetectedValue === val0
    );
    const exactAgreement =
      visibilityAgreement && legibilityAgreement && detectedValueAgreement;
    const unsafeConfidentCount = singleRuns.filter(
      (r) => r.isUnsafeConfident
    ).length;

    const newReport: ScenarioReport = {
      scenarioId: scenario.id,
      name: scenario.name,
      description: scenario.featureChallenged,
      featureChallenged: scenario.featureChallenged,
      expectedLegibility: scenario.expectedLegibility,
      expectedValue: scenario.expectedValue,
      runs: singleRuns,
      repeatability: {
        exactAgreement,
        visibilityAgreement,
        legibilityAgreement,
        detectedValueAgreement,
        unsafeConfidentCount,
      },
    };

    const existingIdx = reports.findIndex((r) => r.scenarioId === scenario.id);
    if (existingIdx >= 0) {
      reports[existingIdx] = newReport;
    } else {
      reports.push(newReport);
    }
  }

  // Save report to disk
  fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2));
  console.log("\n==================================================");
  console.log(`STRESS TEST SUITE COMPLETE. Output saved to: ${outputPath}`);
  console.log("==================================================");
}

runStressSuite().catch((e) => {
  console.error("Fatal suite failure:", e);
  process.exit(1);
});
