import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getOrderedOperatorProblems,
} from "../../src/lib/inspection/operator-presentation";
import { buildEnrichedCheck } from "../../src/lib/inspection/inspection-view-model";
import { runPrepInspection } from "../../src/lib/inspection/run-prep-inspection";
import {
  ACTIVE_RULES,
  PRODUCTION_POLICY_CONTEXT,
} from "../../src/lib/compliance/rules/active-rules";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";

const TEST_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-RECOVERY-UX",
  unitId: "UNIT-REC-UX",
  sku: "SKU-REC-UX",
  asin: "B0TESTRECOV",
  expectedFnsku: "X00DUMMY001",
  requirements: {
    polybag: "REQUIRED",
    suffocationWarning: "REQUIRED",
    expiryDate: "REQUIRED",
    handlingMarks: {
      state: "REQUIRED",
      requiredMarks: ["FRAGILE"],
    },
  },
};

function createBaseObservation(): PrepUnitObservation {
  return {
    unitId: "UNIT-REC-UX",
    imageQuality: { overall: "GOOD", issues: [] },
    fnsku: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "X00DUMMY001",
      placement: "FLAT_SURFACE",
      placementDescription: "Flat on label view",
      evidence: [{ imageId: "label", description: "Clear FNSKU label" }],
    },
    polybag: {
      visibility: "VISIBLE",
      packagingType: "POLYBAG",
      sealStatus: "SEALED",
      evidence: [{ imageId: "front", description: "Sealed polybag" }],
    },
    suffocationWarning: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedText: "WARNING: Keep away from small children",
      evidence: [{ imageId: "front", description: "Warning on front" }],
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
      evidence: [{ imageId: "back", description: "Covered barcode" }],
    },
    expiryDate: {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      detectedValue: "2027-12-31",
      evidence: [{ imageId: "back", description: "Clear expiry date" }],
    },
    handlingMarks: [
      {
        detectedType: "FRAGILE",
        visibility: "VISIBLE",
        legibility: "LEGIBLE",
        detectedText: "FRAGILE",
        evidence: [{ imageId: "front", description: "Fragile mark" }],
      },
    ],
    otherVisibleIssues: [],
  };
}

