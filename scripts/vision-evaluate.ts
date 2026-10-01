import { loadEnvConfig } from "@next/env";
import { runVisionEvaluation } from "../src/lib/vision/evaluation/run-vision-evaluation";
import { FIXTURE_VISION_GROUND_TRUTH } from "../src/lib/vision/evaluation/vision-ground-truth-dataset";

// Ensure environment variables from .env.local / .env are loaded
loadEnvConfig(process.cwd());

/**
 * ============================================================================
 * VISION OBSERVATION EVALUATION CLI (DAY 3 / STEP 5)
 * ============================================================================
 *
 * Runs perception evaluation comparing Gemini multimodal output against
 * manually verified fixture ground-truth without running compliance evaluators.
 *
 * Usage:
 *   npm run vision:evaluate -- --runs 1
 *   npm run vision:evaluate -- --runs 3
 * ============================================================================
 */
async function main() {
  const args = process.argv.slice(2);
  let runs = 1;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--runs" || args[i] === "-r") && args[i + 1]) {
      runs = parseInt(args[i + 1], 10);
    } else if (args[i].startsWith("--runs=")) {
      runs = parseInt(args[i].split("=")[1], 10);
    } else if (i === 0 && !isNaN(parseInt(args[0], 10))) {
      runs = parseInt(args[0], 10);
    }
  }
  if (isNaN(runs) || runs < 1) runs = 1;

  console.log("==================================================");
  console.log("PREP MANAGER — VISION OBSERVATION EVALUATION");
  console.log("==================================================");
  console.log(`Runs: ${runs}`);
  console.log(`Evaluated Fixtures: UNIT-0001, UNIT-0002`);
  console.log();

  console.log("0. GROUND-TRUTH LABELS USED (MANUALLY VERIFIED VISUAL FACTS)");
  console.log("-".repeat(70));
  for (const [unitId, gt] of Object.entries(FIXTURE_VISION_GROUND_TRUTH)) {
    console.log(`Unit: ${unitId} — ${gt.description}`);
    console.log(`  - manufacturerBarcode: visibility=${gt.manufacturerBarcode.visibility}, legibility=${gt.manufacturerBarcode.legibility}, value="${gt.manufacturerBarcode.detectedValue}"`);
    console.log(`  - expiryDate:          visibility=${gt.expiryDate.visibility}, legibility=${gt.expiryDate.legibility}, value=${gt.expiryDate.detectedValue ? `"${gt.expiryDate.detectedValue}"` : "null"}`);
    console.log(`  - fnsku:               visibility=${gt.fnsku.visibility}, legibility=${gt.fnsku.legibility}, value=${gt.fnsku.detectedValue}, placement=${gt.fnsku.placement}`);
    console.log(`  - polybag:             visibility=${gt.polybag.visibility}, sealStatus=${gt.polybag.sealStatus}`);
    console.log(`  - suffocationWarning:  visibility=${gt.suffocationWarning.visibility}, legibility=${gt.suffocationWarning.legibility}`);
    console.log(`  - handlingMarks:       visibility=${gt.handlingMarks.visibility}`);
    console.log();
  }
  console.log("-".repeat(70));
  console.log();

  const report = await runVisionEvaluation({ runs });

  const pct = (n: number) => (n * 100).toFixed(1) + "%";

  for (const run of report.runs) {
    console.log("==================================================");
    console.log(`RUN ${run.runIndex} OF ${report.totalRuns}`);
    console.log("==================================================");
    console.log(`Run Latency: ${run.totalLatencyMs} ms (avg: ${Math.round(run.averageLatencyMs)} ms, min: ${run.minLatencyMs} ms, max: ${run.maxLatencyMs} ms)`);
    console.log();

    console.log("1. RESULTS PER UNIT");
    console.log("-".repeat(70));
    console.log(
      `${"Unit ID".padEnd(14)} ${"Fields Evaluated".padStart(18)} ${"Matches".padStart(10)} ${"Accuracy".padStart(10)} ${"Latency".padStart(12)}`
    );
    console.log("-".repeat(70));

    for (const u of run.unitResults) {
      const acc =
        u.evaluation.totalFieldsEvaluated > 0
          ? u.evaluation.totalMatches / u.evaluation.totalFieldsEvaluated
          : 1.0;
      console.log(
        `${u.unitId.padEnd(14)} ${String(u.evaluation.totalFieldsEvaluated).padStart(18)} ${String(
          u.evaluation.totalMatches
        ).padStart(10)} ${pct(acc).padStart(10)} ${(u.latencyMs + " ms").padStart(12)}`
      );
    }
    console.log("-".repeat(70));
    console.log();

    console.log("2. RESULTS PER FEATURE");
    console.log("-".repeat(75));
    console.log(
      `${"Feature".padEnd(25)} ${"Checked".padStart(9)} ${"Matches".padStart(9)} ${"Accuracy".padStart(10)} ${"Misses".padStart(8)} ${"Halluc.".padStart(8)}`
    );
    console.log("-".repeat(75));

    for (const [featName, feat] of Object.entries(run.aggregateMetrics.perFeature)) {
      const acc =
        feat.totalFieldsEvaluated > 0
          ? feat.matches / feat.totalFieldsEvaluated
          : 1.0;
      console.log(
        `${featName.padEnd(25)} ${String(feat.totalFieldsEvaluated).padStart(9)} ${String(
          feat.matches
        ).padStart(9)} ${pct(acc).padStart(10)} ${String(feat.misses).padStart(8)} ${String(
          feat.hallucinations
        ).padStart(8)}`
      );
    }
    console.log("-".repeat(75));
    console.log();

    console.log("3. ACCURACY & ERROR BREAKDOWN");
    console.log("-".repeat(50));
    console.log(`Overall Agreement Rate:      ${pct(run.aggregateMetrics.overallAgreementRate)} (${run.aggregateMetrics.totalMatches} / ${run.aggregateMetrics.totalFieldsEvaluated})`);
    console.log(`Visibility Agreement Rate:   ${pct(run.aggregateMetrics.visibilityAgreementRate)} (${run.aggregateMetrics.visibilityMatches} / ${run.aggregateMetrics.visibilityEvaluated})`);
    console.log(`Legibility Agreement Rate:   ${pct(run.aggregateMetrics.legibilityAgreementRate)} (${run.aggregateMetrics.legibilityMatches} / ${run.aggregateMetrics.legibilityEvaluated})`);
    console.log(`Value Extraction Accuracy:   ${pct(run.aggregateMetrics.valueAccuracyRate)} (${run.aggregateMetrics.valueMatches} / ${run.aggregateMetrics.valuesEvaluated})`);
    console.log(`Placement Agreement Rate:    ${pct(run.aggregateMetrics.placementAgreementRate)} (${run.aggregateMetrics.placementMatches} / ${run.aggregateMetrics.placementsEvaluated})`);
    console.log();
    console.log(`Hallucinations:              ${run.aggregateMetrics.hallucinationCount}`);
    console.log(`Misses:                      ${run.aggregateMetrics.missCount}`);
    console.log(`Unsafe Overassertions:       ${run.aggregateMetrics.unsafeAssertionCount}`);
    console.log(`Uncertain/Abstention Count:  ${run.aggregateMetrics.uncertainCount}`);
    console.log();

    console.log("4. MISMATCH DETAILS");
    console.log("-".repeat(50));
    if (run.aggregateMetrics.allMismatches.length === 0) {
      console.log("None (100% agreement with manually labeled ground truth).");
    } else {
      for (const m of run.aggregateMetrics.allMismatches) {
        console.log(`- [${m.mismatchType}] ${m.unitId} -> ${m.feature}.${m.field}`);
        console.log(`    Expected: "${m.expected ?? "null"}"`);
        console.log(`    Observed: "${m.observed ?? "null"}"`);
        console.log(`    Detail:   ${m.description}`);
        if (m.evidence && m.evidence.length > 0) {
          console.log(`    Evidence: ${m.evidence.join("; ")}`);
        }
      }
    }
    console.log();
  }

  // Multi-run Stability
  if (report.totalRuns > 1) {
    console.log("==================================================");
    console.log("MULTI-RUN REPEATABILITY / STABILITY");
    console.log("==================================================");
    console.log(`Total Stability Fields: ${report.stability.stableFieldCount + report.stability.unstableFieldCount}`);
    console.log(`Stable Fields:          ${report.stability.stableFieldCount}`);
    console.log(`Unstable Fields:        ${report.stability.unstableFieldCount}`);
    console.log(`Stability Rate:         ${pct(report.stability.stabilityRate)}`);
    console.log();

    for (const f of report.stability.fieldDetails) {
      const icon = f.isStable ? "✓" : "✗";
      console.log(
        `${icon} ${f.unitId.padEnd(10)} ${f.feature.padEnd(22)} ${f.field.padEnd(15)} -> [${f.valuesAcrossRuns.map((v) => `"${v ?? "null"}"`).join(", ")}]`
      );
    }
    console.log();
  }

  // Latency Summary
  console.log("==================================================");
  console.log("LATENCY PROFILE");
  console.log("==================================================");
  console.log(`Requests Per Unit:    1`);
  console.log(`Total Batch Requests: ${report.overallLatency.totalRequests}`);
  console.log(`Average Latency:      ${report.overallLatency.averageLatencyMs} ms`);
  console.log(`Min Latency:          ${report.overallLatency.minLatencyMs} ms`);
  console.log(`Max Latency:          ${report.overallLatency.maxLatencyMs} ms`);
  console.log("Latency Per Unit (Average):");
  for (const [u, ms] of Object.entries(report.overallLatency.perUnitAverageMs)) {
    console.log(`  - ${u}: ${Math.round(ms)} ms`);
  }
  console.log("==================================================");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Vision evaluation failed:", msg);
  process.exit(1);
});
