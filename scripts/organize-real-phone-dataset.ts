import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

async function main() {
  const phoneDir = path.join(
    process.cwd(),
    "fixtures",
    "prep",
    "dev",
    "REAL-WORLD",
    "REAL-PHONE-001"
  );
  const tempDir =
    "C:/Users/Preethika/.gemini/antigravity-ide/brain/ca9fca88-bce7-4762-b0db-382e96f66fc2/.tempmediaStorage";

  const originalDir = path.join(phoneDir, "original");
  const adversarialDir = path.join(phoneDir, "adversarial");

  if (!fs.existsSync(originalDir)) fs.mkdirSync(originalDir, { recursive: true });
  if (!fs.existsSync(adversarialDir)) fs.mkdirSync(adversarialDir, { recursive: true });

  // 1. Genuine original untouched photographs
  const origFrontSrc = path.join(tempDir, "media_1790835061027.jpg");
  const origBackSrc = path.join(tempDir, "media_1790835072080.jpg");
  const origLabelSrc = path.join(tempDir, "media_1790834897468.jpg");

  fs.copyFileSync(origFrontSrc, path.join(originalDir, "front.jpeg"));
  fs.copyFileSync(origBackSrc, path.join(originalDir, "back.jpeg"));
  fs.copyFileSync(origLabelSrc, path.join(originalDir, "label.jpeg"));

  console.log("Original untouched images populated in REAL-PHONE-001/original/:");
  console.log("  front.jpeg:", fs.statSync(path.join(originalDir, "front.jpeg")).size, "bytes");
  console.log("  back.jpeg:", fs.statSync(path.join(originalDir, "back.jpeg")).size, "bytes");
  console.log("  label.jpeg:", fs.statSync(path.join(originalDir, "label.jpeg")).size, "bytes");

  // 2. Adversarial modifications
  // A. wrong-fnsku.jpeg: Current label.jpeg containing X00WRONG999
  const currentLabelPath = path.join(phoneDir, "label.jpeg");
  if (fs.existsSync(currentLabelPath)) {
    fs.copyFileSync(currentLabelPath, path.join(adversarialDir, "wrong-fnsku.jpeg"));
  }

  // B. covered-manufacturer-barcode.jpeg: Current back.jpeg containing covered opaque label
  const currentBackPath = path.join(phoneDir, "back.jpeg");
  if (fs.existsSync(currentBackPath)) {
    fs.copyFileSync(currentBackPath, path.join(adversarialDir, "covered-manufacturer-barcode.jpeg"));
  }

  // C. exposed-manufacturer-barcode.jpeg: Left half of corrected-back.png
  const correctedBackPath = path.join(phoneDir, "corrected-back.png");
  if (fs.existsSync(correctedBackPath)) {
    await sharp(correctedBackPath)
      .extract({ left: 0, top: 0, width: 800, height: 980 })
      .jpeg({ quality: 92 })
      .toFile(path.join(adversarialDir, "exposed-manufacturer-barcode.jpeg"));
  }

  // D. correct-fnsku.jpeg: Create by compositing X00REALPHN01 barcode over the label area
  const wrongFnskuPath = path.join(adversarialDir, "wrong-fnsku.jpeg");
  if (fs.existsSync(wrongFnskuPath)) {
    // Generate SVG for correct FNSKU X00REALPHN01
    // In wrong-fnsku.jpeg (1600x900), the sticker is at x=540, y=740, w=520, h=160
    const correctLabelSvg = `
      <svg width="530" height="155" xmlns="http://www.w3.org/2000/svg">
        <rect width="530" height="155" rx="14" fill="#ffffff" stroke="#e4e4e7" stroke-width="2" />
        <text x="265" y="32" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#000000" text-anchor="middle">TEST FNSKU</text>
        <rect x="55" y="44" width="4" height="60" fill="#000" />
        <rect x="63" y="44" width="6" height="60" fill="#000" />
        <rect x="73" y="44" width="2" height="60" fill="#000" />
        <rect x="80" y="44" width="8" height="60" fill="#000" />
        <rect x="94" y="44" width="4" height="60" fill="#000" />
        <rect x="104" y="44" width="6" height="60" fill="#000" />
        <rect x="114" y="44" width="2" height="60" fill="#000" />
        <rect x="122" y="44" width="8" height="60" fill="#000" />
        <rect x="136" y="44" width="4" height="60" fill="#000" />
        <rect x="146" y="44" width="6" height="60" fill="#000" />
        <rect x="156" y="44" width="2" height="60" fill="#000" />
        <rect x="164" y="44" width="8" height="60" fill="#000" />
        <rect x="178" y="44" width="4" height="60" fill="#000" />
        <rect x="188" y="44" width="6" height="60" fill="#000" />
        <rect x="198" y="44" width="4" height="60" fill="#000" />
        <rect x="208" y="44" width="8" height="60" fill="#000" />
        <rect x="222" y="44" width="4" height="60" fill="#000" />
        <rect x="232" y="44" width="6" height="60" fill="#000" />
        <rect x="244" y="44" width="4" height="60" fill="#000" />
        <rect x="254" y="44" width="8" height="60" fill="#000" />
        <rect x="268" y="44" width="4" height="60" fill="#000" />
        <rect x="278" y="44" width="6" height="60" fill="#000" />
        <rect x="290" y="44" width="4" height="60" fill="#000" />
        <rect x="300" y="44" width="8" height="60" fill="#000" />
        <rect x="314" y="44" width="4" height="60" fill="#000" />
        <rect x="324" y="44" width="6" height="60" fill="#000" />
        <rect x="336" y="44" width="4" height="60" fill="#000" />
        <rect x="346" y="44" width="8" height="60" fill="#000" />
        <rect x="360" y="44" width="4" height="60" fill="#000" />
        <rect x="370" y="44" width="6" height="60" fill="#000" />
        <rect x="382" y="44" width="4" height="60" fill="#000" />
        <rect x="392" y="44" width="8" height="60" fill="#000" />
        <rect x="406" y="44" width="4" height="60" fill="#000" />
        <rect x="416" y="44" width="6" height="60" fill="#000" />
        <rect x="428" y="44" width="4" height="60" fill="#000" />
        <rect x="438" y="44" width="8" height="60" fill="#000" />
        <rect x="452" y="44" width="4" height="60" fill="#000" />
        <rect x="462" y="44" width="6" height="60" fill="#000" />
        <rect x="472" y="44" width="4" height="60" fill="#000" />
        <text x="265" y="132" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle">X00REALPHN01</text>
      </svg>
    `;

    await sharp(wrongFnskuPath)
      .composite([
        {
          input: Buffer.from(correctLabelSvg),
          top: 730,
          left: 535,
        },
      ])
      .jpeg({ quality: 92 })
      .toFile(path.join(adversarialDir, "correct-fnsku.jpeg"));
  }

  console.log("Adversarial images populated in REAL-PHONE-001/adversarial/:");
  for (const f of fs.readdirSync(adversarialDir)) {
    console.log("  " + f + ":", fs.statSync(path.join(adversarialDir, f)).size, "bytes");
  }

  // 3. Populate root REAL-PHONE-001 with GENUINE UNTOUCHED ORIGINAL PHOTOGRAPHS
  // so any default loader/pipeline strictly uses untouched photographs
  fs.copyFileSync(path.join(originalDir, "front.jpeg"), path.join(phoneDir, "front.jpeg"));
  fs.copyFileSync(path.join(originalDir, "back.jpeg"), path.join(phoneDir, "back.jpeg"));
  fs.copyFileSync(path.join(originalDir, "label.jpeg"), path.join(phoneDir, "label.jpeg"));

  // Remove temporary exposed_test.jpeg if present
  const exposedTestPath = path.join(phoneDir, "exposed_test.jpeg");
  if (fs.existsSync(exposedTestPath)) fs.unlinkSync(exposedTestPath);

  console.log("\nRoot REAL-PHONE-001 images updated to genuine originals:");
  console.log("  front.jpeg:", fs.statSync(path.join(phoneDir, "front.jpeg")).size, "bytes");
  console.log("  back.jpeg:", fs.statSync(path.join(phoneDir, "back.jpeg")).size, "bytes");
  console.log("  label.jpeg:", fs.statSync(path.join(phoneDir, "label.jpeg")).size, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
