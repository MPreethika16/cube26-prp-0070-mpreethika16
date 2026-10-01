import test from "node:test";
import assert from "node:assert/strict";
import { TenantIsolationRepository } from "@/lib/inspection/tenancy";
import { resolveWorkOrderForUnit } from "@/lib/inspection/work-order-resolver";

test("TenantIsolationRepository scopes records strictly to organization (Rule 1)", () => {
  const repo = new TenantIsolationRepository();

  const alphaUnits = repo.listUnitsForTenant("org_demo_alpha");
  const bravoUnits = repo.listUnitsForTenant("org_demo_bravo");

  assert.ok(alphaUnits.length > 0, "org_demo_alpha should have units");
  assert.ok(bravoUnits.length > 0, "org_demo_bravo should have units");

  // Zero intersection
  const alphaUnitIds = new Set(alphaUnits.map((u) => u.unitId));
  const bravoUnitIds = new Set(bravoUnits.map((u) => u.unitId));

  for (const id of alphaUnitIds) {
    assert.strictEqual(
      bravoUnitIds.has(id),
      false,
      `Unit ${id} belonging to alpha must not exist in bravo`
    );
  }

  // Cross-tenant lookup returns null
  const sampleAlphaUnit = alphaUnits[0].unitId;
  const crossLookup = repo.getUnitForTenant("org_demo_bravo", sampleAlphaUnit);
  assert.strictEqual(
    crossLookup,
    null,
    "org_demo_bravo must see 0 rows when requesting an alpha unit"
  );
});

test("resolveWorkOrderForUnit denies cross-tenant access when orgId is provided", () => {
  // UNIT-0012 belongs to org_demo_bravo in prep_sample.csv
  assert.throws(
    () => {
      resolveWorkOrderForUnit("UNIT-0012", "org_demo_alpha");
    },
    /Cross-tenant access denied/,
    "Accessing bravo unit as org_demo_alpha must throw cross-tenant access denied"
  );

  // But succeeds when matching tenant
  const wo = resolveWorkOrderForUnit("UNIT-0012", "org_demo_bravo");
  assert.strictEqual(wo.unitId, "UNIT-0012");
});

test("PostgresInspectionRepository enforces RLS across org_demo_alpha and org_demo_bravo", async () => {
  const { postgresInspectionRepository } = await import("@/lib/db/inspection-repository");
  const { randomUUID } = await import("crypto");

  const testIdA = randomUUID();
  const testIdB = randomUUID();

  const dummyRecord = (unitId: string) => ({
    inspectionId: randomUUID(),
    unitId,
    workOrderId: "WO-TEST",
    sku: "SKU-TEST",
    asin: "B0TEST",
    imageQuality: { overall: "GOOD" as const, issues: [] },
    checks: [],
    metadata: {
      inspectedAt: new Date().toISOString(),
      visionModel: "gemini-3.5-flash-lite",
      visionRequestCount: 1,
    },
  });

  // 1. Save record under org_demo_alpha
  const savedA = await postgresInspectionRepository.saveInspection("org_demo_alpha", {
    id: testIdA,
    unitId: "TEST-TENANT-A",
    workOrderId: "WO-TEST-A",
    status: "READY",
    inspectionRecord: dummyRecord("TEST-TENANT-A"),
  });
  assert.strictEqual(savedA.orgId, "org_demo_alpha");

  // 2. Save record under org_demo_bravo
  const savedB = await postgresInspectionRepository.saveInspection("org_demo_bravo", {
    id: testIdB,
    unitId: "TEST-TENANT-B",
    workOrderId: "WO-TEST-B",
    status: "STOP_AND_FIX",
    inspectionRecord: dummyRecord("TEST-TENANT-B"),
  });
  assert.strictEqual(savedB.orgId, "org_demo_bravo");

  // 3. Alpha context lookup: Alpha sees Alpha, but gets NULL for Bravo (RLS enforced)
  const lookupAlphaByAlpha = await postgresInspectionRepository.getInspectionById("org_demo_alpha", testIdA);
  assert.ok(lookupAlphaByAlpha !== null, "Alpha should be able to view Alpha record");

  const lookupBravoByAlpha = await postgresInspectionRepository.getInspectionById("org_demo_alpha", testIdB);
  assert.strictEqual(lookupBravoByAlpha, null, "RLS must block Alpha from viewing Bravo record");

  // 4. Bravo context lookup: Bravo sees Bravo, but gets NULL for Alpha
  const lookupBravoByBravo = await postgresInspectionRepository.getInspectionById("org_demo_bravo", testIdB);
  assert.ok(lookupBravoByBravo !== null, "Bravo should be able to view Bravo record");

  const lookupAlphaByBravo = await postgresInspectionRepository.getInspectionById("org_demo_bravo", testIdA);
  assert.strictEqual(lookupAlphaByBravo, null, "RLS must block Bravo from viewing Alpha record");

  // 5. Cross-tenant INSERT violation: Trying to insert Bravo row while Alpha context active throws RLS violation
  const { withTenant } = await import("@/lib/db/tenant-context");
  await assert.rejects(
    async () => {
      await withTenant("org_demo_alpha", async (client) => {
        await client.query(
          `INSERT INTO prep_inspections (id, org_id, unit_id, status, inspection_record)
           VALUES ($1, 'org_demo_bravo', 'ATTACK-UNIT', 'READY', $2)`,
          [randomUUID(), JSON.stringify(dummyRecord("ATTACK-UNIT"))]
        );
      });
    },
    /violates row-level security policy/,
    "Inserting a bravo row under alpha context must be rejected by PostgreSQL RLS WITH CHECK"
  );
});

