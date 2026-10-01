import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import {
  productionPolicySchema,
  ProductionPolicyStore,
  AMZN_BARCODE_COVERAGE_POLICY,
  AMZN_FNSKU_PLACEMENT_POLICY,
  AMZN_POLYBAG_SEAL_POLICY,
  AMZN_SUFFOCATION_WARNING_POLICY,
  AMZN_SHIPPING_BOX_SEAM_POLICY,
} from "../../src/lib/compliance/policy";

describe("Day 3 Step 2.1: Policy Provenance Hardening", () => {
  // --------------------------------------------------------------------------
  // 1. Valid Production Policy & Provenance Tests
  // --------------------------------------------------------------------------
  describe("1. Valid production policy & provenance", () => {
    it("successfully validates verified Amazon barcode coverage policy with sourceReference", () => {
      const policy = productionPolicySchema.parse(AMZN_BARCODE_COVERAGE_POLICY);

      assert.equal(policy.policyId, "AMZN-POL-BARCODE-COVERAGE-2026");
      assert.equal(policy.checkType, "MANUFACTURER_BARCODE_COVERAGE");
      assert.equal(policy.status, "ACTIVE");
      assert.equal(policy.scope, "UNIT_LEVEL_PREP");
      assert.equal(policy.retrievedAt, "2026-09-27T00:00:00.000Z");

      // Verify structured sourceReference
      assert.ok(policy.sourceReference);
      assert.equal(
        policy.sourceReference.section,
        "FBA Product Barcode Requirements"
      );
      assert.match(
        policy.sourceReference.evidenceNote,
        /Amazon requires covering, removing, or rendering unscannable/
      );

      // Verify A, B, C structural separation
      assert.equal(
        policy.semantics.checkType,
        "MANUFACTURER_BARCODE_COVERAGE"
      );
      if (policy.semantics.checkType === "MANUFACTURER_BARCODE_COVERAGE") {
        assert.equal(
          policy.semantics.applicability.trigger,
          "EXTERNAL_SCANNABLE_BARCODE_REQUIRED"
        );
        assert.equal(
          policy.semantics.evaluation.existingBarcodeAction,
          "COVER_REMOVE_OR_RENDER_UNSCANNABLE"
        );
        assert.equal(policy.semantics.evaluation.coverageRequired, true);
      }

      // Verify visual limitation guardrail
      assert.equal(
        policy.verificationLimitations.nonDetectionProvesCompliance,
        false
      );
      assert.equal(
        policy.verificationLimitations.visualVerifiability,
        "PARTIAL"
      );
    });

    it("successfully validates verified Amazon FNSKU placement policy with sourceReference", () => {
      const policy = productionPolicySchema.parse(AMZN_FNSKU_PLACEMENT_POLICY);

      assert.equal(policy.policyId, "AMZN-POL-FNSKU-PLACEMENT-2026");
      assert.equal(policy.checkType, "FNSKU_PLACEMENT");
      assert.equal(policy.status, "ACTIVE");
      assert.equal(policy.scope, "UNIT_LEVEL_PREP");
      assert.equal(policy.retrievedAt, "2026-09-27T00:00:00.000Z");

      assert.ok(policy.sourceReference);
      assert.equal(
        policy.sourceReference.section,
        "FBA Label Products Guidelines"
      );

      assert.equal(policy.semantics.checkType, "FNSKU_PLACEMENT");
      if (policy.semantics.checkType === "FNSKU_PLACEMENT") {
        assert.deepEqual(policy.semantics.evaluation.allowedPlacements, [
          "FLAT_SURFACE",
        ]);
        assert.deepEqual(policy.semantics.evaluation.prohibitedPlacements, [
          "CURVED_SURFACE",
          "OBSTRUCTED",
        ]);
        assert.equal(
          policy.semantics.evaluation.avoidCornersEdgesCurves,
          true
        );
      }
    });

    it("successfully validates verified Amazon polybag seal policy", () => {
      const policy = productionPolicySchema.parse(AMZN_POLYBAG_SEAL_POLICY);

      assert.equal(policy.policyId, "AMZN-POL-POLYBAG-SEAL-2026");
      assert.equal(policy.checkType, "POLYBAG_SEAL");
      assert.ok(policy.sourceReference);

      assert.equal(policy.semantics.checkType, "POLYBAG_SEAL");
      if (policy.semantics.checkType === "POLYBAG_SEAL") {
        assert.equal(
          policy.semantics.evaluation.requiredClosure,
          "COMPLETELY_SEALED"
        );
      }

      assert.equal(
        policy.verificationLimitations.nonDetectionProvesCompliance,
        false
      );
    });

    it("successfully validates verified Amazon suffocation warning policy", () => {
      const policy = productionPolicySchema.parse(
        AMZN_SUFFOCATION_WARNING_POLICY
      );

      assert.equal(policy.policyId, "AMZN-POL-SUFFOCATION-WARN-2026");
      assert.equal(policy.checkType, "SUFFOCATION_WARNING_PRESENCE");
      assert.ok(policy.sourceReference);

      assert.equal(
        policy.semantics.checkType,
        "SUFFOCATION_WARNING_PRESENCE"
      );
      if (policy.semantics.checkType === "SUFFOCATION_WARNING_PRESENCE") {
        assert.equal(policy.semantics.applicability.minOpeningInchesFlat, 5);
        assert.equal(
          policy.semantics.applicability.requiresStructuredMeasurement,
          true
        );
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Source Claim Traceability & Rejection Tests
  // --------------------------------------------------------------------------
  describe("2. Source claim traceability & rejection", () => {
    it("rejects an ACTIVE policy if sourceReference is missing", () => {
      const missingSourceRef = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        sourceReference: undefined,
      };

      assert.throws(
        () => productionPolicySchema.parse(missingSourceRef),
        (err) => {
          assert(err instanceof ZodError);
          const issue = err.issues.find((i) =>
            i.path.includes("sourceReference")
          );
          assert.ok(issue);
          assert.match(
            issue.message,
            /Active production policies must provide a sourceReference/
          );
          return true;
        }
      );
    });

    it("rejects a policy if evidenceNote is empty", () => {
      const emptyEvidenceNote = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        sourceReference: {
          section: "FBA Product Barcode Requirements",
          evidenceNote: "", // empty
        },
      };

      assert.throws(
        () => productionPolicySchema.parse(emptyEvidenceNote),
        (err) => {
          assert(err instanceof ZodError);
          const issue = err.issues.find((i) =>
            i.path.includes("evidenceNote")
          );
          assert.ok(issue);
          assert.match(issue.message, /evidenceNote must not be empty/);
          return true;
        }
      );
    });

    it("rejects policy with missing sourceUrl", () => {
      const invalid = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        sourceUrl: undefined,
      };

      assert.throws(
        () => productionPolicySchema.parse(invalid),
        (err) => err instanceof ZodError
      );
    });

    it("rejects policy with invalid sourceUrl format", () => {
      const invalid = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        sourceUrl: "not-a-valid-http-url",
      };

      assert.throws(
        () => productionPolicySchema.parse(invalid),
        (err) => {
          assert(err instanceof ZodError);
          const urlIssue = err.issues.find((i) => i.path.includes("sourceUrl"));
          assert.ok(urlIssue);
          return true;
        }
      );
    });

    it("rejects policy with missing or empty publisher", () => {
      const invalid = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        publisher: "",
      };

      assert.throws(
        () => productionPolicySchema.parse(invalid),
        (err) => err instanceof ZodError
      );
    });

    it("rejects policy with missing retrievedAt timestamp", () => {
      const invalid = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        retrievedAt: "invalid-date",
      };

      assert.throws(
        () => productionPolicySchema.parse(invalid),
        (err) => err instanceof ZodError
      );
    });

    it("rejects policy with missing sourceNote", () => {
      const invalid = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        sourceNote: "",
      };

      assert.throws(
        () => productionPolicySchema.parse(invalid),
        (err) => err instanceof ZodError
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Unsupported Semantic & Guardrail Tests
  // --------------------------------------------------------------------------
  describe("3. Unsupported semantic & guardrails", () => {
    it("rejects policy when checkType does not match semantics checkType", () => {
      const mismatched = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        checkType: "FNSKU_PLACEMENT",
      };

      assert.throws(
        () => productionPolicySchema.parse(mismatched),
        (err) => {
          assert(err instanceof ZodError);
          const issue = err.issues.find((i) => i.path.includes("checkType"));
          assert.ok(issue);
          assert.match(issue.message, /does not match/);
          return true;
        }
      );
    });

    it("rejects policy with unsupported placement surface", () => {
      const invalidSurface = {
        ...AMZN_FNSKU_PLACEMENT_POLICY,
        semantics: {
          ...AMZN_FNSKU_PLACEMENT_POLICY.semantics,
          evaluation: {
            ...AMZN_FNSKU_PLACEMENT_POLICY.semantics.evaluation,
            allowedPlacements: ["FLOATING_IN_AIR"],
          },
        },
      };

      assert.throws(
        () => productionPolicySchema.parse(invalidSurface),
        (err) => err instanceof ZodError
      );
    });

    it("rejects policy attempting to claim that NOT_DETECTED proves compliance", () => {
      const invalidLimitation = {
        ...AMZN_BARCODE_COVERAGE_POLICY,
        verificationLimitations: {
          ...AMZN_BARCODE_COVERAGE_POLICY.verificationLimitations,
          nonDetectionProvesCompliance: true,
        },
      };

      assert.throws(
        () => productionPolicySchema.parse(invalidLimitation),
        (err) => err instanceof ZodError
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Unverified Policy Cannot Behave as Active Production Policy
  // --------------------------------------------------------------------------
  describe("4. Unverified policy cannot behave as active production policy", () => {
    it("refuses to return unverified policy when querying active policies", () => {
      const store = new ProductionPolicyStore();

      store.registerPolicy(AMZN_SHIPPING_BOX_SEAM_POLICY);

      const retrieved = store.getPolicyById(
        "AMZN-POL-SHIPPING-BOX-SEAM-2026"
      );
      assert.ok(retrieved);
      assert.equal(retrieved.status, "UNVERIFIED");

      // getActivePolicy MUST return undefined for UNVERIFIED policy
      const activeUnit = store.getActivePolicy(
        "FNSKU_PLACEMENT",
        "UNIT_LEVEL_PREP"
      );
      assert.equal(activeUnit, undefined);

      const activeBox = store.getActivePolicy(
        "FNSKU_PLACEMENT",
        "SHIPPING_BOX_PREP"
      );
      assert.equal(activeBox, undefined);

      assert.equal(store.listActivePolicies().length, 0);
      assert.equal(store.listAllPolicies().length, 1);
    });

    it("does not silently upgrade unverified policy to active", () => {
      const store = new ProductionPolicyStore([
        AMZN_FNSKU_PLACEMENT_POLICY,
        AMZN_SHIPPING_BOX_SEAM_POLICY,
      ]);

      const active = store.getActivePolicy(
        "FNSKU_PLACEMENT",
        "UNIT_LEVEL_PREP"
      );
      assert.ok(active);
      assert.equal(active.policyId, "AMZN-POL-FNSKU-PLACEMENT-2026");
      assert.equal(active.status, "ACTIVE");

      const boxActive = store.getActivePolicy(
        "FNSKU_PLACEMENT",
        "SHIPPING_BOX_PREP"
      );
      assert.equal(boxActive, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Provenance Survives Storage and Retrieval
  // --------------------------------------------------------------------------
  describe("5. Provenance survives storage and retrieval", () => {
    it("preserves complete source provenance and sourceReference end-to-end", () => {
      const store = new ProductionPolicyStore([AMZN_BARCODE_COVERAGE_POLICY]);

      const policy = store.getActivePolicy("MANUFACTURER_BARCODE_COVERAGE");
      assert.ok(policy);

      assert.equal(policy.policyId, "AMZN-POL-BARCODE-COVERAGE-2026");
      assert.equal(policy.version, "2026.1");
      assert.equal(policy.publisher, "Amazon Seller Central");
      assert.equal(
        policy.sourceUrl,
        "https://sellercentral.amazon.com/help/hub/reference/G200141490"
      );
      assert.equal(policy.retrievedAt, "2026-09-27T00:00:00.000Z");
      assert.match(policy.sourceNote, /FBA Product Barcode Requirements/);
      assert.equal(policy.status, "ACTIVE");

      // Structured sourceReference survives intact
      assert.ok(policy.sourceReference);
      assert.equal(
        policy.sourceReference.section,
        "FBA Product Barcode Requirements"
      );
      assert.match(
        policy.sourceReference.evidenceNote,
        /Amazon requires covering, removing, or rendering unscannable/
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Seam Rule is NOT Encoded as Authoritative FNSKU Placement Policy
  // --------------------------------------------------------------------------
  describe("6. Seam rule is NOT encoded as authoritative FNSKU placement policy", () => {
    it("verified unit-level FNSKU placement policy does NOT prohibit ACROSS_SEAM", () => {
      assert.equal(AMZN_FNSKU_PLACEMENT_POLICY.scope, "UNIT_LEVEL_PREP");
      assert.equal(
        AMZN_FNSKU_PLACEMENT_POLICY.semantics.checkType,
        "FNSKU_PLACEMENT"
      );
      if (
        AMZN_FNSKU_PLACEMENT_POLICY.semantics.checkType === "FNSKU_PLACEMENT"
      ) {
        assert.equal(
          AMZN_FNSKU_PLACEMENT_POLICY.semantics.evaluation.prohibitedPlacements.includes(
            "ACROSS_SEAM"
          ),
          false
        );
      }
    });

    it("strictly rejects encoding ACROSS_SEAM as prohibited for unit-level FNSKU labels", () => {
      const invalidUnitSeamPolicy = {
        ...AMZN_FNSKU_PLACEMENT_POLICY,
        policyId: "INVALID-UNIT-SEAM-RULE",
        semantics: {
          ...AMZN_FNSKU_PLACEMENT_POLICY.semantics,
          evaluation: {
            ...AMZN_FNSKU_PLACEMENT_POLICY.semantics.evaluation,
            prohibitedPlacements: ["ACROSS_SEAM", "CURVED_SURFACE"],
          },
        },
      };

      assert.throws(
        () => productionPolicySchema.parse(invalidUnitSeamPolicy),
        (err) => {
          assert(err instanceof ZodError);
          const seamIssue = err.issues.find((i) =>
            i.path.includes("prohibitedPlacements")
          );
          assert.ok(seamIssue);
          assert.match(
            seamIssue.message,
            /ACROSS_SEAM must NOT be encoded as a prohibited placement for unit-level FNSKU labels/
          );
          return true;
        }
      );
    });

    it("permits seam prohibition ONLY when scope is explicitly shipping box labels", () => {
      assert.equal(AMZN_SHIPPING_BOX_SEAM_POLICY.scope, "SHIPPING_BOX_PREP");
      assert.equal(
        AMZN_SHIPPING_BOX_SEAM_POLICY.semantics.checkType,
        "FNSKU_PLACEMENT"
      );
      if (
        AMZN_SHIPPING_BOX_SEAM_POLICY.semantics.checkType === "FNSKU_PLACEMENT"
      ) {
        assert.ok(
          AMZN_SHIPPING_BOX_SEAM_POLICY.semantics.evaluation.prohibitedPlacements.includes(
            "ACROSS_SEAM"
          )
        );
      }
      assert.equal(AMZN_SHIPPING_BOX_SEAM_POLICY.status, "UNVERIFIED");
    });
  });
});
