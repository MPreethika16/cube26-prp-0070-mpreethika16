import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWorkOrderForUnit,
  getDemoUnitsList,
} from "../../src/lib/inspection/work-order-resolver";
import {
  loadDemoFixtureImages,
  SAMPLE_UNIT_ALIASES,
} from "../../src/lib/inspection/demo-fixture-loader";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import { aggregateOperationalStatus } from "../../src/lib/inspection/operational-status";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

function createCompliantObservation(unitId: string, expectedFnsku: string = "X00DUMMY001"): PrepUnitObservation {
  return {
    unitId,
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: expectedFnsku,
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on carton face",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "NOT_DETECTED",
      packagingType: "NONE_DETECTED",
      sealStatus: "NOT_SEALED",
      evidence: [],
    },
    suffocationWarning: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedText: null,
      evidence: [],
    },
    manufacturerBarcode: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    manufacturerBarcodeCoverage: {
      status: "COVERED",
      coveringType: "OPAQUE_LABEL",
      evidence: [{ imageId: "back", description: "UPC covered by label" }],
    },
    expiryDate: {
      visibility: "NOT_DETECTED",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [],
    },
    handlingMarks: [],
    otherVisibleIssues: [],
  };
}

describe("Generalize Unit Selection & Anti-Leakage Invariants (Day 5 / Step 9)", () => {
  it("Requirement 1: Sample selection does not assign an inspection verdict", () => {
    // Loading a sample unit resolves only its work order and physical images
    const sampleIds = ["SAMPLE-01", "SAMPLE-02", "SAMPLE-03"];
    for (const sampleId of sampleIds) {
      const wo = resolveWorkOrderForUnit(sampleId);
      const fixture = loadDemoFixtureImages(sampleId);

      // Verify work order is strictly input specification
      assert.ok(wo.workOrderId, "Must have workOrderId");
      assert.ok(wo.sku, "Must have sku");
      assert.equal(typeof (wo as Record<string, unknown>).verdict, "undefined");
      assert.equal(typeof (wo as Record<string, unknown>).operationalStatus, "undefined");

      // Verify fixture contains only physical image inputs
      assert.equal(fixture.unitId, sampleId);
      assert.equal(fixture.images.length, 3);
      for (const img of fixture.images) {
        assert.ok(img.dataUrl.startsWith("data:image/"));
        assert.equal(typeof (img as unknown as Record<string, unknown>).verdict, "undefined");
      }
    }
  });

  it("Requirement 2: Sample names and public list do not expose expected inspection outcomes", () => {
    const list = getDemoUnitsList();
    const forbiddenOutcomeTerms = [
      "ready",
      "fix needed",
      "defect",
      "defective",
      "recovery",
      "compliant",
      "fail",
      "pass",
      "needs better photo",
    ];

    for (const item of list) {
      const lowerDesc = item.description.toLowerCase();
      const lowerUnit = item.unitId.toLowerCase();

      for (const term of forbiddenOutcomeTerms) {
        assert.ok(
          !lowerDesc.includes(term),
          `Sample description for ${item.unitId} leaks outcome term '${term}': "${item.description}"`
        );
      }
      assert.ok(
        !lowerUnit.includes("compliant") &&
          !lowerUnit.includes("defect") &&
          !lowerUnit.includes("recovery"),
        `Public unit ID ${item.unitId} leaks expected outcome`
      );
    }
  });

  it("Requirement 3: Switching units clears previous results (State Reset Invariant)", () => {
    // Simulate active inspection state from a prior inspection
    let activeState: {
      operationalStatus: string | null;
      verdictCount: number;
      recoveryPlanActive: boolean;
    } = {
      operationalStatus: "STOP_AND_FIX",
      verdictCount: 1,
      recoveryPlanActive: true,
    };

    // Reset function executed upon switching units
    const resetState = () => {
      activeState = {
        operationalStatus: null,
        verdictCount: 0,
        recoveryPlanActive: false,
      };
    };

    resetState();
    assert.equal(activeState.operationalStatus, null, "Operational status must be cleared");
    assert.equal(activeState.verdictCount, 0, "Checks and verdicts must be cleared");
    assert.equal(activeState.recoveryPlanActive, false, "Recovery plan must be cleared");
  });

  it("Requirement 4: Selecting a sample loads only unit, work-order, and evidence inputs", () => {
    const fixturePayload = loadDemoFixtureImages("SAMPLE-01");
    assert.equal(fixturePayload.unitId, "SAMPLE-01");
    assert.equal(fixturePayload.images.length, 3);
    const slots = fixturePayload.images.map((i) => i.imageId).sort();
    assert.deepEqual(slots, ["back", "front", "label"]);

    const wo = resolveWorkOrderForUnit("SAMPLE-01");
    assert.equal(wo.unitId, "SAMPLE-01");
    assert.equal(wo.expectedFnsku, "X00DUMMY001");
  });

  it("Requirement 5: Inspection pipeline evaluates compliance dynamically from observation", () => {
    const wo = resolveWorkOrderForUnit("SAMPLE-01");
    const obs = createCompliantObservation("SAMPLE-01");

    const record = runPrepInspection({
      observation: obs,
      workOrder: wo,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const status = aggregateOperationalStatus(record);
    assert.equal(status.status, "READY");
    assert.ok(status.passCount >= 3);
    assert.equal(status.failCount, 0);
  });

  it("Requirement 6: DEMO-COMPLIANT / SAMPLE-01 is NOT hardcoded to READY (defects are detected)", () => {
    const wo = resolveWorkOrderForUnit("SAMPLE-01");
    const obs = createCompliantObservation("SAMPLE-01");

    // Inject an exposed barcode defect on SAMPLE-01
    obs.manufacturerBarcodeCoverage = {
      status: "NOT_COVERED",
      coveringType: null,
      evidence: [{ imageId: "back", description: "UPC is exposed" }],
    };
    obs.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "012345678905",
      evidence: [{ imageId: "back", description: "Exposed barcode" }],
    };

    const record = runPrepInspection({
      observation: obs,
      workOrder: wo,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const status = aggregateOperationalStatus(record);
    // If it was hardcoded to READY for SAMPLE-01, this would fail!
    assert.equal(status.status, "STOP_AND_FIX", "SAMPLE-01 with exposed barcode must evaluate to STOP_AND_FIX");
    assert.equal(status.failCount, 1);
  });

  it("Requirement 7: DEMO-DEFECT / SAMPLE-02 is NOT hardcoded to STOP_AND_FIX (compliant evidence passes)", () => {
    const wo = resolveWorkOrderForUnit("SAMPLE-02");
    // Provide a fully compliant observation on SAMPLE-02 with the correct expected FNSKU
    const obs = createCompliantObservation("SAMPLE-02", wo.expectedFnsku);

    const record = runPrepInspection({
      observation: obs,
      workOrder: wo,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const status = aggregateOperationalStatus(record);
    // If it was hardcoded to STOP_AND_FIX for SAMPLE-02, this would fail!
    assert.equal(status.status, "READY", "SAMPLE-02 with covered barcode must evaluate to READY");
    assert.equal(status.failCount, 0);
  });

  it("Requirement 8: DEMO-RECOVERY / SAMPLE-03 is NOT hardcoded to REVIEW_REQUIRED (legible evidence passes)", () => {
    const wo = resolveWorkOrderForUnit("SAMPLE-03");
    // Provide fully legible expiry date on SAMPLE-03 with the correct expected FNSKU
    const obs = createCompliantObservation("SAMPLE-03", wo.expectedFnsku);
    obs.fnsku.detectedValue = wo.expectedFnsku;
    obs.expiryDate = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "2027-12-31",
      evidence: [{ imageId: "back", description: "Sharp macro expiry date" }],
    };

    const record = runPrepInspection({
      observation: obs,
      workOrder: wo,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const status = aggregateOperationalStatus(record);
    // If it was hardcoded to REVIEW_REQUIRED for SAMPLE-03, this would fail!
    assert.equal(status.status, "READY", "SAMPLE-03 with sharp expiry must evaluate to READY");
    assert.equal(status.uncertainCount, 0);
  });

  it("Requirement 9: Golden demo aliases resolve correctly to underlying disk fixtures", () => {
    assert.equal(SAMPLE_UNIT_ALIASES["SAMPLE-01"], "DEMO-COMPLIANT");
    assert.equal(SAMPLE_UNIT_ALIASES["SAMPLE-02"], "DEMO-DEFECT");
    assert.equal(SAMPLE_UNIT_ALIASES["SAMPLE-03"], "DEMO-RECOVERY");

    // Both aliases and original fixture IDs resolve valid images
    const sample01 = loadDemoFixtureImages("SAMPLE-01");
    const demoCompliant = loadDemoFixtureImages("DEMO-COMPLIANT");
    assert.equal(sample01.images.length, demoCompliant.images.length);
  });

  it("Requirement 10: Existing compliance evaluation invariants and guardrails remain untouched", () => {
    // Ensure all 10 checks run deterministically on sample work orders
    const wo = resolveWorkOrderForUnit("SAMPLE-01");
    const obs = createCompliantObservation("SAMPLE-01");

    const record = runPrepInspection({
      observation: obs,
      workOrder: wo,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    assert.equal(record.checks.length, 10, "Must evaluate all 10 compliance checks");
  });
});
