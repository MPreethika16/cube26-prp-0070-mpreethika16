# Prep Manager — Evaluation Evidence Index

This directory serves as the evaluator-facing navigation index for all empirical evaluation artifacts, benchmarks, and security verification suites across the Prep Manager repository.

> [!NOTE]
> All evaluation data files are persisted at their canonical root locations to maintain frozen script reproducibility and reference integrity.

---

## 1. Summary of Measured Results

| Evaluation Domain | Evidence Dataset | Result / Verified Metric |
| :--- | :--- | :--- |
| **Held-Out Vision Observation** | 15 unseen physical products / 45 original images | **95.1% agreement** across 122 scorable observations (116/122 scorable fields agreed with reference visual annotations) |
| **Deterministic Compliance Engine** | 42 labeled compliance test cases | **42/42 pass (100.0% accuracy)**, 0 false PASS, 0 false FAIL |
| **PostgreSQL Database RLS (Rule 1)** | 16 catalog, cross-tenant attack & connection pool tests | **16/16 pass**, zero observed cross-tenant row leakage |
| **Full Automated Regression Suite** | 49 test suites covering vision, compliance, recovery, tenancy | **340/340 pass (0 failures)** |

---

## 2. Evaluation Evidence Artifacts

### A. Held-Out Real-World Physical Evaluation
- **Results File:** [`../held-out-15unit-eval-results.json`](../held-out-15unit-eval-results.json)
  - **Scope:** 15 previously unseen physical retail products, 45 original untouched photographs.
  - **Findings:** 116 agreed fields out of 122 scorable observations (**95.1% agreement** with frozen reference visual annotations).
  - **Measured Limitation:** This metric reflects agreement with reference visual annotations on this 15-product sample; it must **not** be characterized as universal AI accuracy.
- **Reference Annotations File:** [`../held-out-reference-annotations.json`](../held-out-reference-annotations.json)
  - **Scope:** Frozen reference visual annotations for the 15 held-out products across packaging, labeling, barcodes, and warnings.
  - **Transparency Disclosure:** These annotations represent frozen reference visual annotations and **do not constitute dual-independent-human ground truth** (no Cohen's kappa or independent multi-annotator validation is claimed).
- **Cryptographic Hash & Integrity Audit:** [`../dataset-integrity-report.json`](../dataset-integrity-report.json)
  - Contains image resolutions, aspect ratios, and SHA-256 cryptographic hashes for all 45 physical photographs, proving absence of duplicate files.

### B. Development Validation & Adversarial Evaluations
- **Real Physical Development Units Output:** [`../real-4unit-evaluation-output.json`](../real-4unit-evaluation-output.json)
  - Empirical run output for 4 physical products (`UNIT-0001`, `UNIT-0002`, `REAL-PACKAGE-001`, `REAL-PHONE-001`) evaluated during system development.
  - Maintained strictly separate from the 15-product held-out set.
- **Multimodal Stress & Robustness Evaluation:** [`../stress-test-results.json`](../stress-test-results.json)
  - Results of running Gemini vision against 6 synthetic/adversarial image degradation conditions (moderate blur, severe blur, partial crop, glare occlusion, low contrast, partial label).

### C. Deterministic Compliance Benchmark
- **Dataset Definition:** [`../src/lib/evaluation/evaluation-dataset.ts`](../src/lib/evaluation/evaluation-dataset.ts)
  - 42 deterministic cases covering all Amazon Seller Central prep policies (FNSKU identity/placement, polybag presence/sealing, suffocation warning presence/legibility, barcode coverage, expiration dates, handling marks).
  - Executable via:
    ```bash
    npm run evaluate
    ```

### D. PostgreSQL Row-Level Security (RLS) Verification
- **Verification Script:** [`../scripts/test-rls.ts`](../scripts/test-rls.ts)
  - Standalone script querying PostgreSQL system catalogs (`relrowsecurity = true`, `relforcerowsecurity = true`, `rolsuper = false`, `rolbypassrls = false`) and attempting cross-tenant SELECT, INSERT, UPDATE, DELETE, and connection pool reuse attacks.
  - Executable via:
    ```bash
    npm run test:rls
    ```
