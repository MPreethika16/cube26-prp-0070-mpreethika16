import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { outcomeFromStatus, rollupVerdict, toPrepAgentOutput } from "../../src/lib/round3/agent-output";

describe("Prep Round 3 output", () => {
  it("maps operational status without calling a model", () => {
    assert.equal(outcomeFromStatus("READY").outcome, "ready");
    assert.equal(outcomeFromStatus("STOP_AND_FIX").verdict, "FAIL");
    assert.equal(outcomeFromStatus("REVIEW_REQUIRED").status, "pending");
    assert.equal(rollupVerdict(["PASS", "UNCERTAIN"]), "UNCERTAIN");
    assert.equal(rollupVerdict(["PASS", "FAIL"]), "FAIL");
  });

  it("emits an evidence envelope and fail-opens", () => {
    const output = toPrepAgentOutput({
      input: {
        request_id: "req-1",
        workflow_id: "WF-1",
        subject: { org_id: "org_demo_alpha", subject_id: "UNIT-0001" },
        previous_evidence: [{ record_id: "RCV-1" }],
      },
      inspection: {
        inspectionId: "ins-1",
        checks: [
          {
            checkType: "FNSKU_IDENTITY",
            applicability: "APPLICABLE",
            verdict: "PASS",
            explanation: "label matches",
            observedValue: "X00",
            evidence: [{ imageId: "front.jpeg", description: "label" }],
          },
        ],
        sku: "SKU",
        asin: "ASIN",
        workOrderId: "WO-1",
        metadata: { inspectedAt: "2026-10-08T00:00:00Z" },
      } as never,
      operational: {
        status: "READY",
        passCount: 1,
        failCount: 0,
        uncertainCount: 0,
        notApplicableCount: 0,
        blockingCheckTypes: [],
        uncertainCheckTypes: [],
      },
      modelName: "claude-sonnet-4-5",
      calls: 1,
      latencyMs: 10,
      inputRefs: [{ ref: "front.jpeg", sha256: "abc" }],
    });
    assert.equal(output.stage, "prep");
    assert.equal(output.evidence.decision.outcome, "ready");
    assert.equal(output.evidence.payload.upstream_refs[0], "RCV-1");
    assert.equal(output.evidence.content_hash.length, 64);
    assert.equal(output.model.provider, "anthropic");
  });
});
