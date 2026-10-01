import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VERDICT_HUMAN_MAPPING,
  CHECK_HUMAN_TITLES,
  PHOTO_CAPTURE_GUIDANCE,
  translateErrorToHuman,
  buildOperatorActionableTask,
  getOrderedOperatorProblems,
} from "../../src/lib/inspection/operator-presentation";
import type { EnrichedComplianceCheck } from "../../src/lib/inspection/inspection-view-model";
import type { WorkOrderSpecification } from "../../src/lib/compliance/work-order.schema";
import type { PrepUnitObservation } from "../../src/lib/vision/prep-observation.schema";

const MOCK_WORK_ORDER: WorkOrderSpecification = {
  workOrderId: "WO-0001",
  unitId: "UNIT-0001",
  sku: "TEST-SKU-1",
  asin: "B00TEST123",
  expectedFnsku: "X001ABCDEF",
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

const MOCK_BASE_OBSERVATION: PrepUnitObservation = {
  unitId: "UNIT-0001",
  imageQuality: { overall: "GOOD", issues: [] },
  fnsku: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    detectedValue: "X001ABCDEF",
    placement: "FLAT_SURFACE",
    placementDescription: "Flat on label surface",
    evidence: [{ imageId: "label", description: "Legible FNSKU label" }],
  },
  polybag: {
    visibility: "VISIBLE",
    packagingType: "POLYBAG",
    sealStatus: "SEALED",
    evidence: [{ imageId: "front", description: "Clear polybag visible" }],
  },
  suffocationWarning: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    detectedText: "WARNING: Keep away from children",
    evidence: [{ imageId: "front", description: "Suffocation warning label" }],
  },
  manufacturerBarcode: {
    visibility: "VISIBLE",
    legibility: "LEGIBLE",
    detectedValue: "8906050590022",
    evidence: [{ imageId: "back", description: "UPC barcode exposed" }],
  },
  manufacturerBarcodeCoverage: {
    status: "NOT_COVERED",
    coveringType: null,
    evidence: [{ imageId: "back", description: "Uncovered UPC" }],
  },
  expiryDate: {
    visibility: "VISIBLE",
    legibility: "UNCERTAIN",
    detectedValue: null,
    evidence: [{ imageId: "back", description: "Blurry expiration date" }],
  },
  handlingMarks: [],
  otherVisibleIssues: [],
};

function createMockEnrichedCheck(
  overrides: Partial<EnrichedComplianceCheck>
): EnrichedComplianceCheck {
  return {
    checkId: "chk-1",
    checkType: "MANUFACTURER_BARCODE_COVERAGE",
    checkName: "Manufacturer Barcode Coverage",
    applicability: "APPLICABLE",
    verdict: "FAIL",
    reasonCode: "REQUIREMENT_VIOLATED",
    shortReason: "Manufacturer barcode is exposed and not covered.",
    observedFact: "Exposed barcode 8906050590022",
    expectedRequirement: "Original manufacturer barcode must be completely covered",
    observationDetails: "Coverage status: NOT_COVERED, Barcode visibility: VISIBLE",
    evidence: [{ imageId: "back", description: "UPC barcode exposed" }],
    policyTitle: "Authoritative Barcode Policy",
    policySource: {
      publisher: "Amazon Fulfillment Services",
      url: "https://sellercentral.amazon.com/help/hub/reference/G200141500",
      retrievalDate: "2026-09-27",
    },
    operatorAction: "Cover the manufacturer barcode and inspect again.",
    ...overrides,
  };
}