test("/api/inspection tenant validation: missing orgId fails closed with HTTP 400", async () => {
  const { POST } = await import("@/app/api/inspection/route");
  const { NextRequest } = await import("next/server");

  // Missing orgId entirely
  const reqMissing = new NextRequest("http://localhost:3000/api/inspection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unitId: "SAMPLE-01",
      images: [
        {
          imageId: "front",
          mimeType: "image/jpeg",
          imageData: "data:image/jpeg;base64,dGVzdA==",
        },
      ],
    }),
  });

  const resMissing = await POST(reqMissing);
  assert.strictEqual(resMissing.status, 400, "Missing orgId must return HTTP 400");
  const bodyMissing = await resMissing.json();
  assert.strictEqual(bodyMissing.code, "MISSING_TENANT_CONTEXT");

  // Empty string orgId
  const reqEmpty = new NextRequest("http://localhost:3000/api/inspection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unitId: "SAMPLE-01",
      orgId: "   ",
      images: [
        {
          imageId: "front",
          mimeType: "image/jpeg",
          imageData: "data:image/jpeg;base64,dGVzdA==",
        },
      ],
    }),
  });

  const resEmpty = await POST(reqEmpty);
  assert.strictEqual(resEmpty.status, 400, "Whitespace orgId must return HTTP 400");
  const bodyEmpty = await resEmpty.json();
  assert.strictEqual(bodyEmpty.code, "MISSING_TENANT_CONTEXT");
});

test("/api/inspection tenant validation: invalid orgId fails closed with HTTP 400", async () => {
  const { POST } = await import("@/app/api/inspection/route");
  const { NextRequest } = await import("next/server");

  const invalidOrgs = ["org_attacker", "unknown_org", "org_demo_charlie", "admin"];

  for (const invalidOrg of invalidOrgs) {
    const req = new NextRequest("http://localhost:3000/api/inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: "SAMPLE-01",
        orgId: invalidOrg,
        images: [
          {
            imageId: "front",
            mimeType: "image/jpeg",
            imageData: "data:image/jpeg;base64,dGVzdA==",
          },
        ],
      }),
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, `Invalid orgId "${invalidOrg}" must return HTTP 400`);
    const body = await res.json();
    assert.strictEqual(body.code, "INVALID_TENANT_CONTEXT");
    assert.ok(Array.isArray(body.allowedOrgs));
  }
});
