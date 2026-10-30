import { getObjectUrlFor } from "./storage/blobUrl";
import { loadChunk } from "./loadChunk";
import type { ProviderFile } from "./storage/types";

/**
 * A small JPEG preview of a material, as a data URL.
 *
 * Stored in the folder's SQLite sidecar so a material still has a face when its file isn't
 * reachable — picked from another folder and not yet copied in, moved, renamed, or opened
 * on a machine that only has the database. Without one, everything the story remembers but
 * can't open is an anonymous grey square.
 *
 * Deliberately small: 200px at quality 0.6 is ~6-12KB of base64, so a folder of a few
 * hundred materials adds a couple of megabytes to the sidecar rather than hundreds.
 */

const MAX_EDGE = 200;
const QUALITY = 0.6;

/**
 * A hair past zero rather than exactly zero.
 *
 * Seeking to 0 routinely yields a blank frame: the browser may report the seek complete
 * before the first frame has decoded, and many recordings open on a fade from black. A
 * tenth of a second is still the opening frame to any viewer, and reliably has picture.
 */
const FIRST_FRAME_SECONDS = 0.1;

/** Materials we can currently draw a preview for. */
export function canThumbnail(file: ProviderFile): boolean {
  return (
    file.mimeType.startsWith("image/") ||
    file.mimeType.startsWith("video/") ||
    file.mimeType === "application/pdf"
  );
}

export async function makeThumbnail(file: ProviderFile): Promise<string | null> {
  if (!canThumbnail(file)) return null;

  try {
    const url = await getObjectUrlFor(file);

    if (file.mimeType.startsWith("image/")) return await fromImage(url);
    if (file.mimeType.startsWith("video/")) return await fromVideoFirstFrame(url);
    return await fromPdfFirstPage(url);
  } catch {
    // Unreadable, unsupported codec, or a tainted canvas — a missing thumbnail is not
    // worth failing a save over.
    return null;
  }
}

/** Scales to fit MAX_EDGE and encodes, shared by all three sources. */
function encode(source: CanvasImageSource, width: number, height: number): string | null {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function fromImage(url: string): Promise<string | null> {
  const image = await loadImage(url);
  return encode(image, image.naturalWidth, image.naturalHeight);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });
}

/**
 * The opening frame of a video.
 *
 * Muted and playsInline because some browsers refuse to decode frames for a video they
 * consider capable of making noise without a user gesture.
 */
function fromVideoFirstFrame(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const cleanUp = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.onloadeddata = () => {
      // Seeking must wait until there is something to seek within.
      video.currentTime = Math.min(FIRST_FRAME_SECONDS, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const result = encode(video, video.videoWidth, video.videoHeight);
      cleanUp();
      resolve(result);
    };
    video.onerror = () => {
      cleanUp();
      reject(new Error("Could not read this video"));
    };

    video.src = url;
  });
}

/** The first page of a PDF, rendered by the same pdf.js the text extractor uses. */
async function fromPdfFirstPage(url: string): Promise<string | null> {
  const pdfjs = await loadChunk(() => import("pdfjs-dist"), "The PDF reader");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await loadChunk(() => import("pdfjs-dist/build/pdf.worker.min.mjs?url"), "The PDF reader")
  ).default as string;

  const pdf = await pdfjs.getDocument({ url }).promise;
  const page = await pdf.getPage(1);

  // Render at the size we intend to keep rather than full size and scale down — a
  // scanned A4 page at full resolution is a large canvas for a 200px result.
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, MAX_EDGE / Math.max(base.width, base.height)) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) return null;

  // A PDF page is transparent where nothing is drawn, which encodes to black in JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", QUALITY);
}
