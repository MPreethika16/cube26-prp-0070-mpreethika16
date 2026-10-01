import {
  analyzePrepUnit,
  type AnalyzePrepUnitResult,
} from "../analyze-prep-unit";
import { loadUnitImages } from "../load-unit-images";
import { FIXTURE_VISION_GROUND_TRUTH } from "./vision-ground-truth-dataset";
import type { UnitVisionGroundTruth } from "./vision-ground-truth.schema";
import {
  evaluateUnitObservation,
  aggregateVisionMetrics,
  type UnitVisionEvaluationResult,
  type AggregateVisionMetrics,
} from "./vision-evaluator";

export interface VisionRunUnitResult {
  unitId: string;
  result: AnalyzePrepUnitResult;
  evaluation: UnitVisionEvaluationResult;
  latencyMs: number;
}

export interface SingleVisionRunSummary {
  runIndex: number;
  unitResults: VisionRunUnitResult[];
  aggregateMetrics: AggregateVisionMetrics;
  totalLatencyMs: number;
  averageLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

export interface StabilityCheckItem {
  unitId: string;
  feature: string;
  field: string;
  valuesAcrossRuns: Array<string | null>;
  isStable: boolean;
}

export interface MultiRunVisionEvaluationReport {
  totalRuns: number;
  unitsEvaluated: string[];
  runs: SingleVisionRunSummary[];
  overallLatency: {
    totalRequests: number;
    averageLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    perUnitAverageMs: Record<string, number>;
  };
  stability: {
    isFullyStable: boolean;
    stableFieldCount: number;
    unstableFieldCount: number;
    stabilityRate: number;
    fieldDetails: StabilityCheckItem[];
  };
}

export type PrepUnitAnalyzerFn = (
  unitId: string,
  images: ReturnType<typeof loadUnitImages>
) => Promise<AnalyzePrepUnitResult>;

export interface RunVisionEvaluationOptions {
  runs?: number;
  units?: string[];
  groundTruths?: Record<string, UnitVisionGroundTruth>;
  analyzer?: PrepUnitAnalyzerFn;
  delayMs?: number;
}

/**
 * Runs visual perception evaluation across physical prep unit fixtures.
 *
 * Sits exclusively at the visual observation layer:
 * fixture images → analyzePrepUnit() → validated PrepUnitObservation → ground-truth comparison
 *
 * STRICT GUARDRAILS:
 * - Does NOT call the compliance engine.
 * - Does NOT modify prompts.
 * - Records latency, accuracy, safety, and stability metrics without majority voting.
 */
export async function runVisionEvaluation(
  options?: RunVisionEvaluationOptions
): Promise<MultiRunVisionEvaluationReport> {
  const numRuns = options?.runs ?? 1;
  const unitIds = options?.units ?? ["UNIT-0001", "UNIT-0002"];
  const groundTruths = options?.groundTruths ?? FIXTURE_VISION_GROUND_TRUTH;
  const analyzer = options?.analyzer ?? analyzePrepUnit;
  const delayMs = options?.delayMs ?? (options?.analyzer ? 0 : 3000);

  const runSummaries: SingleVisionRunSummary[] = [];
  const allLatencies: number[] = [];
  const unitLatencies: Record<string, number[]> = {};

  for (const u of unitIds) {
    unitLatencies[u] = [];
  }

  for (let r = 0; r < numRuns; r++) {
    const unitResults: VisionRunUnitResult[] = [];
    const runLatencies: number[] = [];

    for (const unitId of unitIds) {
      const gt = groundTruths[unitId];
      if (!gt) {
        throw new Error(`Missing ground truth for unit: ${unitId}`);
      }

      const images = loadUnitImages(unitId);
      console.log(`[Run ${r + 1}/${numRuns}] Analyzing ${unitId} (${images.length} images)...`);
      const analysisResult = await analyzer(unitId, images);
      const latencyMs = analysisResult.metadata.durationMs;
      console.log(`[Run ${r + 1}/${numRuns}] ${unitId} completed in ${latencyMs} ms`);

      runLatencies.push(latencyMs);
      allLatencies.push(latencyMs);
      unitLatencies[unitId].push(latencyMs);

      const evaluation = evaluateUnitObservation(
        analysisResult.observation,
        gt
      );

      unitResults.push({
        unitId,
        result: analysisResult,
        evaluation,
        latencyMs,
      });

      // Brief delay between units to avoid rate spikes
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const aggregateMetrics = aggregateVisionMetrics(
      unitResults.map((u) => u.evaluation)
    );

    const totalLatencyMs = runLatencies.reduce((a, b) => a + b, 0);
    const averageLatencyMs =
      runLatencies.length > 0 ? totalLatencyMs / runLatencies.length : 0;
    const minLatencyMs = Math.min(...runLatencies);
    const maxLatencyMs = Math.max(...runLatencies);

    runSummaries.push({
      runIndex: r + 1,
      unitResults,
      aggregateMetrics,
      totalLatencyMs,
      averageLatencyMs,
      minLatencyMs,
      maxLatencyMs,
    });
  }

  // Latency aggregation across all runs
  const totalOverallLatency = allLatencies.reduce((a, b) => a + b, 0);
  const overallAvgLatency =
    allLatencies.length > 0 ? totalOverallLatency / allLatencies.length : 0;
  const overallMinLatency = allLatencies.length > 0 ? Math.min(...allLatencies) : 0;
  const overallMaxLatency = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;

  const perUnitAverageMs: Record<string, number> = {};
  for (const u of unitIds) {
    const list = unitLatencies[u];
    perUnitAverageMs[u] =
      list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;
  }

  // Stability / Consistency across runs
  const fieldDetails: StabilityCheckItem[] = [];
  let stableFieldCount = 0;
  let unstableFieldCount = 0;

  if (numRuns > 1) {
    for (const unitId of unitIds) {
      const fieldExtractors = [
        {
          feature: "manufacturerBarcode",
          field: "visibility",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .manufacturerBarcode.visibility ?? null,
        },
        {
          feature: "manufacturerBarcode",
          field: "detectedValue",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .manufacturerBarcode.detectedValue ?? null,
        },
        {
          feature: "expiryDate",
          field: "visibility",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .expiryDate.visibility ?? null,
        },
        {
          feature: "expiryDate",
          field: "detectedValue",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .expiryDate.detectedValue ?? null,
        },
        {
          feature: "fnsku",
          field: "visibility",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .fnsku.visibility ?? null,
        },
        {
          feature: "polybag",
          field: "visibility",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .polybag.visibility ?? null,
        },
        {
          feature: "polybag",
          field: "packagingType",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .polybag.packagingType ?? null,
        },
        {
          feature: "suffocationWarning",
          field: "visibility",
          extract: (r: SingleVisionRunSummary) =>
            r.unitResults.find((u) => u.unitId === unitId)?.result.observation
              .suffocationWarning.visibility ?? null,
        },
      ];

      for (const item of fieldExtractors) {
        const valuesAcrossRuns = runSummaries.map((s) => item.extract(s));
        const firstVal = valuesAcrossRuns[0];
        const isStable = valuesAcrossRuns.every((v) => v === firstVal);

        if (isStable) {
          stableFieldCount++;
        } else {
          unstableFieldCount++;
        }

        fieldDetails.push({
          unitId,
          feature: item.feature,
          field: item.field,
          valuesAcrossRuns,
          isStable,
        });
      }
    }
  }

  const totalStabilityFields = stableFieldCount + unstableFieldCount;
  const stabilityRate =
    totalStabilityFields > 0 ? stableFieldCount / totalStabilityFields : 1.0;

  return {
    totalRuns: numRuns,
    unitsEvaluated: unitIds,
    runs: runSummaries,
    overallLatency: {
      totalRequests: allLatencies.length,
      averageLatencyMs: Math.round(overallAvgLatency),
      minLatencyMs: overallMinLatency,
      maxLatencyMs: overallMaxLatency,
      perUnitAverageMs,
    },
    stability: {
      isFullyStable: unstableFieldCount === 0,
      stableFieldCount,
      unstableFieldCount,
      stabilityRate,
      fieldDetails,
    },
  };
}
