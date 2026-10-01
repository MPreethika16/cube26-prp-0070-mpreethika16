import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

const DEV_FIXTURES = path.join(process.cwd(), "fixtures", "prep", "dev");
const STRESS_DIR = path.join(process.cwd(), "fixtures", "prep", "stress_test");

interface ScenarioConfig {
  id: string;
  name: string;
  description: string;
  sourceUnitId: string;
  featureChallenged: string;
  transformLabel: (srcBuffer: Buffer) => Promise<Buffer>;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "STRESS-01-MODERATE-BLUR",
    name: "Moderate Optical Blur",
    description: "Gaussian blur sigma=5 applied to label image",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "FNSKU legibility under motion blur",
    transformLabel: async (buf) => {
      return await sharp(buf).blur(5).jpeg({ quality: 85 }).toBuffer();
    },
  },
  {
    id: "STRESS-02-SEVERE-BLUR",
    name: "Severe Out-of-Focus Blur",
    description: "Gaussian blur sigma=18 applied to label image (text completely unreadable)",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "FNSKU legibility under severe defocus (must not guess text)",
    transformLabel: async (buf) => {
      return await sharp(buf).blur(18).jpeg({ quality: 85 }).toBuffer();
    },
  },
  {
    id: "STRESS-03-PARTIAL-CROP",
    name: "Partial Horizontal Crop",
    description: "Right 45% of label image cropped away, truncating barcode & text",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "FNSKU barcode and text completeness (must not hallucinate truncated characters)",
    transformLabel: async (buf) => {
      const meta = await sharp(buf).metadata();
      const w = Math.round((meta.width || 960) * 0.55);
      const h = meta.height || 1280;
      return await sharp(buf)
        .extract({ left: 0, top: 0, width: w, height: h })
        .jpeg({ quality: 85 })
        .toBuffer();
    },
  },
  {
    id: "STRESS-04-GLARE-OCCLUSION",
    name: "Specular Glare Occlusion",
    description: "Bright white specular flare composited over barcode center",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "FNSKU barcode decode under reflective glare (must not reconstruct hidden bars)",
    transformLabel: async (buf) => {
      const meta = await sharp(buf).metadata();
      const w = meta.width || 960;
      const h = meta.height || 1280;
      const cx = Math.round(w / 2);
      const cy = Math.round(h * 0.45);
      const rx = Math.round(w * 0.3);
      const ry = Math.round(h * 0.18);

      const glareSvg = Buffer.from(`
        <svg width="${w}" height="${h}">
          <defs>
            <radialGradient id="glare" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
              <stop offset="60%" stop-color="#ffffff" stop-opacity="0.85" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
            </radialGradient>
          </defs>
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#glare)" />
        </svg>
      `);

      return await sharp(buf)
        .composite([{ input: glareSvg, blend: "over" }])
        .jpeg({ quality: 85 })
        .toBuffer();
    },
  },
  {
    id: "STRESS-05-LOW-CONTRAST",
    name: "Severe Low Contrast & Washout",
    description: "Contrast crushed by 80% with elevated black level",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "Barcode and label detection under extreme underexposure/washout",
    transformLabel: async (buf) => {
      return await sharp(buf)
        .linear(0.2, 120) // a * input + b
        .jpeg({ quality: 85 })
        .toBuffer();
    },
  },
  {
    id: "STRESS-06-PARTIAL-LABEL",
    name: "Corner View Only (Partial Label)",
    description: "Cropped to top-left 25% corner showing packaging without barcode/text",
    sourceUnitId: "DEMO-COMPLIANT",
    featureChallenged: "Missing label view (must not claim absence of label on product)",
    transformLabel: async (buf) => {
      const meta = await sharp(buf).metadata();
      const w = Math.round((meta.width || 960) * 0.35);
      const h = Math.round((meta.height || 1280) * 0.35);
      return await sharp(buf)
        .extract({ left: 0, top: 0, width: w, height: h })
        .jpeg({ quality: 85 })
        .toBuffer();
    },
  },
];

async function generate() {
  if (!fs.existsSync(STRESS_DIR)) {
    fs.mkdirSync(STRESS_DIR, { recursive: true });
  }

  console.log("Generating stress test fixtures from real images...");

  for (const scenario of SCENARIOS) {
    const scenarioDir = path.join(STRESS_DIR, scenario.id);
    if (!fs.existsSync(scenarioDir)) {
      fs.mkdirSync(scenarioDir, { recursive: true });
    }

    const srcDir = path.join(DEV_FIXTURES, scenario.sourceUnitId);
    // Copy front.jpeg and back.jpeg unaltered
    fs.copyFileSync(
      path.join(srcDir, "front.jpeg"),
      path.join(scenarioDir, "front.jpeg")
    );
    fs.copyFileSync(
      path.join(srcDir, "back.jpeg"),
      path.join(scenarioDir, "back.jpeg")
    );

    // Transform label.jpeg
    const srcLabelBuf = fs.readFileSync(path.join(srcDir, "label.jpeg"));
    const transformedBuf = await scenario.transformLabel(srcLabelBuf);
    fs.writeFileSync(path.join(scenarioDir, "label.jpeg"), transformedBuf);

    console.log(`✓ Created ${scenario.id}: ${scenario.name} (${scenario.featureChallenged})`);
  }

  console.log("All stress fixtures generated successfully.");
}

generate().catch((err) => {
  console.error("Failed to generate stress fixtures:", err);
  process.exit(1);
});
