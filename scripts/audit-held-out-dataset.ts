import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface ImageInfo {
  product: string;
  filename: string;
  fullPath: string;
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
  isReadable: boolean;
  duplicateOf?: string;
  existsInDevOrDemo?: string;
}

function getJpegDimensions(buffer: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

function getAllImageFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!full.includes('node_modules') && !full.includes('.next') && !full.includes('.git')) {
        results = results.concat(getAllImageFiles(full));
      }
    } else {
      const ext = path.extname(full).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        results.push(full);
      }
    }
  }
  return results;
}

async function run() {
  console.log('Auditing repository images...');
  const allImages = getAllImageFiles('.');
  console.log(`Found ${allImages.length} total image files.`);

  // Build hash map of non-heldout images (dev, demo, fixtures, etc.)
  const nonHeldoutHashes = new Map<string, string[]>();
  for (const imgPath of allImages) {
    if (imgPath.includes('fixtures\\prep\\real\\PRODUCT-') || imgPath.includes('fixtures/prep/real/PRODUCT-')) {
      continue;
    }
    const buf = fs.readFileSync(imgPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (!nonHeldoutHashes.has(hash)) {
      nonHeldoutHashes.set(hash, []);
    }
    nonHeldoutHashes.get(hash)!.push(imgPath);
  }

  const heldOutDir = path.join(process.cwd(), 'fixtures', 'prep', 'real');
  const products = fs.readdirSync(heldOutDir)
    .filter(f => f.startsWith('PRODUCT-'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('PRODUCT-', ''), 10);
      const numB = parseInt(b.replace('PRODUCT-', ''), 10);
      return numA - numB;
    });

  const productImages: ImageInfo[] = [];
  const heldoutHashes = new Map<string, string[]>();

  for (const prod of products) {
    const prodDir = path.join(heldOutDir, prod);
    const files = fs.readdirSync(prodDir).sort();
    for (const f of files) {
      const fullPath = path.join(prodDir, f);
      const buf = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      let dims = { width: 0, height: 0 };
      let readable = true;
      try {
        dims = getJpegDimensions(buf);
        if (dims.width === 0 || dims.height === 0) {
          readable = false;
        }
      } catch {
        readable = false;
      }

      if (!heldoutHashes.has(hash)) {
        heldoutHashes.set(hash, []);
      }
      heldoutHashes.get(hash)!.push(`${prod}/${f}`);

      const devMatch = nonHeldoutHashes.get(hash);

      productImages.push({
        product: prod,
        filename: f,
        fullPath,
        sizeBytes: buf.length,
        sha256: hash,
        width: dims.width,
        height: dims.height,
        isReadable: readable,
        existsInDevOrDemo: devMatch ? devMatch.join(', ') : undefined
      });
    }
  }

  // Check intra-dataset duplicates
  for (const img of productImages) {
    const matches = heldoutHashes.get(img.sha256)!;
    if (matches.length > 1) {
      img.duplicateOf = matches.filter(m => m !== `${img.product}/${img.filename}`).join(', ');
    }
  }

  console.log('\n========================================');
  console.log('DATASET INTEGRITY AUDIT RESULTS:');
  console.log('========================================');
  console.log(`Total Products: ${products.length}`);
  console.log(`Total Photos: ${productImages.length}`);

  let corruptCount = 0;
  let devContaminatedCount = 0;
  let duplicateCount = 0;

  for (const img of productImages) {
    if (!img.isReadable) corruptCount++;
    if (img.existsInDevOrDemo) devContaminatedCount++;
    if (img.duplicateOf) duplicateCount++;
    console.log(`[${img.product}] ${img.filename}: ${img.width}x${img.height}, ${img.sizeBytes} B, SHA: ${img.sha256.substring(0, 12)}... Readable: ${img.isReadable} ${img.existsInDevOrDemo ? `CONTAMINATED: ${img.existsInDevOrDemo}` : ''} ${img.duplicateOf ? `DUPLICATE: ${img.duplicateOf}` : ''}`);
  }

  console.log('\n--- SUMMARY ---');
  console.log(`PHYSICAL PRODUCTS: ${products.length}`);
  console.log(`ORIGINAL PHOTOS: ${productImages.length}`);
  console.log(`VALID HELD-OUT PRODUCTS: ${products.length - (devContaminatedCount > 0 ? 1 : 0)}`);
  console.log(`CONTAMINATED PRODUCTS: ${devContaminatedCount}`);
  console.log(`DUPLICATES: ${duplicateCount}`);
  console.log(`CORRUPT IMAGES: ${corruptCount}`);

  // Write integrity report to file
  fs.writeFileSync(
    path.join(process.cwd(), 'dataset-integrity-report.json'),
    JSON.stringify({ products, productImages }, null, 2),
    'utf-8'
  );
  console.log('Wrote dataset-integrity-report.json');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
