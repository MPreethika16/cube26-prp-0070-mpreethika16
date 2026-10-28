# Prep evaluation

These figures are one Claude run against one frozen annotation sheet. They are not an overall accuracy. No other model is part of this score.

## The set

| | Count |
|---|---|
| Products | 15, PRODUCT-1 through PRODUCT-15 |
| Model calls | 15, one per product |
| Model | claude-sonnet-4-5-20250929 |
| Run | 2026-10-08, wall clock 201.6 seconds |
| Ingestion failures | 0 |
| Safety incidents | 0 |
| Labelers | one frozen sheet, hash `9125043b681113a5dc976e2d2b09ec544c74cb8e428cc637d22f26093ec96215` |
| Second labeler | none |

## Results

A scorable field is one the frozen sheet marked. `NOT_SCORABLE` fields stay out of the denominator. An agreement is the model value matching the sheet. A disagreement is a different decided value. `MODEL_UNCERTAIN` is counted separately and is not turned into a match.

| | Count |
|---|---|
| Scorable fields | 122 |
| Agreements | 104 |
| Disagreements | 7 |
| Model uncertain | 11 |
| Not scorable | 43 |
| Agreement | 104/122 (85.2%) |

| Field | Scorable | Agree | Disagree | Uncertain | Not scorable |
|---|---:|---:|---:|---:|---:|
| manufacturer_barcode_visible | 15 | 10 | 0 | 5 | 0 |
| manufacturer_barcode_readable | 14 | 7 | 2 | 5 | 1 |
| fnsku_visible | 15 | 15 | 0 | 0 | 0 |
| fnsku_value | 15 | 15 | 0 | 0 | 0 |
| polybag_present | 15 | 15 | 0 | 0 | 0 |
| polybag_sealed | 0 | 0 | 0 | 0 | 15 |
| suffocation_warning_visible | 0 | 0 | 0 | 0 | 15 |
| expiry_visible | 15 | 14 | 1 | 0 | 0 |
| expiry_readable | 3 | 2 | 0 | 1 | 12 |
| handling_mark_visible | 15 | 14 | 1 | 0 | 0 |
| photo_quality_sufficient | 15 | 12 | 3 | 0 | 0 |

FNSKU is 15/15 visible and 15/15 value. Polybag presence is 15/15. Suffocation and polybag seal are not scorable on this sheet: every row is `NOT_SCORABLE`.

## Failures

The seven disagreements:

| Product | Field | Sheet | Model |
|---|---|---|---|
| PRODUCT-3 | expiry_visible | YES | NOT_DETECTED |
| PRODUCT-5 | manufacturer_barcode_readable | YES | ILLEGIBLE |
| PRODUCT-5 | photo_quality_sufficient | YES | DEGRADED |
| PRODUCT-7 | photo_quality_sufficient | YES | DEGRADED |
| PRODUCT-12 | manufacturer_barcode_readable | YES | ILLEGIBLE |
| PRODUCT-12 | photo_quality_sufficient | YES | DEGRADED |
| PRODUCT-15 | handling_mark_visible | YES | NOT_DETECTED |

Uncertain barcodes, not counted as disagreements: PRODUCT-1, PRODUCT-11, PRODUCT-13, PRODUCT-14, PRODUCT-15.

## Later label note, not a rescore

Preethika later ruled that PRODUCT-15 has no shipping handling mark, and that PRODUCT-3's printed line is a best-before rule rather than a readable expiry date. This report does not replace 104/122 with a new rate. The file on disk remains the score against the frozen sheet.

## Cost

Token totals were not stored on this run. Fifteen calls, about 202 seconds. That is not an invoice.

## Files

| What | Where |
|---|---|
| This explanation | `docs/evaluation.md` |
| Claude grades | `held-out-15unit-claude-eval-results.json` |
| Sheet | `data/labeling/vinay-prep-labels.csv` |
