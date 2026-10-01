# mpreethika16 · Prep Manager (Pod 02)

**Candidate:** MPreethika16  
**Track:** 02 · Prep Manager (Inbound Compliance & Proof of Prep)  
**Chain Position:** Step 2 of 5 (Inbound to Amazon)  
**Kill Condition:** If the vision model directly determines PASS/FAIL or hallucinates Amazon Seller Central prep policies instead of leaving deterministic evaluation to code, kill the project.

---

## Deliverables Status (6 Faces)

| Face | Deliverable | Status | Location / Artifact |
|---|---|:---:|---|
| **1** | Customer Letter, PR/FAQ, One-Pager | **COMPLETE** | [ARCHITECTURE.md](../../ARCHITECTURE.md) & [README.md](../../README.md) |
| **2** | Engineering Constraints & Rules | **COMPLETE** | [RULES.md](../../RULES.md) |
| **3** | Headless agent on fixtures | **COMPLETE** | `npm run inspection:dev`, `npm test` (337 passed) |
| **4** | Eval report (15 held-out units, 42 deterministic cases) | **COMPLETE** | `held-out-15unit-eval-results.json`, `held-out-reference-annotations.json` |
| **5** | Evidence record & operator UX | **COMPLETE** | Live Web UI (`src/app/page.tsx`), `npm run dev` |
| **6** | Cross-pod contract | **COMPLETE** | [ARCHITECTURE.md](../../ARCHITECTURE.md#5-pod-interoperability-contract-pod-01-to-pod-05) & `src/lib/evidence/` |

---

## Executive Summary & Problem Solved

Prep centers work on thin margins ($0.40–$1.10/unit). Six weeks after shipping inbound cartons to Amazon FBA, sellers receive surprise prep defect fines ($0.25–$0.75/unit) alleging missing suffocation warnings, uncovered barcodes, or exposed seams. 

Prep Manager provides **mathematically verifiable proof of preparation**:
1. **AI Observes:** Gemini extracts pure visual facts into a strict Zod schema.
2. **Deterministic Code Decides:** Pure TypeScript functions evaluate Amazon Seller Central policies against work-order intent.
3. **Evidence Record Emitted:** Cryptographically hashed image references, bounding details, and policy URLs are persisted for Recovery Manager (Pod 05) dispute claims.

---

## Evaluation Results Summary

- **Held-Out Real-World Physical Dataset:** 15 physical products, 45 original untouched photographs.
- **Reference Visual Annotation Agreement:** 116 / 122 scorable fields (**95.1% agreement** with frozen reference annotations).
- **Deterministic Compliance Benchmark:** 42 / 42 passed (**100% accuracy**).
- **Safety Incidents / False Passes on Physical Defects:** **0**.
- **Tenancy Isolation:** Scoped to `org_demo_alpha` and `org_demo_bravo` with cross-tenant access denial.

> **Note on Held-Out Products vs Operator Work Orders:**  
> PRODUCT-1 through PRODUCT-15 are evaluation-only physical products, not operator work-order Unit IDs. Their 45 original photographs form the frozen held-out vision dataset evaluated against frozen reference visual annotations. For the interactive operator workflow, use the provided Sample A/B/C work orders or another configured work-order unit. Entering PRODUCT-1 through PRODUCT-15 in the operator Unit ID field is therefore expected to return 'work order not found'.