describe("Human-First Operator Experience (Day 5 / Step 3.2)", () => {
  // Test 1: FAIL remains FAIL internally when displayed as "Fix needed"
  it("Test 1: FAIL remains FAIL internally when displayed as 'Fix needed'", () => {
    const failCheck = createMockEnrichedCheck({
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      verdict: "FAIL",
      applicability: "APPLICABLE",
    });

    const task = buildOperatorActionableTask({
      enrichedCheck: failCheck,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.ok(task, "Task should be generated for FAIL check");
    assert.equal(task.humanVerdictLabel, "Fix needed");
    assert.equal(task.internalVerdict, "FAIL");
    assert.equal(task.technical.verdict, "FAIL");
    assert.equal(VERDICT_HUMAN_MAPPING.FAIL, "Fix needed");
  });

  // Test 2: UNCERTAIN remains UNCERTAIN internally when displayed as "Need a clearer photo"
  it("Test 2: UNCERTAIN remains UNCERTAIN internally when displayed as 'Need a clearer photo'", () => {
    const uncertainCheck = createMockEnrichedCheck({
      checkType: "EXPIRY_LEGIBILITY",
      verdict: "UNCERTAIN",
      applicability: "APPLICABLE",
      reasonCode: "TEXT_ILLEGIBLE",
    });

    const task = buildOperatorActionableTask({
      enrichedCheck: uncertainCheck,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.ok(task, "Task should be generated for UNCERTAIN check");
    assert.equal(task.humanVerdictLabel, "Need a clearer photo");
    assert.equal(task.internalVerdict, "UNCERTAIN");
    assert.equal(task.technical.verdict, "UNCERTAIN");
    assert.equal(VERDICT_HUMAN_MAPPING.UNCERTAIN, "Need a clearer photo");
  });

  // Test 3: NOT_APPLICABLE is hidden from primary operator view
  it("Test 3: NOT_APPLICABLE is hidden from primary operator view", () => {
    const naCheck = createMockEnrichedCheck({
      checkType: "POLYBAG_PRESENCE",
      applicability: "NOT_APPLICABLE",
      verdict: null,
    });

    const task = buildOperatorActionableTask({
      enrichedCheck: naCheck,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.equal(task, null, "NOT_APPLICABLE check must NOT generate an actionable task");

    const passCheck = createMockEnrichedCheck({
      checkType: "POLYBAG_PRESENCE",
      applicability: "APPLICABLE",
      verdict: "PASS",
    });

    const passTask = buildOperatorActionableTask({
      enrichedCheck: passCheck,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.equal(passTask, null, "PASS check must NOT generate an actionable task");
  });

  // Test 4: Technical details remain available underneath presentation
  it("Test 4: Technical details remain fully available in technical audit container", () => {
    const check = createMockEnrichedCheck({
      checkId: "chk-audit-1",
      checkType: "MANUFACTURER_BARCODE_COVERAGE",
      verdict: "FAIL",
      reasonCode: "REQUIREMENT_VIOLATED",
      policyTitle: "Barcode Coverage Policy v2.1",
      observedFact: "Detected exposed UPC 8906050590022",
    });

    const task = buildOperatorActionableTask({
      enrichedCheck: check,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.ok(task);
    assert.equal(task.technical.checkId, "chk-audit-1");
    assert.equal(task.technical.verdict, "FAIL");
    assert.equal(task.technical.reasonCode, "REQUIREMENT_VIOLATED");
    assert.equal(task.technical.policyRule, "Barcode Coverage Policy v2.1");
    assert.equal(task.technical.publisher, "Amazon Fulfillment Services");
    assert.equal(task.technical.retrievalDate, "2026-09-27");
  });

  // Test 5: Action text cannot alter compliance result
  it("Test 5: Action text and human translation cannot alter internal compliance result", () => {
    const originalVerdict = "FAIL";
    const check = createMockEnrichedCheck({
      checkType: "POLYBAG_SEAL",
      verdict: originalVerdict,
    });

    const task = buildOperatorActionableTask({
      enrichedCheck: check,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.ok(task);
    assert.equal(task.actionTitle, "Seal the bag");
    assert.equal(task.headline, "🔴 FIX NEEDED");
    // Ensure check is not mutated
    assert.equal(check.verdict, originalVerdict);
    assert.equal(task.internalVerdict, originalVerdict);
  });

  // Test 6: Relevant evidence photo is associated with action
  it("Test 6: Relevant evidence photo slot is associated with physical action", () => {
    // Barcode check should associate with back photo
    const barcodeTask = buildOperatorActionableTask({
      enrichedCheck: createMockEnrichedCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        evidence: [{ imageId: "back", description: "UPC barcode exposed" }],
      }),
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });
    assert.ok(barcodeTask);
    assert.equal(barcodeTask.evidenceSlot, "back");
    assert.equal(barcodeTask.evidenceSlotDisplay, "BACK");

    // FNSKU check should associate with label photo
    const fnskuTask = buildOperatorActionableTask({
      enrichedCheck: createMockEnrichedCheck({
        checkType: "FNSKU_IDENTITY",
        verdict: "UNCERTAIN",
        evidence: [{ imageId: "label", description: "FNSKU label" }],
      }),
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });
    assert.ok(fnskuTask);
    assert.equal(fnskuTask.evidenceSlot, "label");
    assert.equal(fnskuTask.evidenceSlotDisplay, "LABEL");
  });

  // Test 7: No fabricated localization is shown
  it("Test 7: No fabricated bounding boxes or coordinates are created or shown", () => {
    const task = buildOperatorActionableTask({
      enrichedCheck: createMockEnrichedCheck({
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
      }),
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.ok(task);
    // Explicitly verify no bounding box or coordinates properties exist on the task object
    const taskObj = task as unknown as Record<string, unknown>;
    assert.equal(taskObj.boundingBox, undefined);
    assert.equal(taskObj.bbox, undefined);
    assert.equal(taskObj.coordinates, undefined);
    assert.equal(taskObj.polygon, undefined);
  });

  // Test 8: Multiple problems have deterministic ordering
  it("Test 8: Multiple problems have deterministic ordering (FAIL before UNCERTAIN, fixed hierarchy)", () => {
    const checks: EnrichedComplianceCheck[] = [
      createMockEnrichedCheck({
        checkId: "c-expiry",
        checkType: "EXPIRY_LEGIBILITY",
        verdict: "UNCERTAIN",
      }),
      createMockEnrichedCheck({
        checkId: "c-polybag",
        checkType: "POLYBAG_SEAL",
        verdict: "FAIL",
      }),
      createMockEnrichedCheck({
        checkId: "c-barcode",
        checkType: "MANUFACTURER_BARCODE_COVERAGE",
        verdict: "FAIL",
      }),
      createMockEnrichedCheck({
        checkId: "c-fnsku",
        checkType: "FNSKU_IDENTITY",
        verdict: "UNCERTAIN",
      }),
    ];

    const orderedTasks = getOrderedOperatorProblems({
      enrichedChecks: checks,
      workOrder: MOCK_WORK_ORDER,
      observation: MOCK_BASE_OBSERVATION,
    });

    assert.equal(orderedTasks.length, 4);

    // 1. FAIL tasks must come first
    assert.equal(orderedTasks[0].internalVerdict, "FAIL");
    assert.equal(orderedTasks[1].internalVerdict, "FAIL");
    assert.equal(orderedTasks[2].internalVerdict, "UNCERTAIN");
    assert.equal(orderedTasks[3].internalVerdict, "UNCERTAIN");

    // 2. MANUFACTURER_BARCODE_COVERAGE precedes POLYBAG_SEAL
    assert.equal(orderedTasks[0].checkType, "MANUFACTURER_BARCODE_COVERAGE");
    assert.equal(orderedTasks[1].checkType, "POLYBAG_SEAL");

    // 3. FNSKU_IDENTITY precedes EXPIRY_LEGIBILITY among UNCERTAIN
    assert.equal(orderedTasks[2].checkType, "FNSKU_IDENTITY");
    assert.equal(orderedTasks[3].checkType, "EXPIRY_LEGIBILITY");
  });

  // Test 9: Operator language dictionary matches exact requirements
  it("Test 9: Operator language dictionary matches exact requirements", () => {
    assert.equal(CHECK_HUMAN_TITLES.MANUFACTURER_BARCODE_COVERAGE, "Cover manufacturer barcode");
    assert.equal(CHECK_HUMAN_TITLES.FNSKU_IDENTITY, "Check product label");
    assert.equal(CHECK_HUMAN_TITLES.FNSKU_PLACEMENT, "Move product label");
    assert.equal(CHECK_HUMAN_TITLES.POLYBAG_SEAL, "Seal the bag");
    assert.equal(CHECK_HUMAN_TITLES.SUFFOCATION_WARNING_PRESENCE, "Add safety warning");
    assert.equal(CHECK_HUMAN_TITLES.SUFFOCATION_WARNING_LEGIBILITY, "Make warning readable");
    assert.equal(CHECK_HUMAN_TITLES.EXPIRY_VISIBILITY, "Show expiry date");
    assert.equal(CHECK_HUMAN_TITLES.EXPIRY_LEGIBILITY, "Retake expiry photo");
    assert.equal(CHECK_HUMAN_TITLES.HANDLING_MARKS, "Add required handling label");
  });

  // Test 10: Human-friendly error translation replaces technical error codes
  it("Test 10: Human-friendly error translation replaces technical error codes", () => {
    assert.equal(
      translateErrorToHuman("IMAGE_QUALITY_DEGRADED"),
      "This photo is too blurry. Take it again."
    );
    assert.equal(
      translateErrorToHuman("FNSKU_IDENTITY UNCERTAIN"),
      "We can't read the product label. Take a closer photo."
    );
    assert.equal(
      translateErrorToHuman("POLYBAG_SEAL FAIL"),
      "The bag is open. Seal it completely."
    );
  });

  // Test 11: Photo capture guidance matches requirements
  it("Test 11: Photo capture guidance matches requirements", () => {
    assert.equal(
      PHOTO_CAPTURE_GUIDANCE.front.instruction,
      "Capture the full front of the item."
    );
    assert.equal(
      PHOTO_CAPTURE_GUIDANCE.back.instruction,
      "Capture the full back and any printed dates."
    );
    assert.equal(
      PHOTO_CAPTURE_GUIDANCE.label.instruction,
      "Get close enough to clearly read the product label and barcode."
    );
  });
});
