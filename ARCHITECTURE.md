# Prep Manager — System Architecture

**Cube Buildathon · Round 2 · Step 2 of 5 (Inbound Prep Compliance)**

---

## 1. Architectural Philosophy: "AI Observes, Deterministic Code Decides"

Prep Manager audits physical product units preparing for Amazon FBA inbound shipment to prevent $0.40–$1.10 per-unit prep defect chargebacks. 

Typical multimodal LLM implementations fail in production warehouses because they ask models to directly decide compliance (e.g. *"Does this meet Amazon polybag rules?"*). This leads to hallucinated policies, non-reproducible verdicts, and catastrophic false passes on uninspected surfaces.

Prep Manager enforces a strict architectural boundary:
```text
  Unit + Work Order
          ↓
  Evidence Capture (3 images)
          ↓
  Evidence Quality Gate (Resolution, Sharpness, Exposure)
          ↓
  One Batched Multimodal Observation (Gemini 2.5 Flash / Flash Lite)
  [Extracts ONLY factual visual attributes: VISIBLE, NOT_DETECTED, UNCERTAIN]
          ↓
  Structured Zod Schema Validation
          ↓
  Work-Order Requirement Resolution (Tri-State: REQUIRED, NOT_REQUIRED, UNKNOWN)
          ↓
  Authoritative Channel Policy Lookup (10 Amazon Seller Central Published Rules)
          ↓
  Deterministic Compliance Evaluator (Pure TypeScript Functions)
          ↓
  Operational Status Aggregation (READY / STOP_AND_FIX / REVIEW_REQUIRED)
          ↓
  Recovery Planning & Operator UI (Targeted Recapture or Correction)
```

---

## 2. Component Diagram & Pipeline Trace

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        EDGE / CLIENT UI                                │
│   - Image Capture Slots (front, back, label)                           │
│   - Client-side Laplacian blur & exposure readiness check             │
│   - Context contamination guard (unitId vs workOrder binding)          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ POST /api/inspection
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   INSPECTION ORCHESTRATION LAYER                       │
│                                                                        │
│  1. Tenant & Work Order Resolver:                                      │
│     - Scoped strictly to calling organization (Rule 1)                 │
│     - Resolves work order intent from authoritative catalog            │
│                                                                        │
│  2. Multimodal Perception Engine:                                      │
│     - Single batched API call to Gemini (Rule 2)                       │
│     - Structured schema validation (prepUnitObservationSchema)         │
│     - Fail-open fallback to REVIEW_REQUIRED on timeout/error (Rule 3)  │
│                                                                        │
│  3. Deterministic Decision Engine:                                     │
│     - Pure functions: f(Observation, WorkOrder, Policy) -> Verdict     │
│     - UNCERTAIN != PASS, UNCERTAIN != FAIL (Rule 4)                    │
│     - Authoritative Seller Central lookup (Rule 5)                     │
│                                                                        │
│  4. Operational Aggregator & Recovery Planner:                         │
│     - Maps check verdicts to READY / STOP_AND_FIX / REVIEW_REQUIRED    │
│     - Generates slot-targeted recapture instructions for UNCERTAIN     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   IMMUTABLE EVIDENCE RECORD                            │
│  - unit_id, org_id, work_order_id, inspection_id, timestamp           │
│  - Input image hashes (SHA-256)                                        │
│  - Structured visual observations                                      │
│  - 10 check evaluations with rule IDs and Seller Central URLs          │
│  - Append-only human override and reinspection audit history (Rule 6)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Safety Invariants

1. **Non-Detection is Never Physical Absence:** `NOT_DETECTED` means "not visible in supplied camera angles", never "item does not have X". A missing barcode in photos triggers evidence recovery, not a false pass.
2. **Uncertainty is First-Class (Rule 4):** Any check with degraded clarity, glare, or boundary truncation evaluates to `UNCERTAIN`. It can never evaluate to `PASS` or physical `FAIL`.
3. **Fail-Open Resilience (Rule 3):** Upstream model rate limits (429), timeouts, or network outages automatically fall open to an operational `REVIEW_REQUIRED` record with targeted recovery actions. The warehouse conveyor never halts on a 500 error.
4. **No LLM Policy Recall (Rule 5):** The model prompt strictly prohibits compliance judgments. All rules are loaded from `src/lib/compliance/policy/production-policies.ts` with explicit Amazon Seller Central URLs.
5. **Human Overrides are Append-Only Data (Rule 6):** Overrides and reinspection passes never overwrite the original machine observation; they create a new linked audit record with operator ID and justification.

---

## 4. Multi-Tenant Architecture & Data Isolation (Rule 1)

Prep Manager implements a genuine dual-layer **Defense-in-Depth** tenancy model:

### Layer 1: Application-Level Tenant Validation
- Handled via `TenantIsolationRepository` in `src/lib/inspection/tenancy.ts` and `resolveWorkOrderForUnit` in `src/lib/inspection/work-order-resolver.ts`.
- Validates organization context (`org_demo_alpha` vs `org_demo_bravo`) before pipeline execution.
- Cross-tenant requests are rejected at the application gateway with `Cross-tenant access denied`.

### Layer 2: Native PostgreSQL Row-Level Security (RLS)
- Handled at the database engine level in Docker PostgreSQL 16 (`prep_manager_db`).
- **Table:** `prep_inspections` with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **Policy:** `tenant_isolation_policy` enforces:
  ```sql
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), ''))
  ```
- **Transaction-Scoped Tenant Context:** Uses `SET LOCAL app.current_org_id = $1` inside `withTenant()`. Because it is `LOCAL`, the setting automatically reverts on `COMMIT` or `ROLLBACK`. No tenant-context leakage was observed in the pooled-connection isolation test.
- **Dedicated Application Role:** Runtime and integration tests connect as `prep_app`, which:
  - Is **NOT** superuser (`rolsuper = false`)
  - Does **NOT** have `BYPASSRLS` (`rolbypassrls = false`)
  - Does **NOT** own the protected table
- **Unauthenticated Protection:** Any query executed without `app.current_org_id` returns 0 rows.

### Judge Verification Command
Judges can verify both PostgreSQL catalog security flags and live cross-tenant access denial with one command:
```bash
npm run test:rls
```
This tests:
1. `relrowsecurity = true` and `relforcerowsecurity = true`
2. `rolsuper = false` and `rolbypassrls = false`
3. Cross-tenant SELECT, INSERT, UPDATE, and DELETE blocking
4. Zero-row unauthenticated isolation
5. Connection pool context clearing on transaction completion

---

## 5. Pod Interoperability Contract (Pod 01 to Pod 05)

Prep Manager receives input from **Pod 01 (Receiving)** and produces an evidence record consumed by **Pod 05 (Recovery Manager)**:
- **Upstream Input Contract:** Accepts `WorkOrderSpecification` and unit image references from inbound receiving.
- **Downstream Output Contract:** Emits `PrepInspectionRecord` containing verified check statuses, failure reason codes, Seller Central policy citations, and recovery instructions. If Amazon assesses a prep defect fee 6 weeks later, Pod 05 uses this cryptographic proof to file an automated dispute claim.
