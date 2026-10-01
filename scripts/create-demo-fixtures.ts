import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

async function createSvgImage(svg: string, outputPath: string) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

// Helper to generate a realistic Code 128 barcode pattern in SVG
function generateBarcodeSvg(x: number, y: number, width: number, height: number, codeText: string): string {
  const bars: string[] = [];
  let curX = x;
  // Deterministic bar widths
  const pattern = [2, 1, 3, 1, 2, 2, 1, 4, 1, 1, 3, 2, 1, 2, 2, 3, 1, 1, 2, 4, 1, 2, 3, 1, 1, 3, 2, 2, 1, 1, 4, 2, 1, 1, 2, 3, 1, 2, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1];
  for (let i = 0; i < pattern.length; i++) {
    const barW = pattern[i] * 3;
    if (i % 2 === 0) {
      bars.push(`<rect x="${curX}" y="${y}" width="${barW}" height="${height}" fill="#000000" />`);
    }
    curX += barW;
  }
  const textX = x + (curX - x) / 2;
  return `
    <g id="barcode-group">
      ${bars.join("\n")}
      <text x="${textX}" y="${y + height + 24}" font-family="Arial, sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#000000">${codeText}</text>
    </g>
  `;
}

async function main() {
  const baseDir = path.join(process.cwd(), "fixtures", "prep", "dev");

  // 1. DEMO-COMPLIANT
  const compliantDir = path.join(baseDir, "DEMO-COMPLIANT");
  
  // Front: Clean Retail Package
  const compliantFrontSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Box shadow & body -->
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="4" />
      <!-- Decorative branding -->
      <rect x="220" y="250" width="520" height="300" rx="12" fill="#27272a" />
      <text x="480" y="380" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#10b981" text-anchor="middle">NATURE PREP</text>
      <text x="480" y="440" font-family="Arial, sans-serif" font-size="28" font-weight="normal" fill="#a1a1aa" text-anchor="middle">Organic Plant Protein Bars</text>
      <text x="480" y="490" font-family="Arial, sans-serif" font-size="20" fill="#71717a" text-anchor="middle">12 Bars | Net Wt 720g (25.4 oz)</text>
      <!-- Highlights badge -->
      <rect x="360" y="650" width="240" height="60" rx="30" fill="#065f46" />
      <text x="480" y="688" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#6ee7b7" text-anchor="middle">100% NON-GMO</text>
      <!-- Bottom Info -->
      <text x="480" y="1000" font-family="Arial, sans-serif" font-size="18" fill="#52525b" text-anchor="middle">Front View — Sealed Original Packaging</text>
    </svg>
  `;

  // Back: Manufacturer Barcode Covered by Opaque Label
  const compliantBackSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Box body -->
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#18181b" stroke="#3f3f46" stroke-width="4" />
      <!-- Nutrition Facts / Ingredients panel -->
      <rect x="220" y="240" width="520" height="420" fill="#ffffff" rx="8" />
      <text x="240" y="280" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#000000">Nutrition Facts</text>
      <line x1="240" y1="295" x2="720" y2="295" stroke="#000000" stroke-width="6" />
      <text x="240" y="330" font-family="Arial, sans-serif" font-size="18" fill="#000000">Serving Size 1 Bar (60g)</text>
      <line x1="240" y1="345" x2="720" y2="345" stroke="#000000" stroke-width="2" />
      <text x="240" y="380" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000">Calories 220</text>
      <line x1="240" y1="395" x2="720" y2="395" stroke="#000000" stroke-width="4" />
      <text x="240" y="430" font-family="Arial, sans-serif" font-size="18" fill="#000000">Total Fat 8g | Protein 15g | Total Carb 24g</text>
      <text x="240" y="480" font-family="Arial, sans-serif" font-size="16" fill="#3f3f46">Ingredients: Organic pea protein, almond butter, dates.</text>
      
      <!-- Manufacturer Barcode Covered with Opaque White Label -->
      <rect x="260" y="780" width="440" height="180" rx="8" fill="#ffffff" stroke="#3f3f46" stroke-width="3" />
      <text x="480" y="860" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle">OPAQUE COVER LABEL</text>
      <text x="480" y="900" font-family="Arial, sans-serif" font-size="18" fill="#52525b" text-anchor="middle">Manufacturer barcode covered completely</text>
    </svg>
  `;

  // Label: Compliant FNSKU Label on Flat Surface
  const compliantLabelSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Box surface -->
      <rect x="140" y="160" width="680" height="960" rx="16" fill="#27272a" stroke="#3f3f46" stroke-width="4" />
      <text x="480" y="240" font-family="Arial, sans-serif" font-size="22" fill="#a1a1aa" text-anchor="middle">Back / Label Panel (Flat Outer Surface)</text>
      
      <!-- White FNSKU Sticker -->
      <rect x="240" y="360" width="480" height="420" rx="8" fill="#ffffff" stroke="#71717a" stroke-width="3" />
      
      <!-- Barcode -->
      ${generateBarcodeSvg(270, 420, 420, 140, "X00DUMMY001")}
      
      <!-- Label Details -->
      <text x="480" y="660" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#000000" text-anchor="middle">Organic Plant Protein Bars (12 Pack)</text>
      <text x="480" y="700" font-family="Arial, sans-serif" font-size="18" fill="#18181b" text-anchor="middle">Condition: New</text>
      
      <!-- Verification callout -->
      <rect x="280" y="880" width="400" height="80" rx="8" fill="#065f46" />
      <text x="480" y="928" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#a7f3d0" text-anchor="middle">FNSKU Placed on Flat Surface</text>
    </svg>
  `;

  await createSvgImage(compliantFrontSvg, path.join(compliantDir, "front.jpeg"));
  await createSvgImage(compliantBackSvg, path.join(compliantDir, "back.jpeg"));
  await createSvgImage(compliantLabelSvg, path.join(compliantDir, "label.jpeg"));
  console.log("Created DEMO-COMPLIANT fixture images.");

  // 2. DEMO-RECOVERY
  const recoveryDir = path.join(baseDir, "DEMO-RECOVERY");

  // Front: Tea Box
  const recoveryFrontSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="4" />
      <rect x="220" y="250" width="520" height="300" rx="12" fill="#292524" />
      <text x="480" y="380" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="#eab308" text-anchor="middle">HERBAL HARVEST</text>
      <text x="480" y="440" font-family="Arial, sans-serif" font-size="26" fill="#d6d3d1" text-anchor="middle">Organic Chamomile Herbal Tea</text>
      <text x="480" y="490" font-family="Arial, sans-serif" font-size="20" fill="#a8a29e" text-anchor="middle">50 Tea Bags | Net Wt 100g</text>
      <rect x="360" y="650" width="240" height="60" rx="30" fill="#854d0e" />
      <text x="480" y="688" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#fef08a" text-anchor="middle">USDA ORGANIC</text>
    </svg>
  `;

  // Label: FNSKU label
  const recoveryLabelSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="140" y="160" width="680" height="960" rx="16" fill="#292524" stroke="#44403c" stroke-width="4" />
      <!-- White FNSKU Sticker -->
      <rect x="240" y="360" width="480" height="420" rx="8" fill="#ffffff" stroke="#78716c" stroke-width="3" />
      ${generateBarcodeSvg(270, 420, 420, 140, "X00DUMMY003")}
      <text x="480" y="660" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#000000" text-anchor="middle">Organic Chamomile Tea 50ct</text>
      <text x="480" y="700" font-family="Arial, sans-serif" font-size="18" fill="#1c1917" text-anchor="middle">Condition: New</text>
    </svg>
  `;

  // Back (Pass 1 - Blurred / Illegible Expiry Stamp)
  const recoveryBackBlurSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blurFilter">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#1c1917" stroke="#44403c" stroke-width="4" />
      <rect x="220" y="240" width="520" height="380" fill="#ffffff" rx="8" />
      <text x="240" y="290" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#000000">Product Details &amp; Brewing</text>
      <text x="240" y="340" font-family="Arial, sans-serif" font-size="18" fill="#44403c">Steep 1 bag in 8oz boiling water for 5 minutes.</text>
      
      <!-- Date stamp area - BLURRED / ILLEGIBLE -->
      <rect x="260" y="680" width="440" height="150" rx="6" fill="#e7e5e4" stroke="#a8a29e" />
      <text x="480" y="720" font-family="Arial, sans-serif" font-size="18" fill="#78716c" text-anchor="middle">Printed Expiry Date (Unfocused / Low Contrast)</text>
      <g filter="url(#blurFilter)">
        <text x="480" y="780" font-family="'Courier New', monospace" font-size="32" font-weight="bold" fill="#78716c" text-anchor="middle">EXP 2027-10-31 LOT402B</text>
      </g>

      <!-- Manufacturer Barcode Covered with Opaque White Label -->
      <rect x="260" y="870" width="440" height="120" rx="6" fill="#ffffff" stroke="#78716c" stroke-width="2" />
      <text x="480" y="930" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#1c1917" text-anchor="middle">OPAQUE COVER LABEL</text>
      <text x="480" y="960" font-family="Arial, sans-serif" font-size="15" fill="#44403c" text-anchor="middle">Manufacturer barcode covered</text>
    </svg>
  `;

  // Back Close-up (Pass 2 - Sharp / Legible Expiry Stamp)
  const recoveryBackSharpSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Macro camera frame -->
      <rect x="100" y="160" width="760" height="960" rx="16" fill="#292524" stroke="#eab308" stroke-width="4" />
      <text x="480" y="230" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#fef08a" text-anchor="middle">MACRO CLOSE-UP — EXPIRATION STAMP</text>
      
      <!-- Crisp Macro Stamp Display -->
      <rect x="160" y="280" width="640" height="420" rx="12" fill="#ffffff" stroke="#000000" stroke-width="4" />
      <text x="480" y="370" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#78716c" text-anchor="middle">HIGH-RESOLUTION INKJET STAMP</text>
      <text x="480" y="480" font-family="'Courier New', monospace" font-size="48" font-weight="bold" fill="#000000" text-anchor="middle">EXP 2027-10-31</text>
      <text x="480" y="560" font-family="'Courier New', monospace" font-size="32" font-weight="bold" fill="#1c1917" text-anchor="middle">LOT: 402B-US-09</text>

      <!-- Manufacturer Barcode Covered with Opaque White Label -->
      <rect x="220" y="740" width="520" height="150" rx="8" fill="#ffffff" stroke="#78716c" stroke-width="3" />
      <text x="480" y="810" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#1c1917" text-anchor="middle">OPAQUE COVER LABEL</text>
      <text x="480" y="850" font-family="Arial, sans-serif" font-size="16" fill="#44403c" text-anchor="middle">Manufacturer barcode covered completely</text>
      
      <rect x="240" y="930" width="480" height="70" rx="8" fill="#15803d" />
      <text x="480" y="975" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#dcfce7" text-anchor="middle">Targeted Close-Up Verification</text>
    </svg>
  `;

  await createSvgImage(recoveryFrontSvg, path.join(recoveryDir, "front.jpeg"));
  await createSvgImage(recoveryLabelSvg, path.join(recoveryDir, "label.jpeg"));
  await createSvgImage(recoveryBackBlurSvg, path.join(recoveryDir, "back.jpeg"));
  await createSvgImage(recoveryBackSharpSvg, path.join(recoveryDir, "back_closeup.jpeg"));
  console.log("Created DEMO-RECOVERY fixture images (both pass 1 and pass 2 close-up).");

  // 3. DEMO-DEFECT (Tech Pouch: Physical Defect Exposed Manufacturer Barcode -> Corrected)
  const defectDir = path.join(baseDir, "DEMO-DEFECT");
  
  // Front: Tech Pouch Box
  const defectFrontSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#0f172a" stroke="#334155" stroke-width="4" />
      <rect x="220" y="250" width="520" height="300" rx="12" fill="#1e293b" />
      <text x="480" y="380" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#38bdf8" text-anchor="middle">URBAN GEAR</text>
      <text x="480" y="440" font-family="Arial, sans-serif" font-size="26" fill="#94a3b8" text-anchor="middle">Tech Organizer Pouch</text>
      <text x="480" y="490" font-family="Arial, sans-serif" font-size="20" fill="#64748b" text-anchor="middle">Weatherproof Nylon | Cable &amp; Accessory Storage</text>
      <rect x="340" y="650" width="280" height="60" rx="30" fill="#0369a1" />
      <text x="480" y="688" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#bae6fd" text-anchor="middle">PREMIUM CORDURA</text>
      <text x="480" y="1000" font-family="Arial, sans-serif" font-size="18" fill="#475569" text-anchor="middle">Front View — Retail Box</text>
    </svg>
  `;

  // Label: FNSKU label for Tech Pouch with X00DUMMY002
  const defectLabelSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <rect x="140" y="160" width="680" height="960" rx="16" fill="#1e293b" stroke="#334155" stroke-width="4" />
      <text x="480" y="240" font-family="Arial, sans-serif" font-size="22" fill="#94a3b8" text-anchor="middle">Outer Surface / Label Panel</text>
      
      <!-- White FNSKU Sticker -->
      <rect x="240" y="360" width="480" height="420" rx="8" fill="#ffffff" stroke="#64748b" stroke-width="3" />
      ${generateBarcodeSvg(270, 420, 420, 140, "X00DUMMY002")}
      <text x="480" y="660" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#000000" text-anchor="middle">Tech Organizer Pouch (Black)</text>
      <text x="480" y="700" font-family="Arial, sans-serif" font-size="18" fill="#0f172a" text-anchor="middle">Condition: New</text>
      
      <rect x="280" y="880" width="400" height="80" rx="8" fill="#0369a1" />
      <text x="480" y="928" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#bae6fd" text-anchor="middle">FNSKU Placed on Flat Surface</text>
    </svg>
  `;

  // Back with visibly uncovered manufacturer barcode (contradictory defect)
  const defectBackSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Box body -->
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#0f172a" stroke="#334155" stroke-width="4" />
      <rect x="220" y="240" width="520" height="420" fill="#ffffff" rx="8" />
      <text x="240" y="280" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#000000">Product Specifications</text>
      <line x1="240" y1="295" x2="720" y2="295" stroke="#000000" stroke-width="6" />
      <text x="240" y="335" font-family="Arial, sans-serif" font-size="18" fill="#000000">Model: UGP-200 | Dimensions: 24 x 14 x 6 cm</text>
      <text x="240" y="375" font-family="Arial, sans-serif" font-size="18" fill="#000000">Material: Water-resistant ballistic nylon</text>
      <text x="240" y="415" font-family="Arial, sans-serif" font-size="18" fill="#000000">Compatible with cables, chargers, adapters, SD cards</text>
      
      <!-- Manufacturer Barcode UNCOVERED / EXPOSED (Defect) -->
      <rect x="240" y="740" width="480" height="260" rx="8" fill="#ffffff" stroke="#e11d48" stroke-width="4" />
      <text x="480" y="780" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#e11d48" text-anchor="middle">ORIGINAL MANUFACTURER UPC BARCODE</text>
      ${generateBarcodeSvg(270, 800, 420, 120, "8906050590022")}
      <text x="480" y="980" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#be123c" text-anchor="middle">UNCOVERED / EXPOSED</text>
    </svg>
  `;

  // Back with manufacturer barcode covered by opaque label (Corrected)
  const defectBackCorrectedSvg = `
    <svg width="960" height="1280" xmlns="http://www.w3.org/2000/svg">
      <rect width="960" height="1280" fill="#f4f4f5" />
      <!-- Box body -->
      <rect x="180" y="200" width="600" height="880" rx="16" fill="#0f172a" stroke="#334155" stroke-width="4" />
      <rect x="220" y="240" width="520" height="420" fill="#ffffff" rx="8" />
      <text x="240" y="280" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#000000">Product Specifications</text>
      <line x1="240" y1="295" x2="720" y2="295" stroke="#000000" stroke-width="6" />
      <text x="240" y="335" font-family="Arial, sans-serif" font-size="18" fill="#000000">Model: UGP-200 | Dimensions: 24 x 14 x 6 cm</text>
      <text x="240" y="375" font-family="Arial, sans-serif" font-size="18" fill="#000000">Material: Water-resistant ballistic nylon</text>
      <text x="240" y="415" font-family="Arial, sans-serif" font-size="18" fill="#000000">Compatible with cables, chargers, adapters, SD cards</text>
      
      <!-- Manufacturer Barcode Covered with Opaque White Label (CORRECTED) -->
      <rect x="240" y="740" width="480" height="260" rx="8" fill="#ffffff" stroke="#334155" stroke-width="3" />
      <text x="480" y="860" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle">OPAQUE COVER LABEL</text>
      <text x="480" y="900" font-family="Arial, sans-serif" font-size="18" fill="#64748b" text-anchor="middle">Manufacturer barcode covered completely</text>
    </svg>
  `;

  await createSvgImage(defectFrontSvg, path.join(defectDir, "front.jpeg"));
  await createSvgImage(defectLabelSvg, path.join(defectDir, "label.jpeg"));
  await createSvgImage(defectBackSvg, path.join(defectDir, "back.jpeg"));
  await createSvgImage(defectBackCorrectedSvg, path.join(defectDir, "back_corrected.jpeg"));
  console.log("Created DEMO-DEFECT fixture images (uncovered manufacturer barcode and back_corrected).");
}

main().catch((err) => {
  console.error("Error creating demo fixtures:", err);
  process.exit(1);
});