describe("Operator Recovery UX Hardening Tests", () => {
  it("Requirement 1: Groups FNSKU_IDENTITY + FNSKU_PLACEMENT uncertainty into one 'Retake product label photo' task", () => {
    const obs = createBaseObservation();
    // Degrade label evidence so both identity and placement are UNCERTAIN
    obs.fnsku = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [{ imageId: "label", description: "Blurry label crop" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });

    // Should group into exactly ONE task for the label photo
    const labelTasks = tasks.filter(
      (t) =>
        t.resolvesCheckTypes.includes("FNSKU_IDENTITY") ||
        t.resolvesCheckTypes.includes("FNSKU_PLACEMENT")
    );

    assert.equal(labelTasks.length, 1, "Should create exactly 1 grouped label recovery task");
    const groupedTask = labelTasks[0];

    assert.equal(groupedTask.actionTitle, "Retake product label photo");
    assert.deepEqual(groupedTask.resolvesCheckTypes.sort(), ["FNSKU_IDENTITY", "FNSKU_PLACEMENT"]);
    assert.equal(groupedTask.evidenceSlot, "label");
    assert.equal(groupedTask.internalVerdict, "UNCERTAIN");
  });

  it("Requirement 2: Preserves every underlying compliance check independently in audit data and task.underlyingChecks", () => {
    const obs = createBaseObservation();
    obs.fnsku = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [{ imageId: "label", description: "Blurry label crop" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    // 1. Audit checks in inspection record must be completely independent
    const fnskuIdentityCheck = inspection.checks.find((c) => c.checkType === "FNSKU_IDENTITY");
    const fnskuPlacementCheck = inspection.checks.find((c) => c.checkType === "FNSKU_PLACEMENT");

    assert.ok(fnskuIdentityCheck, "FNSKU_IDENTITY check must exist independently in audit");
    assert.ok(fnskuPlacementCheck, "FNSKU_PLACEMENT check must exist independently in audit");
    assert.equal(fnskuIdentityCheck.verdict, "UNCERTAIN");
    assert.equal(fnskuPlacementCheck.verdict, "UNCERTAIN");
    assert.notEqual(fnskuIdentityCheck.rule.ruleId, fnskuPlacementCheck.rule.ruleId);

    // 2. The operator task must carry both underlying checks with all technical details
    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });
    const labelTask = tasks.find((t) => t.resolvesCheckTypes.includes("FNSKU_IDENTITY"));
    assert.ok(labelTask, "Grouped label task must exist");

    assert.equal(labelTask.underlyingChecks.length, 2, "underlyingChecks must contain both checks");
    const underlyingTypes = labelTask.underlyingChecks.map((c) => c.checkType).sort();
    assert.deepEqual(underlyingTypes, ["FNSKU_IDENTITY", "FNSKU_PLACEMENT"]);

    // Each underlying check retains rule details and verdict
    for (const uc of labelTask.underlyingChecks) {
      assert.ok(uc.checkId, "Underlying check has checkId");
      assert.equal(uc.verdict, "UNCERTAIN");
      assert.ok(uc.policyRule, "Underlying check has policyRule");
      assert.ok(uc.aiObservation, "Underlying check has aiObservation");
    }
  });

  it("Requirement 3: Never groups FAIL physical corrections with UNCERTAIN evidence-recovery actions", () => {
    const obs = createBaseObservation();
    // Expiry date is UNCERTAIN (needs clearer photo)
    obs.expiryDate = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Blurry expiry stamp" }],
    };
    // Barcode coverage is FAIL (physical correction needed: cover old barcode)
    obs.manufacturerBarcodeCoverage = {
      status: "NOT_COVERED",
      coveringType: null,
      evidence: [{ imageId: "back", description: "UPC barcode is exposed" }],
    };
    obs.manufacturerBarcode = {
      visibility: "VISIBLE",
      legibility: "LEGIBLE",
      valueCompleteness: "COMPLETE",
      detectedValue: "012345678905",
      evidence: [{ imageId: "back", description: "Uncovered manufacturer UPC" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });

    // There should be a FAIL task and UNCERTAIN task(s), completely separated
    const failTasks = tasks.filter((t) => t.internalVerdict === "FAIL");
    const uncertainTasks = tasks.filter((t) => t.internalVerdict === "UNCERTAIN");

    assert.equal(failTasks.length, 1, "Must have exactly 1 FAIL task");
    assert.ok(uncertainTasks.length >= 1, "Must have at least 1 UNCERTAIN task");

    const failTask = failTasks[0];
    assert.equal(failTask.actionTitle, "Cover manufacturer barcode");
    assert.equal(failTask.resolvesCheckTypes.length, 1);
    assert.equal(failTask.resolvesCheckTypes[0], "MANUFACTURER_BARCODE_COVERAGE");

    // No UNCERTAIN check types should be in the FAIL task
    assert.ok(!failTask.resolvesCheckTypes.includes("EXPIRY_VISIBILITY"));
    assert.ok(!failTask.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY"));

    // No FAIL check types should be in any UNCERTAIN task
    for (const ut of uncertainTasks) {
      assert.ok(!ut.resolvesCheckTypes.includes("MANUFACTURER_BARCODE_COVERAGE"));
    }
  });

  it("Requirement 4: Recovery photo slot is derived from actual evidence/capture requirements, not hard-coded", () => {
    const obs = createBaseObservation();
    // Suppose FNSKU evidence is actually on the 'front' view (e.g. blister pack / pouch)
    obs.fnsku = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      valueCompleteness: "UNCERTAIN",
      detectedValue: null,
      placement: "UNCERTAIN",
      placementDescription: null,
      evidence: [{ imageId: "front", description: "Front view showing partial sticker" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });
    const labelTask = tasks.find((t) => t.resolvesCheckTypes.includes("FNSKU_IDENTITY"));
    assert.ok(labelTask, "Task must exist");

    // Since evidence was on 'front', the recovery slot must be 'front', NOT blindly hardcoded 'label'
    assert.equal(labelTask.evidenceSlot, "front", "Should dynamically derive slot from feature evidence");
  });

  it("Requirement 5: Removes repetitive recovery tasks when one new photograph can resolve all of them (Expiry pair)", () => {
    const obs = createBaseObservation();
    // Both expiry visibility and expiry legibility are UNCERTAIN on the 'back' slot
    obs.expiryDate = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Blurry expiration text" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });
    const expiryTasks = tasks.filter(
      (t) =>
        t.resolvesCheckTypes.includes("EXPIRY_VISIBILITY") ||
        t.resolvesCheckTypes.includes("EXPIRY_LEGIBILITY")
    );

    // Must be consolidated into 1 task, not 2 repetitive tasks asking for the back photo
    assert.equal(expiryTasks.length, 1, "Must consolidate repetitive expiry recovery into 1 task");
    assert.equal(expiryTasks[0].actionTitle, "Retake expiry photo");
    assert.equal(expiryTasks[0].evidenceSlot, "back");
    assert.deepEqual(expiryTasks[0].resolvesCheckTypes.sort(), [
      "EXPIRY_LEGIBILITY",
      "EXPIRY_VISIBILITY",
    ]);
  });

  it("Requirement 6: Capture guidance does not contain awkward sentence fragments", () => {
    const obs = createBaseObservation();
    obs.expiryDate = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Blurry expiry" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });
    for (const task of tasks) {
      for (const step of task.whatToDoSteps) {
        assert.ok(
          !step.includes("Take a close photo where the entire item is"),
          `Step should not contain awkward phrasing: "${step}"`
        );
      }
    }
  });

  it("Requirement 7: Task grouping never hides FAIL or UNCERTAIN verdicts", () => {
    const obs = createBaseObservation();
    // 1 FAIL (Polybag seal)
    obs.polybag = {
      visibility: "VISIBLE",
      packagingType: "POLYBAG",
      sealStatus: "NOT_SEALED",
      evidence: [{ imageId: "front", description: "Open polybag edge" }],
    };
    // 2 UNCERTAIN (Expiry)
    obs.expiryDate = {
      visibility: "UNCERTAIN",
      legibility: "UNCERTAIN",
      detectedValue: null,
      evidence: [{ imageId: "back", description: "Unreadable date" }],
    };

    const inspection = runPrepInspection({
      workOrder: TEST_WORK_ORDER,
      observation: obs,
      rules: ACTIVE_RULES,
      policyContext: PRODUCTION_POLICY_CONTEXT,
    });

    const enrichedChecks = inspection.checks.map((c) =>
      buildEnrichedCheck(c, TEST_WORK_ORDER, obs, ACTIVE_RULES)
    );
    const tasks = getOrderedOperatorProblems({
      enrichedChecks,
      workOrder: TEST_WORK_ORDER,
      observation: obs,
    });

    // Total distinct checks with issues in inspection:
    // POLYBAG_SEAL: FAIL
    // EXPIRY_VISIBILITY: UNCERTAIN
    // EXPIRY_LEGIBILITY: UNCERTAIN
    // All 3 checks must be accounted for across task.resolvesCheckTypes
    const allResolvedTypes = tasks.flatMap((t) => t.resolvesCheckTypes);
    assert.ok(allResolvedTypes.includes("POLYBAG_SEAL"), "POLYBAG_SEAL must be represented");
    assert.ok(allResolvedTypes.includes("EXPIRY_VISIBILITY"), "EXPIRY_VISIBILITY must be represented");
    assert.ok(allResolvedTypes.includes("EXPIRY_LEGIBILITY"), "EXPIRY_LEGIBILITY must be represented");

    // Total count of underlying checks across all tasks must equal total non-passing checks
    const totalUnderlyingChecks = tasks.reduce((sum, t) => sum + t.underlyingChecks.length, 0);
    const nonPassingChecks = inspection.checks.filter(
      (c) => c.verdict === "FAIL" || c.verdict === "UNCERTAIN"
    );
    assert.equal(
      totalUnderlyingChecks,
      nonPassingChecks.length,
      "Every non-passing check must be preserved in underlyingChecks without omission"
    );
  });
});
