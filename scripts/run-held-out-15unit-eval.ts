import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadEnvConfig } from '@next/env';
import { analyzePrepUnit, type PrepUnitImageInput } from '../src/lib/vision/analyze-prep-unit';
import type { PrepUnitObservation } from '../src/lib/vision/prep-observation.schema';

loadEnvConfig(process.cwd());

const FROZEN_ANNOTATION_HASH = '9125043b681113a5dc976e2d2b09ec544c74cb8e428cc637d22f26093ec96215';

interface ReferenceFile {
  metadata: {
    title: string;
    creationTimestamp: string;
    evaluatorMethod: string;
    notice: string;
    productsCount: number;
  };
  products: Array<{
    productId: string;
    imageHashes: {
      front: string;
      back: string;
      label: string;
    };
    annotations: {
      manufacturer_barcode_visible: 'YES' | 'NO' | 'NOT_SURE';
      manufacturer_barcode_readable: 'YES' | 'NO' | 'NOT_SURE' | 'NOT_APPLICABLE';
      fnsku_visible: 'YES' | 'NO' | 'NOT_SURE';
      fnsku_value: string;
      polybag_present: 'YES' | 'NO' | 'NOT_SURE';
      polybag_sealed: 'YES' | 'NO' | 'NOT_SURE' | 'NOT_APPLICABLE';
      suffocation_warning_visible: 'YES' | 'NO' | 'NOT_SURE' | 'NOT_APPLICABLE';
      expiry_visible: 'YES' | 'NO' | 'NOT_SURE';
      expiry_readable: 'YES' | 'NO' | 'NOT_SURE' | 'NOT_APPLICABLE';
      handling_mark_visible: 'YES' | 'NO' | 'NOT_SURE';
      photo_quality_sufficient: 'YES' | 'NO' | 'NOT_SURE';
    };
    notes: string;
  }>;
}

interface EvaluationComparison {
  productId: string;
  field: string;
  referenceVal: string;
  modelVal: string;
  status: 'AGREEMENT' | 'DISAGREEMENT' | 'MODEL_UNCERTAIN' | 'NOT_SCORABLE';
  failureType?: string;
  likelyCause?: string;
  evidenceImage?: string;
}

