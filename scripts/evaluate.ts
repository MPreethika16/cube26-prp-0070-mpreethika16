import { runEvaluation } from "../src/lib/evaluation/run-evaluation";
import { MATRIX_LABELS } from "../src/lib/evaluation/evaluation-metrics";
import { SUPPORTED_INSPECTION_CHECKS } from "../src/lib/inspection/run-prep-inspection";

/**
 * ============================================================================
 * EVALUATION CLI (DAY 3 / STEP 4)
 * ============================================================================
 *
 * Runs deterministic compliance evaluation across synthetic labeled cases
 * and outputs structured accuracy, safety, confusion matrix, and per-check
 * metrics.
 * ============================================================================
 */
function main() {
  const metrics = runEvaluation();

  const pct = (num: number) => (num * 100).toFixed(1) + "%";

  console.log("==================================================");
  console.log("PREP MANAGER — COMPLIANCE EVALUATION");
  console.log("==================================================");
  console.log();
  console.log(`Total cases:             ${metrics.totalCases}`);
  console.log(`Correct:                 ${metrics.correctCases}`);
  console.log(`Accuracy:                ${pct(metrics.verdictAccuracy)}`);
  console.log();
  console.log(`PASS precision:          ${pct(metrics.passPrecision)}`);
  console.log(`FAIL precision:          ${pct(metrics.failPrecision)}`);
  console.log();
  console.log(`False PASS:              ${metrics.falsePassCount} (${pct(metrics.falsePassRate)})`);
  console.log(`False FAIL:              ${metrics.falseFailCount} (${pct(metrics.falseFailRate)})`);
  console.log(`Abstention rate:         ${metrics.uncertainCount} cases (${pct(metrics.abstentionRate)})`);
  console.log(
    `Uncertainty correctness: ${metrics.uncertaintyCorrectCount} / ${metrics.expectedUncertainCount} (${pct(
      metrics.uncertaintyCorrectness
    )})`
  );
  console.log();

  console.log("==================================================");
  console.log("PER-CHECK RESULTS");
  console.log("==================================================");
  console.log(
    `${"Check Type".padEnd(32)} ${"Total".padStart(8)} ${"Correct".padStart(9)} ${"Accuracy".padStart(10)}`
  );
  console.log("-".repeat(63));

  for (const checkType of SUPPORTED_INSPECTION_CHECKS) {
    const stat = metrics.perCheck[checkType];
    console.log(
      `${stat.checkType.padEnd(32)} ${String(stat.total).padStart(8)} ${String(
        stat.correct
      ).padStart(9)} ${pct(stat.accuracy).padStart(10)}`
    );
  }
  console.log("-".repeat(63));
  console.log();

  console.log("==================================================");
  console.log("CONFUSION MATRIX");
  console.log("==================================================");
  console.log(
    `${"Expected \\ Actual".padEnd(20)} ${"PASS".padStart(8)} ${"FAIL".padStart(8)} ${"UNCERTAIN".padStart(11)} ${"NOT_APPLICABLE".padStart(16)} ${"Total".padStart(8)}`
  );
  console.log("-".repeat(75));

  const colTotals = {
    PASS: 0,
    FAIL: 0,
    UNCERTAIN: 0,
    NOT_APPLICABLE: 0,
  };

  for (const row of MATRIX_LABELS) {
    const rowCounts = metrics.confusionMatrix[row];
    const rowTotal =
      rowCounts.PASS +
      rowCounts.FAIL +
      rowCounts.UNCERTAIN +
      rowCounts.NOT_APPLICABLE;

    colTotals.PASS += rowCounts.PASS;
    colTotals.FAIL += rowCounts.FAIL;
    colTotals.UNCERTAIN += rowCounts.UNCERTAIN;
    colTotals.NOT_APPLICABLE += rowCounts.NOT_APPLICABLE;

    console.log(
      `${row.padEnd(20)} ${String(rowCounts.PASS).padStart(8)} ${String(
        rowCounts.FAIL
      ).padStart(8)} ${String(rowCounts.UNCERTAIN).padStart(11)} ${String(
        rowCounts.NOT_APPLICABLE
      ).padStart(16)} ${String(rowTotal).padStart(8)}`
    );
  }

  console.log("-".repeat(75));
  console.log(
    `${"Total".padEnd(20)} ${String(colTotals.PASS).padStart(8)} ${String(
      colTotals.FAIL
    ).padStart(8)} ${String(colTotals.UNCERTAIN).padStart(11)} ${String(
      colTotals.NOT_APPLICABLE
    ).padStart(16)} ${String(metrics.totalCases).padStart(8)}`
  );
  console.log();

  console.log("==================================================");
  console.log("FAILED CASES");
  console.log("==================================================");
  if (metrics.failedCases.length === 0) {
    console.log("None (100% agreement with deterministic test fixtures)");
  } else {
    for (const fail of metrics.failedCases) {
      console.log(`- Case ID:     ${fail.case.caseId}`);
      console.log(`  Check:       ${fail.case.checkType}`);
      console.log(`  Category:    ${fail.case.category}`);
      console.log(`  Description: ${fail.case.description}`);
      console.log(`  Expected:    ${fail.expectedLabel}`);
      console.log(`  Actual:      ${fail.actualLabel}`);
      console.log(`  Reason:      ${fail.actual.reasonCode}`);
      console.log(`  Explanation: ${fail.actual.explanation}`);
      console.log();
    }
  }
  console.log();

  console.log("==================================================");
  console.log("FALSE PASS CASES");
  console.log("==================================================");
  if (metrics.falsePassCases.length === 0) {
    console.log("None (Zero false PASS decisions — Safety guardrail intact)");
  } else {
    for (const fp of metrics.falsePassCases) {
      console.log(`- Case ID:     ${fp.case.caseId}`);
      console.log(`  Check:       ${fp.case.checkType}`);
      console.log(`  Category:    ${fp.case.category}`);
      console.log(`  Description: ${fp.case.description}`);
      console.log(`  Expected:    ${fp.expectedLabel}`);
      console.log(`  Actual:      ${fp.actualLabel}`);
      console.log();
    }
  }
  console.log("==================================================");
}

main();
