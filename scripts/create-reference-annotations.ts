import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface ProductAnnotation {
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
}

const rawAnnotations: Record<string, Omit<ProductAnnotation, 'productId' | 'imageHashes'>> = {
  'PRODUCT-1': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'YES',
      expiry_readable: 'YES',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Cintu Euro Pop confectionery jar with yellow lid. EAN 8906071886920. Expiry Use By AUG 26.'
  },
  'PRODUCT-2': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Kangaro No. 10-1M staples cardboard box. Barcode 8901057510028. No expiry.'
  },
  'PRODUCT-3': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'YES',
      expiry_readable: 'YES',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Mysore Sandal soap gift box. Barcode 8901287100815. Expiry: Best before 3 years from MFD June 2026.'
  },
  'PRODUCT-4': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Airtel 5G Outdoor CPE corrugated carton. Multiple device barcodes (S/N AZYODC2F00042654, IMEI, MAC). No expiry.'
  },
  'PRODUCT-5': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Cello Gold Crust Insulated Hot Pot box. Barcode 8901372241614. No expiry.'
  },
  'PRODUCT-6': {
    annotations: {
      manufacturer_barcode_visible: 'NO',
      manufacturer_barcode_readable: 'NOT_APPLICABLE',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Airtel Xstream TV box. BIS mark and logos, no barcode printed on captured sides. No expiry.'
  },
  'PRODUCT-7': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Oxford English Mini Dictionary paperback book. ISBN barcode 9780195692587. No expiry.'
  },
  'PRODUCT-8': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'boAt Airdopes 141 carton. Barcodes 8904130887093 and 1000000241. No expiry.'
  },
  'PRODUCT-9': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Fire-Boltt Legend Smart Watch box. Barcode 8906119246334. No expiry.'
  },
  'PRODUCT-10': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Calligraphy 4Nib Set box with blister display window. Barcode 6938750036229. No expiry.'
  },
  'PRODUCT-11': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Camel Student Poster Colours metal tin box. Barcode 8901425000434. No expiry.'
  },
  'PRODUCT-12': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Diprobase-G Plus cream carton. Barcode 8901296045435. Expiry not shown on side/front/back panels.'
  },
  'PRODUCT-13': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'YES',
      expiry_readable: 'YES',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Gabany-M tablets pharma carton. Barcode 8904250627722. Expiry Date: 09/2027.'
  },
  'PRODUCT-14': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'NO',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Magnetic Chess Big board game box. Barcode 8904326203256. No expiry.'
  },
  'PRODUCT-15': {
    annotations: {
      manufacturer_barcode_visible: 'YES',
      manufacturer_barcode_readable: 'YES',
      fnsku_visible: 'NO',
      fnsku_value: 'NOT_APPLICABLE',
      polybag_present: 'NO',
      polybag_sealed: 'NOT_APPLICABLE',
      suffocation_warning_visible: 'NOT_APPLICABLE',
      expiry_visible: 'NO',
      expiry_readable: 'NOT_APPLICABLE',
      handling_mark_visible: 'YES',
      photo_quality_sufficient: 'YES'
    },
    notes: 'Prestige Nutri-Mix 2.0 appliance carton. Barcode 8901365431503. Handling marks visible: This Side Up arrows & Keep Dry umbrella.'
  }
};

function getFileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function generateFrozenAnnotations() {
  const baseDir = path.join(process.cwd(), 'fixtures', 'prep', 'real');
  const products = Object.keys(rawAnnotations).sort((a, b) => {
    return parseInt(a.replace('PRODUCT-', ''), 10) - parseInt(b.replace('PRODUCT-', ''), 10);
  });

  const fullRecord: {
    metadata: {
      title: string;
      creationTimestamp: string;
      evaluatorMethod: string;
      notice: string;
      productsCount: number;
    };
    products: ProductAnnotation[];
  } = {
    metadata: {
      title: 'Reference Visual Annotations for Held-Out Products (PRODUCT-1 .. PRODUCT-15)',
      creationTimestamp: new Date().toISOString(),
      evaluatorMethod: 'Reference visual annotation prior to vision agent execution. NOT two independent human annotators. NOT ground truth.',
      notice: 'Frozen evaluation asset. Do not edit after pipeline run.',
      productsCount: products.length
    },
    products: []
  };

  for (const prodId of products) {
    const prodDir = path.join(baseDir, prodId);
    const frontHash = getFileHash(path.join(prodDir, 'front.jpeg'));
    const backHash = getFileHash(path.join(prodDir, 'back.jpeg'));
    const labelHash = getFileHash(path.join(prodDir, 'label.jpeg'));

    fullRecord.products.push({
      productId: prodId,
      imageHashes: {
        front: frontHash,
        back: backHash,
        label: labelHash
      },
      annotations: rawAnnotations[prodId].annotations,
      notes: rawAnnotations[prodId].notes
    });
  }

  const outPath = path.join(process.cwd(), 'held-out-reference-annotations.json');
  const content = JSON.stringify(fullRecord, null, 2);
  fs.writeFileSync(outPath, content, 'utf-8');

  const fileHash = crypto.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex');
  console.log(`Reference Visual Annotations successfully persisted to: ${outPath}`);
  console.log(`Creation Timestamp: ${fullRecord.metadata.creationTimestamp}`);
  console.log(`Annotation File SHA-256: ${fileHash}`);
  console.log(`Total Products Annotated: ${fullRecord.products.length}`);
}

generateFrozenAnnotations();
