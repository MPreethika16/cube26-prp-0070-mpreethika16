import { createHash } from "crypto";
import type { OperationalInspectionSummary } from "../inspection/operational-status";
import type { PrepInspectionRecord } from "../inspection/prep-inspection.schema";

export const PREP_AGENT_ID = "prep-manager@1.0.0";

export function recordIdFor(requestId: string, orgId: string, subjectId: string): string {
  return `PRP-${createHash("sha256").update(`${requestId}:${orgId}:${subjectId}`).digest("hex").slice(0, 12)}`;
}

/** Hash the decision, not the clock. Identical checks and inputs keep the same hash. */
export function hashEvidence(evidence: Record<string, unknown>): string {
  const stable = JSON.parse(JSON.stringify(evidence)) as Record<string, unknown>;
  delete stable.content_hash;
  delete stable.produced_at;
  delete stable.captured_at;
  delete stable.latency_ms;
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export type PrepRound3Input = {
  schema_version?: string;
  request_id: string;
  workflow_id: string;
  stage?: string;
  subject: { org_id: string; subject_id: string; route?: string };
  inputs?: Array<{ ref?: string; kind?: string; sha256?: string | null; data_base64?: string; media_type?: string; url?: string }>;
  previous_evidence?: Array<{ record_id?: string; stage?: string }>;
  context?: Record<string, unknown>;
};

export function rollupVerdict(statuses: string[]): "PASS" | "FAIL" | "UNCERTAIN" {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("UNCERTAIN")) return "UNCERTAIN";
  if (statuses.includes("PASS")) return "PASS";
  return "UNCERTAIN";
}

export function outcomeFromStatus(status: OperationalInspectionSummary["status"]) {
  if (status === "READY") {
    return { outcome: "ready", verdict: "PASS" as const, status: "completed" as const, needs_human: false, action: "continue" };
  }
  if (status === "STOP_AND_FIX") {
    return { outcome: "stop_and_fix", verdict: "FAIL" as const, status: "completed" as const, needs_human: true, action: "hold" };
  }
  return { outcome: "review_required", verdict: "UNCERTAIN" as const, status: "pending" as const, needs_human: true, action: "review" };
}

export function toPrepAgentOutput(args: {
  input: PrepRound3Input;
  inspection: PrepInspectionRecord;
  operational: OperationalInspectionSummary;
  modelName: string;
  calls: number;
  latencyMs: number;
  inputRefs: Array<{ ref: string; sha256: string | null }>;
  failOpen?: { message: string; retryable: boolean } | null;
  observed?: Record<string, unknown> | null;
}) {
  const mapped = outcomeFromStatus(args.operational.status);
  const checks = args.inspection.checks
    .filter((check) => check.applicability !== "NOT_APPLICABLE" && check.verdict)
    .map((check) => ({
      check_key: check.checkType.toLowerCase(),
      verdict: check.verdict,
      confidence: null,
      expected: check.applicability,
      observed: check.observedValue ?? null,
      detail: check.explanation,
      evidence_refs: (check.evidence || []).map((item) => item.imageId),
      ...(check.verdict === "UNCERTAIN" ? { uncertain_reason: "insufficient_evidence" } : {}),
    }));
  const verdict = args.failOpen ? "UNCERTAIN" : rollupVerdict(checks.map((check) => String(check.verdict)));
  const status = args.failOpen ? "pending" : mapped.status;
  const recordId = recordIdFor(args.input.request_id, args.input.subject.org_id, args.input.subject.subject_id);
  const producedAt = new Date().toISOString();
  const evidence = {
    schema_version: "1.0",
    record_id: recordId,
    workflow_id: args.input.workflow_id,
    stage: "prep",
    agent_id: PREP_AGENT_ID,
    subject: {
      org_id: args.input.subject.org_id,
      subject_id: args.input.subject.subject_id,
      unit_id: args.input.subject.subject_id,
      unit_scope: "unit",
      refs: {
        sku: args.inspection.sku ?? null,
        asin: args.inspection.asin ?? null,
        work_order_id: args.inspection.workOrderId ?? null,
      },
    },
    status,
    captured_at: args.inspection.metadata.inspectedAt,
    produced_at: producedAt,
    latency_ms: args.latencyMs,
    operator_id: "prep",
    model: {
      name: args.calls > 0 ? "claude" : "rules",
      version: args.modelName,
      provider: args.calls > 0 ? "anthropic" : null,
      prompt_version: "prep-observe-v1",
      calls: args.calls,
      cost_usd: null,
    },
    inputs: args.inputRefs.map((row) => ({ ref: row.ref, sha256: row.sha256, kind: "image" })),
    checks,
    decision: {
      verdict: args.failOpen ? "UNCERTAIN" : mapped.verdict,
      outcome: args.failOpen ? "review_required" : mapped.outcome,
      confidence: null,
      reason: args.failOpen?.message || `prep operational status ${args.operational.status}`,
      needs_human: args.failOpen ? true : mapped.needs_human,
    },
    payload: {
      operational_status: args.operational.status,
      pass_count: args.operational.passCount,
      fail_count: args.operational.failCount,
      uncertain_count: args.operational.uncertainCount,
      blocking_checks: args.operational.blockingCheckTypes,
      uncertain_checks: args.operational.uncertainCheckTypes,
      upstream_refs: (args.input.previous_evidence || []).map((row) => row.record_id).filter(Boolean),
      claim_boundary: "prep_compliance_only",
      observed: args.observed ?? null,
    },
    upstream_refs: (args.input.previous_evidence || []).map((row) => row.record_id).filter(Boolean),
    overrides: [],
    error: args.failOpen ? { code: "pending", message: args.failOpen.message, retryable: args.failOpen.retryable } : null,
  };
  const contentHash = hashEvidence(evidence);
  return {
    schema_version: "1.0",
    workflow_id: args.input.workflow_id,
    stage: "prep",
    agent_id: PREP_AGENT_ID,
    status,
    verdict,
    confidence: null,
    timestamp: producedAt,
    model: evidence.model,
    error: evidence.error,
    next_step_recommendation: {
      action: args.failOpen ? "review" : mapped.action,
      reason: evidence.decision.reason,
    },
    evidence: { ...evidence, content_hash: contentHash },
  };
}
