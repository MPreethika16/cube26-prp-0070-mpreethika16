# Fixtures Catalog & Evidence Classification

This directory contains photographic fixtures utilized by the Prep Manager pipeline.

> [!IMPORTANT]
> **EVIDENCE INTEGRITY NOTICE:**
> To prevent evaluation contamination, fixtures are strictly partitioned into three mutually exclusive categories. Evaluators must distinguish between **real physical held-out evidence**, **development/demo fixtures**, and **synthetic stress cases**.

---

## 1. `fixtures/prep/real/` — Frozen Held-Out Real Evidence
- **Contents:** 15 previously unseen physical retail products (`PRODUCT-1` through `PRODUCT-15`), totaling 45 original photographs (front, back, label).
- **Classification:** **Authentic physical evidence** used exclusively for final held-out visual observation evaluation.
- **Integrity Rule:** **FROZEN.** These photographs must **NEVER** be modified, retouched, augmented, or rerun during development.
- **Reference Annotations:** Documented in [held-out-reference-annotations.json](../held-out-reference-annotations.json) and audited with SHA-256 hashes in [dataset-integrity-report.json](../dataset-integrity-report.json).

---

## 2. `fixtures/prep/dev/` — Development & Demo Fixtures
- **Contents:**
  - **Controlled Golden Demo Units:** `DEMO-COMPLIANT` (Sample A), `DEMO-DEFECT` (Sample B), `DEMO-RECOVERY` (Sample C).
  - **Physical Development Validation Units:** `UNIT-0001`, `UNIT-0002`, `REAL-PACKAGE-001` (apparel polybag), `REAL-PHONE-001` (Infinix Smart 8 retail box).
- **Classification:** Development and demonstration fixtures used for regression testing, headless CLI demos (`npm run inspection:dev`), and UI demonstration journeys.
- **Integrity Rule:** **NOT part of the 15-product held-out evaluation set.**

---

## 3. `fixtures/prep/stress_test/` — Synthetic Adversarial Stress Cases
- **Contents:** 6 synthetic image degradation cases (`STRESS-01` through `STRESS-06`) covering moderate blur, severe blur, partial crop, glare occlusion, low contrast, and partial label view.
- **Classification:** **Synthetic stress testing** to evaluate vision uncertainty, fail-safe degradation, and evidence recapture planning under poor photographic conditions.
- **Integrity Rule:** **NOT real held-out products.** Evaluated separately in [stress-test-results.json](../stress-test-results.json).
