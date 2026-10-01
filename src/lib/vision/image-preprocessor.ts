import sharp from "sharp";

export interface PreprocessedImage {
  imageId: string;
  mimeType: string;
  imageData: Buffer;
  originalWidth: number;
  originalHeight: number;
  originalByteSize: number;
  processedWidth: number;
  processedHeight: number;
  processedByteSize: number;
}

export interface PreprocessingSummary {
  preprocessingMs: number;
  images: PreprocessedImage[];
}

export const MAX_IMAGE_DIMENSION = 1280;
export const PREPROCESS_JPEG_QUALITY = 85;

/**
 * Preprocesses a single image for vision model ingestion:
 * - Constrains longest edge to approximately 1280px
 * - Preserves aspect ratio (fit: inside)
 * - Never upscales (withoutEnlargement: true)
 * - Encodes with sensible JPEG quality (85) for crisp barcode/text legibility
 * - Records original and processed dimensions and byte sizes
 */
export async function preprocessImage(params: {
  imageId: string;
  mimeType: string;
  imageData: Buffer | Uint8Array | string;
}): Promise<PreprocessedImage> {
  const { imageId, imageData } = params;
  let buffer: Buffer;
  if (Buffer.isBuffer(imageData)) {
    buffer = imageData;
  } else if (imageData instanceof Uint8Array) {
    buffer = Buffer.from(imageData);
  } else if (typeof imageData === "string") {
    const base64Data = imageData.includes(",")
      ? imageData.split(",")[1]
      : imageData;
    buffer = Buffer.from(base64Data, "base64");
  } else {
    throw new Error(`Invalid image data type for image ${imageId}`);
  }

  const originalByteSize = buffer.length;
  const imageInstance = sharp(buffer);
  const metadata = await imageInstance.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  // Never upscale; constrain longest edge to approximately 1280px while preserving aspect ratio
  const needsResize =
    originalWidth > MAX_IMAGE_DIMENSION ||
    originalHeight > MAX_IMAGE_DIMENSION;

  let transformer = sharp(buffer).rotate(); // auto-orient via EXIF

  if (needsResize) {
    transformer = transformer.resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const processedBuffer = await transformer
    .jpeg({
      quality: PREPROCESS_JPEG_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();

  const processedMeta = await sharp(processedBuffer).metadata();

  return {
    imageId,
    mimeType: "image/jpeg",
    imageData: processedBuffer,
    originalWidth,
    originalHeight,
    originalByteSize,
    processedWidth: processedMeta.width ?? originalWidth,
    processedHeight: processedMeta.height ?? originalHeight,
    processedByteSize: processedBuffer.length,
  };
}

/**
 * Batch preprocesses all supplied images consistently.
 */
export async function preprocessImages(
  images: Array<{
    imageId: string;
    mimeType: string;
    imageData: Buffer | Uint8Array | string;
  }>
): Promise<PreprocessingSummary> {
  const startTime = Date.now();
  const preprocessed = await Promise.all(
    images.map((img) => preprocessImage(img))
  );
  const preprocessingMs = Date.now() - startTime;
  return {
    preprocessingMs,
    images: preprocessed,
  };
}
