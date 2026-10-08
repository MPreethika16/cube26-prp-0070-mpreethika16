import { readFileSync } from "fs";
import { runPrepRound3 } from "../src/lib/round3/run";

async function main() {
  const dir = "fixtures/prep/real/PRODUCT-1";
  const files = ["front.jpeg", "back.jpeg", "label.jpeg"];
  const inputs = files.map((name) => ({
    ref: name,
    media_type: "image/jpeg",
    data_base64: readFileSync(`${dir}/${name}`).toString("base64"),
  }));
  const out = await runPrepRound3({
    schema_version: "1.0",
    request_id: "prep-smoke-1",
    workflow_id: "WF-org_demo_alpha-PRODUCT-1",
    stage: "prep",
    subject: { org_id: "org_demo_alpha", subject_id: "PRODUCT-1" },
    inputs,
    previous_evidence: [],
    context: {
      work_order: {
        workOrderId: "WO-PRODUCT-1",
        unitId: "PRODUCT-1",
        sku: "SKU-PRODUCT-1",
        asin: "UNKNOWN",
        expectedFnsku: "X00PRODUCT1",
        requirements: {
          polybag: "UNKNOWN",
          suffocationWarning: "UNKNOWN",
          expiryDate: "UNKNOWN",
          handlingMarks: { state: "UNKNOWN", requiredMarks: [] },
        },
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        status: out.status,
        verdict: out.verdict,
        outcome: out.evidence.decision.outcome,
        model: out.model.name,
        version: out.model.version,
        calls: out.model.calls,
        provider: out.model.provider,
        checks: out.evidence.checks.length,
        record: out.evidence.record_id,
        error: out.error,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
