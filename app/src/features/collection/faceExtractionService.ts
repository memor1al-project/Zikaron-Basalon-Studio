import * as faceapi from "face-api.js";

let modelsLoaded = false;

/** Loads face-api.js model weights from /public/models (idempotent). */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const MODEL_URL = "/models";
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export interface FaceBox {
  /** Fractions of the image's width/height (0-1), so an overlay works at any rendered size. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedFace {
  dataUrl: string;
  box: FaceBox;
  /** 128-number face embedding — what makes "the same person elsewhere" answerable. */
  descriptor: number[];
}

/** Detects faces in an already-loaded <img> element and crops each to a circular PNG data URL. */
export async function extractFacesFromImage(imgEl: HTMLImageElement): Promise<ExtractedFace[]> {
  await loadFaceModels();

  const detections = await faceapi.detectAllFaces(imgEl).withFaceLandmarks().withFaceDescriptors();
  const imageWidth = imgEl.naturalWidth || 1;
  const imageHeight = imgEl.naturalHeight || 1;

  return detections
    .map((d) => {
      const pixelBox = {
        x: d.detection.box.x,
        y: d.detection.box.y,
        width: d.detection.box.width,
        height: d.detection.box.height,
      };
      const dataUrl = extractFaceImageFromElement(imgEl, pixelBox);
      if (!dataUrl) return null;
      return {
        dataUrl,
        // Stored normalized: the same photo is rendered at different sizes in the detail
        // panel and the grid, and pixel boxes would only line up in one of them.
        box: {
          x: pixelBox.x / imageWidth,
          y: pixelBox.y / imageHeight,
          width: pixelBox.width / imageWidth,
          height: pixelBox.height / imageHeight,
        },
        descriptor: Array.from(d.descriptor),
      };
    })
    .filter((f): f is ExtractedFace => f !== null);
}

/**
 * How far apart two faces are. Below ~0.6 is the accepted threshold for "same person" with
 * face-api.js's recognition net; it is a similarity score, never a identification.
 */
export const SAME_PERSON_THRESHOLD = 0.6;

export function faceDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * How large a stored face crop may be.
 *
 * These are shown at 64px at most, so 200 covers even a 3x display. They used to be saved
 * at the source photograph's own resolution: on a modern camera image a single face came
 * to a few hundred KB as a PNG data URL, and two or three tagged faces could push a
 * material's metadata past Firestore's 1MB per-document limit — losing the summary and
 * transcript stored alongside them, because it's one write.
 */
const FACE_CROP_SIZE = 200;

/** Circular, saturation-boosted crop around a detected face box. */
function extractFaceImageFromElement(
  image: HTMLImageElement,
  box: { x: number; y: number; width: number; height: number },
  padding: number = 30
): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const size = Math.max(box.width, box.height) + padding * 2;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  const srcX = Math.max(0, centerX - size / 2);
  const srcY = Math.max(0, centerY - size / 2);
  const srcWidth = Math.min(image.naturalWidth - srcX, size);
  const srcHeight = Math.min(image.naturalHeight - srcY, size);

  const sourceSize = Math.min(srcWidth, srcHeight);
  // Never upscale: a small face in a low-resolution scan should stay its own size rather
  // than being blown up into a blurry 200px square.
  const canvasSize = Math.min(sourceSize, FACE_CROP_SIZE);
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  // JPEG has no transparency, so the area outside the circle is filled with the page cream
  // rather than left to become black. Every place a crop is shown clips it to a circle, so
  // this is only insurance for a context that doesn't.
  ctx.fillStyle = "#f7f3ec";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  ctx.beginPath();
  ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(image, srcX, srcY, sourceSize, sourceSize, 0, 0, canvasSize, canvasSize);

  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const avg = (r + g + b) / 3;
    const boost = 1.2;
    data[i] = Math.min(255, avg + (r - avg) * boost);
    data[i + 1] = Math.min(255, avg + (g - avg) * boost);
    data[i + 2] = Math.min(255, avg + (b - avg) * boost);
  }
  ctx.putImageData(imageData, 0, 0);

  // JPEG, not PNG: a photographic crop compresses to a few KB this way against tens of KB
  // as PNG, and these are stored inline in the material's metadata document.
  return canvas.toDataURL("image/jpeg", 0.82);
}