interface ProductRunRecord {
  productId: string;
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
  rawObservation?: PrepUnitObservation;
  comparisons: EvaluationComparison[];
  safetyIncidents: string[];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadHeldOutImages(productId: string): PrepUnitImageInput[] {
  const dir = path.join(process.cwd(), 'fixtures', 'prep', 'real', productId);
  const files = [
    { imageId: 'front', filename: 'front.jpeg' },
    { imageId: 'back', filename: 'back.jpeg' },
    { imageId: 'label', filename: 'label.jpeg' },
  ];

  return files.map((item) => {
    const fullPath = path.join(dir, item.filename);
    const buf = fs.readFileSync(fullPath);
    return {
      imageId: item.imageId,
      mimeType: 'image/jpeg',
      imageData: buf,
    };
  });
}

function getEvidenceId(evidence?: Array<{ imageId: string }>): string {
  if (evidence && evidence.length > 0 && evidence[0].imageId) {
    return evidence[0].imageId;
  }
  return 'unspecified';
}

async function main() {
  console.log('================================================================');
  console.log('CUBE PREP MANAGER — 15-PRODUCT HELD-OUT REAL-WORLD EVALUATION');
  console.log('================================================================');

  const refFilePath = path.join(process.cwd(), 'held-out-reference-annotations.json');
  if (!fs.existsSync(refFilePath)) {
    throw new Error('Reference annotations file does not exist!');
  }

  const refContent = fs.readFileSync(refFilePath, 'utf-8');
  const currentHash = crypto.createHash('sha256').update(Buffer.from(refContent, 'utf-8')).digest('hex');

  console.log(`Reference Annotation File: ${refFilePath}`);
  console.log(`Current Hash: ${currentHash}`);
  console.log(`Frozen  Hash: ${FROZEN_ANNOTATION_HASH}`);

  if (currentHash !== FROZEN_ANNOTATION_HASH) {
    throw new Error('FATAL: Reference annotations file has been modified! Hash mismatch.');
  }
  console.log('>> INTEGRITY VERIFIED: Reference annotations are strictly FROZEN.\n');

  const refData: ReferenceFile = JSON.parse(refContent);

  const productRecords: ProductRunRecord[] = [];
  const startTime = Date.now();

  for (let i = 0; i < refData.products.length; i++) {
    const prod = refData.products[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`[${i + 1}/${refData.products.length}] Running pipeline for ${prod.productId}...`);

    let images: PrepUnitImageInput[];
    try {
      images = loadHeldOutImages(prod.productId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load images for ${prod.productId}:`, errMsg);
      productRecords.push({
        productId: prod.productId,
        success: false,
        latencyMs: 0,
        model: 'unknown',
        error: `Image load error: ${errMsg}`,
        comparisons: [],
        safetyIncidents: ['Failed to load images'],
      });
      continue;
    }

    const startUnit = Date.now();
    let analyzeResult: Awaited<ReturnType<typeof analyzePrepUnit>> | null = null;
    let runError: unknown = null;

    try {
      analyzeResult = await analyzePrepUnit(prod.productId, images);
    } catch (err: unknown) {
      runError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Pipeline error for ${prod.productId}:`, errMsg);
    }

    const durationMs = Date.now() - startUnit;
    const modelUsed = analyzeResult?.metadata?.model || 'gemini-3.5-flash-lite';

    if (!analyzeResult || !analyzeResult.observation) {
      const errMsg = runError instanceof Error ? runError.message : runError ? String(runError) : 'Unknown execution error or missing observation';
      productRecords.push({
        productId: prod.productId,
        success: false,
        latencyMs: durationMs,
        model: modelUsed,
        error: errMsg,
        comparisons: [],
        safetyIncidents: ['API or Schema execution failure'],
      });
      continue;
    }

    const obs: PrepUnitObservation = analyzeResult.observation;
    console.log(`Completed in ${durationMs} ms. Packaging: ${obs.polybag?.packagingType || 'NONE_DETECTED'}`);

    // Evaluation & Comparison Logic
    const comparisons: EvaluationComparison[] = [];
    const safetyIncidents: string[] = [];

    // Helper for visibility mapping:
    // Reference: YES / NO / NOT_SURE
    // Model: VISIBLE / NOT_DETECTED / UNCERTAIN
    const mapVis = (refVal: string, modelVal: string, fieldName: string, evImg: string) => {
      if (refVal === 'NOT_APPLICABLE' || refVal === 'NOT_SURE') {
        comparisons.push({
          productId: prod.productId,
          field: fieldName,
          referenceVal: refVal,
          modelVal,
          status: 'NOT_SCORABLE',
          evidenceImage: evImg,
        });
        return;
      }

      if (modelVal === 'UNCERTAIN') {
        comparisons.push({
          productId: prod.productId,
          field: fieldName,
          referenceVal: refVal,
          modelVal,
          status: 'MODEL_UNCERTAIN',
          failureType: 'UNCERTAINTY_ABSTENTION',
          likelyCause: 'Model expressed uncertainty based on visual ambiguity',
          evidenceImage: evImg,
        });
        return;
      }

      const refMatches =
        (refVal === 'YES' && modelVal === 'VISIBLE') ||
        (refVal === 'NO' && modelVal === 'NOT_DETECTED');

      if (refMatches) {
        comparisons.push({
          productId: prod.productId,
          field: fieldName,
          referenceVal: refVal,
          modelVal,
          status: 'AGREEMENT',
          evidenceImage: evImg,
        });
      } else {
        const failureType =
          refVal === 'YES' && modelVal === 'NOT_DETECTED'
            ? 'VISION_FALSE_NEGATIVE'
            : 'VISION_FALSE_POSITIVE';
        comparisons.push({
          productId: prod.productId,
          field: fieldName,
          referenceVal: refVal,
          modelVal,
          status: 'DISAGREEMENT',
          failureType,
          likelyCause: `Model reported ${modelVal} while visual inspection shows ${refVal}`,
          evidenceImage: evImg,
        });
      }
    };

    // 1. manufacturer barcode visibility
    mapVis(
      prod.annotations.manufacturer_barcode_visible,
      obs.manufacturerBarcode.visibility,
      'manufacturer_barcode_visible',
      getEvidenceId(obs.manufacturerBarcode.evidence)
    );

    // 2. manufacturer barcode readability
    if (prod.annotations.manufacturer_barcode_readable === 'NOT_APPLICABLE') {
      comparisons.push({
        productId: prod.productId,
        field: 'manufacturer_barcode_readable',
        referenceVal: 'NOT_APPLICABLE',
        modelVal: obs.manufacturerBarcode.legibility,
        status: 'NOT_SCORABLE',
      });
    } else {
      if (obs.manufacturerBarcode.legibility === 'UNCERTAIN') {
        comparisons.push({
          productId: prod.productId,
          field: 'manufacturer_barcode_readable',
          referenceVal: prod.annotations.manufacturer_barcode_readable,
          modelVal: obs.manufacturerBarcode.legibility,
          status: 'MODEL_UNCERTAIN',
          failureType: 'UNCERTAINTY_ABSTENTION',
          likelyCause: 'Model uncertain about barcode legibility',
        });
      } else {
        const refMatches =
          (prod.annotations.manufacturer_barcode_readable === 'YES' &&
            obs.manufacturerBarcode.legibility === 'LEGIBLE') ||
          (prod.annotations.manufacturer_barcode_readable === 'NO' &&
            obs.manufacturerBarcode.legibility === 'ILLEGIBLE');
        comparisons.push({
          productId: prod.productId,
          field: 'manufacturer_barcode_readable',
          referenceVal: prod.annotations.manufacturer_barcode_readable,
          modelVal: obs.manufacturerBarcode.legibility,
          status: refMatches ? 'AGREEMENT' : 'DISAGREEMENT',
          failureType: refMatches ? undefined : 'READABILITY_ERROR',
          likelyCause: refMatches
            ? undefined
            : `Reference: ${prod.annotations.manufacturer_barcode_readable}, Model: ${obs.manufacturerBarcode.legibility}`,
        });
      }
    }

    // 3. FNSKU visibility
    mapVis(
      prod.annotations.fnsku_visible,
      obs.fnsku.visibility,
      'fnsku_visible',
      getEvidenceId(obs.fnsku.evidence)
    );

    // 4. FNSKU exact value
    if (prod.annotations.fnsku_value === 'NOT_APPLICABLE') {
      if (!obs.fnsku.detectedValue || obs.fnsku.detectedValue.trim() === '') {
        comparisons.push({
          productId: prod.productId,
          field: 'fnsku_value',
          referenceVal: 'NOT_APPLICABLE',
          modelVal: 'NONE',
          status: 'AGREEMENT',
        });
      } else {
        comparisons.push({
          productId: prod.productId,
          field: 'fnsku_value',
          referenceVal: 'NOT_APPLICABLE',
          modelVal: obs.fnsku.detectedValue,
          status: 'DISAGREEMENT',
          failureType: 'IDENTIFIER_HALLUCINATION',
          likelyCause: `Model hallucinated or misclassified non-FNSKU value "${obs.fnsku.detectedValue}" as FNSKU`,
        });
      }
    } else {
      if (obs.fnsku.detectedValue === prod.annotations.fnsku_value) {
        comparisons.push({
          productId: prod.productId,
          field: 'fnsku_value',
          referenceVal: prod.annotations.fnsku_value,
          modelVal: obs.fnsku.detectedValue || 'NONE',
          status: 'AGREEMENT',
        });
      } else {
        comparisons.push({
          productId: prod.productId,
          field: 'fnsku_value',
          referenceVal: prod.annotations.fnsku_value,
          modelVal: obs.fnsku.detectedValue || 'NONE',
          status: 'DISAGREEMENT',
          failureType: 'OCR_ERROR',
          likelyCause: `Detected "${obs.fnsku.detectedValue}" vs reference "${prod.annotations.fnsku_value}"`,
        });
      }
    }

    // 5. polybag presence
    mapVis(
      prod.annotations.polybag_present,
      obs.polybag.visibility,
      'polybag_present',
      getEvidenceId(obs.polybag.evidence)
    );

    // 6. polybag seal
    if (prod.annotations.polybag_sealed === 'NOT_APPLICABLE') {
      comparisons.push({
        productId: prod.productId,
        field: 'polybag_sealed',
        referenceVal: 'NOT_APPLICABLE',
        modelVal: obs.polybag.sealStatus,
        status: 'NOT_SCORABLE',
      });
    } else {
      if (obs.polybag.sealStatus === 'UNCERTAIN') {
        comparisons.push({
          productId: prod.productId,
          field: 'polybag_sealed',
          referenceVal: prod.annotations.polybag_sealed,
          modelVal: obs.polybag.sealStatus,
          status: 'MODEL_UNCERTAIN',
          failureType: 'UNCERTAINTY_ABSTENTION',
        });
      } else {
        const refMatches =
          (prod.annotations.polybag_sealed === 'YES' && obs.polybag.sealStatus === 'SEALED') ||
          (prod.annotations.polybag_sealed === 'NO' && obs.polybag.sealStatus === 'NOT_SEALED');
        comparisons.push({
          productId: prod.productId,
          field: 'polybag_sealed',
          referenceVal: prod.annotations.polybag_sealed,
          modelVal: obs.polybag.sealStatus,
          status: refMatches ? 'AGREEMENT' : 'DISAGREEMENT',
          failureType: refMatches ? undefined : 'PACKAGING_MISCLASSIFICATION',
        });
      }
    }

    // 7. suffocation-warning visibility
    if (prod.annotations.suffocation_warning_visible === 'NOT_APPLICABLE') {
      comparisons.push({
        productId: prod.productId,
        field: 'suffocation_warning_visible',
        referenceVal: 'NOT_APPLICABLE',
        modelVal: obs.suffocationWarning.visibility,
        status: 'NOT_SCORABLE',
      });
    } else {
      mapVis(
        prod.annotations.suffocation_warning_visible,
        obs.suffocationWarning.visibility,
        'suffocation_warning_visible',
        getEvidenceId(obs.suffocationWarning.evidence)
      );
    }

    // 8. expiry visibility
    mapVis(
      prod.annotations.expiry_visible,
      obs.expiryDate.visibility,
      'expiry_visible',
      getEvidenceId(obs.expiryDate.evidence)
    );

    // 9. expiry readability
    if (prod.annotations.expiry_readable === 'NOT_APPLICABLE') {
      comparisons.push({
        productId: prod.productId,
        field: 'expiry_readable',
        referenceVal: 'NOT_APPLICABLE',
        modelVal: obs.expiryDate.legibility,
        status: 'NOT_SCORABLE',
      });
    } else {
      if (obs.expiryDate.legibility === 'UNCERTAIN') {
        comparisons.push({
          productId: prod.productId,
          field: 'expiry_readable',
          referenceVal: prod.annotations.expiry_readable,
          modelVal: obs.expiryDate.legibility,
          status: 'MODEL_UNCERTAIN',
          failureType: 'UNCERTAINTY_ABSTENTION',
        });
      } else {
        const refMatches =
          (prod.annotations.expiry_readable === 'YES' && obs.expiryDate.legibility === 'LEGIBLE') ||
          (prod.annotations.expiry_readable === 'NO' && obs.expiryDate.legibility === 'ILLEGIBLE');
        comparisons.push({
          productId: prod.productId,
          field: 'expiry_readable',
          referenceVal: prod.annotations.expiry_readable,
          modelVal: obs.expiryDate.legibility,
          status: refMatches ? 'AGREEMENT' : 'DISAGREEMENT',
          failureType: refMatches ? undefined : 'READABILITY_ERROR',
        });
      }
    }

    // 10. handling-mark visibility
    // obs.handlingMarks is an array of marks.
    const anyMarkVisible = obs.handlingMarks.some(m => m.visibility === 'VISIBLE');
    const anyMarkUncertain = obs.handlingMarks.some(m => m.visibility === 'UNCERTAIN');

    let modelHandlingVis = 'NOT_DETECTED';
    if (anyMarkVisible) modelHandlingVis = 'VISIBLE';
    else if (anyMarkUncertain) modelHandlingVis = 'UNCERTAIN';

    const handlingEvidence = obs.handlingMarks.length > 0 ? getEvidenceId(obs.handlingMarks[0].evidence) : 'back';
    mapVis(
      prod.annotations.handling_mark_visible,
      modelHandlingVis,
      'handling_mark_visible',
      handlingEvidence
    );

    // 11. photo-quality sufficiency
    const modelQualSufficient = obs.imageQuality?.overall === 'GOOD';
    const refQualSufficient = prod.annotations.photo_quality_sufficient === 'YES';
    comparisons.push({
      productId: prod.productId,
      field: 'photo_quality_sufficient',
      referenceVal: prod.annotations.photo_quality_sufficient,
      modelVal: obs.imageQuality?.overall || 'UNKNOWN',
      status: (refQualSufficient && modelQualSufficient) ? 'AGREEMENT' : 'DISAGREEMENT',
      failureType: (refQualSufficient && modelQualSufficient) ? undefined : 'IMAGE_QUALITY_LIMITATION',
      likelyCause: (refQualSufficient && modelQualSufficient) ? undefined : `Model evaluated quality as ${obs.imageQuality?.overall}`,
    });

    // 6. SAFETY AUDIT CHECKS
    // A. Ordinary barcode interpreted as FNSKU
    if (obs.fnsku.visibility === 'VISIBLE' && obs.fnsku.detectedValue) {
      if (
        obs.manufacturerBarcode.detectedValue &&
        obs.fnsku.detectedValue === obs.manufacturerBarcode.detectedValue
      ) {
        safetyIncidents.push(`Ordinary barcode interpreted as FNSKU: ${obs.fnsku.detectedValue}`);
      }
    }

    // B. QR code or regulatory code interpreted as FNSKU
    if (obs.fnsku.detectedValue) {
      if (
        obs.fnsku.detectedValue.startsWith('QR_') ||
        obs.fnsku.detectedValue.startsWith('BIS') ||
        obs.fnsku.detectedValue.startsWith('IS_') ||
        obs.fnsku.detectedValue.includes('R-')
      ) {
        safetyIncidents.push(`QR or regulatory identifier interpreted as FNSKU: ${obs.fnsku.detectedValue}`);
      }
    }

    // C. Invented / hallucinated identifier
    if (obs.fnsku.visibility === 'VISIBLE' && prod.annotations.fnsku_visible === 'NO') {
      safetyIncidents.push(`Invented FNSKU: reported ${obs.fnsku.detectedValue} on retail package without FNSKU`);
    }

    // D. Partial identifier reported COMPLETE
    if (obs.fnsku.valueCompleteness === 'COMPLETE' && obs.fnsku.visibility === 'UNCERTAIN') {
      safetyIncidents.push(`Partial identifier reported COMPLETE when visibility is UNCERTAIN`);
    }

    // E. Unreadable identifier reported LEGIBLE
    if (obs.fnsku.legibility === 'LEGIBLE' && obs.fnsku.visibility === 'NOT_DETECTED') {
      safetyIncidents.push(`Unreadable identifier reported LEGIBLE when NOT_DETECTED`);
    }

    // F. NOT_DETECTED treated as proof of absence
    const notesStr = JSON.stringify(obs);
    if (
      notesStr.toLowerCase().includes('guaranteed absent') ||
      notesStr.toLowerCase().includes('proved absent')
    ) {
      safetyIncidents.push(`NOT_DETECTED inappropriately treated as proof of physical absence`);
    }

    productRecords.push({
      productId: prod.productId,
      success: true,
      latencyMs: durationMs,
      model: modelUsed,
      rawObservation: obs,
      comparisons,
      safetyIncidents,
    });

    // polite delay between API calls
    if (i < refData.products.length - 1) {
      await delay(1500);
    }
  }

  const totalTime = Date.now() - startTime;

  // Aggregate Metrics
  let totalScorable = 0;
  let totalAgreements = 0;
  let totalDisagreements = 0;
  let totalModelUncertain = 0;
  let totalNotScorable = 0;

  const perFieldMetrics: Record<string, { scorable: number; agreements: number; disagreements: number; uncertain: number; notScorable: number }> = {};
  const failureList: EvaluationComparison[] = [];
  const allSafetyIncidents: { productId: string; incident: string }[] = [];

  for (const p of productRecords) {
    for (const inc of p.safetyIncidents) {
      allSafetyIncidents.push({ productId: p.productId, incident: inc });
    }

    for (const c of p.comparisons) {
      if (!perFieldMetrics[c.field]) {
        perFieldMetrics[c.field] = { scorable: 0, agreements: 0, disagreements: 0, uncertain: 0, notScorable: 0 };
      }

      if (c.status === 'NOT_SCORABLE') {
        totalNotScorable++;
        perFieldMetrics[c.field].notScorable++;
      } else {
        totalScorable++;
        perFieldMetrics[c.field].scorable++;

        if (c.status === 'AGREEMENT') {
          totalAgreements++;
          perFieldMetrics[c.field].agreements++;
        } else if (c.status === 'DISAGREEMENT') {
          totalDisagreements++;
          perFieldMetrics[c.field].disagreements++;
          failureList.push(c);
        } else if (c.status === 'MODEL_UNCERTAIN') {
          totalModelUncertain++;
          perFieldMetrics[c.field].uncertain++;
        }
      }
    }
  }

  const agreementPct = totalScorable > 0 ? ((totalAgreements / totalScorable) * 100).toFixed(1) + '%' : '0%';

  console.log('\n================================================================');
  console.log('EVALUATION RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`Held-Out Products Evaluated: ${productRecords.length}`);
  console.log(`Total Wall-Clock Time: ${totalTime} ms`);
  console.log(`Scorable Comparisons: ${totalScorable}`);
  console.log(`Agreements: ${totalAgreements} (${agreementPct})`);
  console.log(`Disagreements: ${totalDisagreements}`);
  console.log(`Model Uncertain / Abstentions: ${totalModelUncertain}`);
  console.log(`Not Scorable: ${totalNotScorable}`);
  console.log(`Safety Incidents Detected: ${allSafetyIncidents.length}`);

  console.log('\n--- PERFORMANCE BY CHECK / FIELD ---');
  console.log(
    `${'Field'.padEnd(35)} ${'Scorable'.padStart(9)} ${'Agree'.padStart(7)} ${'Disagree'.padStart(9)} ${'Uncertain'.padStart(10)} ${'Agree %'.padStart(9)}`
  );
  console.log('-'.repeat(85));
  for (const [field, m] of Object.entries(perFieldMetrics)) {
    const pct = m.scorable > 0 ? ((m.agreements / m.scorable) * 100).toFixed(1) + '%' : 'N/A';
    console.log(
      `${field.padEnd(35)} ${String(m.scorable).padStart(9)} ${String(m.agreements).padStart(7)} ${String(m.disagreements).padStart(9)} ${String(m.uncertain).padStart(10)} ${pct.padStart(9)}`
    );
  }

  if (failureList.length > 0) {
    console.log('\n--- FAILURE / DISAGREEMENT DETAILS ---');
    for (const f of failureList) {
      console.log(`[${f.productId}] Field: ${f.field}`);
      console.log(`  Reference: ${f.referenceVal} | Model: ${f.modelVal}`);
      console.log(`  Type: ${f.failureType} | Cause: ${f.likelyCause}`);
    }
  } else {
    console.log('\nZero hard disagreements encountered.');
  }

  // Save detailed evaluation output
  const finalReport = {
    metadata: {
      title: 'Held-Out Real-World Vision Evaluation (PRODUCT-1 .. PRODUCT-15)',
      evaluationTimestamp: new Date().toISOString(),
      frozenAnnotationHash: FROZEN_ANNOTATION_HASH,
      totalProducts: productRecords.length,
      totalWallClockTimeMs: totalTime,
    },
    metrics: {
      totalScorable,
      totalAgreements,
      totalDisagreements,
      totalModelUncertain,
      totalNotScorable,
      agreementRate: agreementPct,
      safetyIncidentsCount: allSafetyIncidents.length,
      perFieldMetrics,
    },
    allSafetyIncidents,
    failureList,
    productRecords,
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'held-out-15unit-eval-results.json'),
    JSON.stringify(finalReport, null, 2),
    'utf-8'
  );
  console.log('\nSaved full report to held-out-15unit-eval-results.json');
}

main().catch((err) => {
  console.error('Fatal evaluation runner error:', err);
  process.exit(1);
});
