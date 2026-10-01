import { Client } from "pg";
import { randomUUID } from "crypto";

interface RlsTestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const APP_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  "postgresql://prep_app:prep_app_secure_pass_2026@localhost:5434/prep_manager";

const ADMIN_CONNECTION_STRING =
  process.env.DATABASE_ADMIN_URL ||
  "postgresql://prep_admin:prep_admin_secure_pass_2026@localhost:5434/prep_manager";

async function runRlsVerification() {
  console.log("================================================================================");
  console.log("CUBE 2026 PREP MANAGER — POSTGRESQL ROW-LEVEL SECURITY (RLS) VERIFICATION");
  console.log("================================================================================");
  console.log(`Connecting to: ${APP_CONNECTION_STRING.replace(/:[^:@]+@/, ":****@")}\n`);

  const results: RlsTestResult[] = [];

  // PHASE 9: Verify PostgreSQL Catalog System Values
  const adminClient = new Client({ connectionString: ADMIN_CONNECTION_STRING });
  try {
    await adminClient.connect();

    // Check table RLS catalog properties
    const rlsCatalogRes = await adminClient.query(`
      SELECT 
        relname, 
        relrowsecurity, 
        relforcerowsecurity
      FROM pg_class
      WHERE relname = 'prep_inspections';
    `);

    const tableMeta = rlsCatalogRes.rows[0];
    const relrowsecurity = tableMeta?.relrowsecurity === true;
    const relforcerowsecurity = tableMeta?.relforcerowsecurity === true;

    console.log("[PostgreSQL Catalog] prep_inspections:");
    console.log(`  - relrowsecurity (ENABLED):  ${relrowsecurity}`);
    console.log(`  - relforcerowsecurity (FORCED): ${relforcerowsecurity}`);

    results.push({
      name: "Catalog: relrowsecurity = true (RLS Enabled)",
      passed: relrowsecurity,
    });
    results.push({
      name: "Catalog: relforcerowsecurity = true (RLS Forced)",
      passed: relforcerowsecurity,
    });

    // Check application role privileges
    const roleCatalogRes = await adminClient.query(`
      SELECT 
        rolname, 
        rolsuper, 
        rolbypassrls 
      FROM pg_roles 
      WHERE rolname = 'prep_app';
    `);

    const roleMeta = roleCatalogRes.rows[0];
    const rolsuper = roleMeta?.rolsuper === false;
    const rolbypassrls = roleMeta?.rolbypassrls === false;

    console.log("\n[PostgreSQL Catalog] prep_app role:");
    console.log(`  - rolsuper (NOT SUPERUSER): ${rolsuper}`);
    console.log(`  - rolbypassrls (NO BYPASSRLS): ${rolbypassrls}\n`);

    results.push({
      name: "Catalog: prep_app rolsuper = false (Non-Superuser)",
      passed: rolsuper,
    });
    results.push({
      name: "Catalog: prep_app rolbypassrls = false (Cannot Bypass RLS)",
      passed: rolbypassrls,
    });

    // Clean existing test rows
    await adminClient.query("DELETE FROM prep_inspections WHERE unit_id LIKE 'TEST-RLS-%'");
  } catch (err: unknown) {
    console.error("Admin catalog check failed:", err);
  } finally {
    await adminClient.end();
  }

  // PHASE 7 & 8: Real RLS Operations via constrained prep_app role
  const client = new Client({ connectionString: APP_CONNECTION_STRING });
  await client.connect();

  try {
    const idA1 = randomUUID();
    const idB1 = randomUUID();

    const dummyRecord = (unitId: string) =>
      JSON.stringify({
        unitId,
        metadata: { inspectedAt: new Date().toISOString(), visionModel: "gemini-3.5-flash-lite" },
        checks: [],
      });

    // TEST 1: INSERT Alpha row under Alpha context
    let insertAlphaPassed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_alpha"]);
      await client.query(
        `INSERT INTO prep_inspections (id, org_id, unit_id, status, inspection_record)
         VALUES ($1, 'org_demo_alpha', 'TEST-RLS-A1', 'READY', $2)`,
        [idA1, dummyRecord("TEST-RLS-A1")]
      );
      await client.query("COMMIT");
      insertAlphaPassed = true;
    } catch {
      await client.query("ROLLBACK");
    }
    results.push({ name: "Alpha context → INSERT Alpha row: ALLOWED", passed: insertAlphaPassed });

    // TEST 2: INSERT Bravo row under Bravo context
    let insertBravoPassed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_bravo"]);
      await client.query(
        `INSERT INTO prep_inspections (id, org_id, unit_id, status, inspection_record)
         VALUES ($1, 'org_demo_bravo', 'TEST-RLS-B1', 'STOP_AND_FIX', $2)`,
        [idB1, dummyRecord("TEST-RLS-B1")]
      );
      await client.query("COMMIT");
      insertBravoPassed = true;
    } catch {
      await client.query("ROLLBACK");
    }
    results.push({ name: "Bravo context → INSERT Bravo row: ALLOWED", passed: insertBravoPassed });

    // TEST 3: Cross-tenant attack - INSERT Bravo row while Alpha context active
    let crossInsertBlocked = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_alpha"]);
      await client.query(
        `INSERT INTO prep_inspections (id, org_id, unit_id, status, inspection_record)
         VALUES ($1, 'org_demo_bravo', 'TEST-RLS-ATTACK', 'READY', $2)`,
        [randomUUID(), dummyRecord("TEST-RLS-ATTACK")]
      );
      await client.query("COMMIT");
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      // Must be rejected by WITH CHECK violation
      const msg = err instanceof Error ? err.message : String(err);
      crossInsertBlocked = msg.includes("violates row-level security policy");
    }
    results.push({
      name: "Alpha context → INSERT Bravo row (Cross-tenant spoof): BLOCKED by RLS",
      passed: crossInsertBlocked,
    });

    // TEST 4: Alpha context queries
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_alpha"]);
    const alphaQueryA = await client.query("SELECT * FROM prep_inspections WHERE id = $1", [idA1]);
    const alphaQueryB = await client.query("SELECT * FROM prep_inspections WHERE id = $1", [idB1]);
    const alphaQueryAll = await client.query("SELECT org_id FROM prep_inspections WHERE unit_id LIKE 'TEST-RLS-%'");
    await client.query("COMMIT");

    results.push({
      name: "Alpha context → SELECT Alpha row: VISIBLE",
      passed: alphaQueryA.rowCount === 1,
    });
    results.push({
      name: "Alpha context → SELECT Bravo row: ZERO ROWS (BLOCKED)",
      passed: alphaQueryB.rowCount === 0,
    });
    results.push({
      name: "Alpha context → SELECT all rows: CONTAINS ONLY Alpha",
      passed: alphaQueryAll.rows.every((r) => r.org_id === "org_demo_alpha"),
    });

    // TEST 5: Bravo context queries
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_bravo"]);
    const bravoQueryB = await client.query("SELECT * FROM prep_inspections WHERE id = $1", [idB1]);
    const bravoQueryA = await client.query("SELECT * FROM prep_inspections WHERE id = $1", [idA1]);
    await client.query("COMMIT");

    results.push({
      name: "Bravo context → SELECT Bravo row: VISIBLE",
      passed: bravoQueryB.rowCount === 1,
    });
    results.push({
      name: "Bravo context → SELECT Alpha row: ZERO ROWS (BLOCKED)",
      passed: bravoQueryA.rowCount === 0,
    });

    // TEST 6: Cross-tenant UPDATE & DELETE under Alpha context
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_alpha"]);
    const crossUpdate = await client.query("UPDATE prep_inspections SET status = 'TAMPERED' WHERE id = $1", [idB1]);
    const crossDelete = await client.query("DELETE FROM prep_inspections WHERE id = $1", [idB1]);
    await client.query("COMMIT");

    results.push({
      name: "Alpha context → UPDATE Bravo row: 0 ROWS AFFECTED (BLOCKED)",
      passed: crossUpdate.rowCount === 0,
    });
    results.push({
      name: "Alpha context → DELETE Bravo row: 0 ROWS AFFECTED (BLOCKED)",
      passed: crossDelete.rowCount === 0,
    });

    // TEST 7: NO TENANT CONTEXT (unauthenticated access)
    // When app.current_org_id is unset or empty, RLS must deny all row access
    await client.query("BEGIN");
    // Ensure app.current_org_id is reset/empty
    await client.query("SELECT set_config('app.current_org_id', '', true)");
    const unauthSelect = await client.query("SELECT * FROM prep_inspections WHERE unit_id LIKE 'TEST-RLS-%'");
    await client.query("COMMIT");

    results.push({
      name: "No tenant context (Unauthenticated) → SELECT: ZERO ROWS",
      passed: unauthSelect.rowCount === 0,
    });

    // TEST 8: Connection Pool Isolation Test (Reverting session state)
    // Run Alpha transaction, commit, then query without setting orgId in same connection
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", ["org_demo_alpha"]);
    await client.query("COMMIT");

    // Outside transaction, setting must have reverted (is_local = true)
    const leakedSettingRes = await client.query("SELECT current_setting('app.current_org_id', true) as val");
    const leakedVal = leakedSettingRes.rows[0]?.val;
    const poolSafe = !leakedVal || leakedVal === "";

    results.push({
      name: "Connection Pool Reversion (SET LOCAL resets on COMMIT): PASS",
      passed: poolSafe,
      details: poolSafe ? "Setting cleared after transaction" : `Leaked value: ${leakedVal}`,
    });
  } finally {
    await client.end();
  }

  // Print Summary Table
  console.log("--------------------------------------------------------------------------------");
  console.log("TEST VERIFICATION REPORT:");
  console.log("--------------------------------------------------------------------------------");
  let passedCount = 0;
  for (const r of results) {
    const symbol = r.passed ? "✔ PASS" : "✖ FAIL";
    if (r.passed) passedCount++;
    console.log(`${symbol} | ${r.name}`);
    if (r.details) {
      console.log(`       └─ ${r.details}`);
    }
  }

  console.log("================================================================================");
  console.log(`RLS RESULT: ${passedCount}/${results.length} PASS`);
  console.log(passedCount === results.length ? "ZERO CROSS-TENANT ROW LEAKAGE (Rule 1 Verified)" : "FAILURES DETECTED");
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runRlsVerification().catch((err) => {
  console.error("FATAL: RLS test runner crashed:", err);
  process.exit(1);
});
