/** Read a browser File as base64 without pulling any optional AI/PDF code. */
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}


/** Longest edge of a photo sent for transcription; enough for handwriting, bounded for payload size. */
export const AI_IMAGE_MAX_EDGE = 2400;

/**
 * Prepare a photo for the AI transcription task.
 *
 * Re-encoding through a canvas drops every metadata block a phone camera
 * writes — GPS coordinates, device serial numbers, capture time — and bounds
 * the size. The result is always a JPEG. If the browser cannot re-encode, the
 * original bytes are returned and the shared egress policy strips JPEG/PNG
 * metadata (and refuses other formats) before anything is sent.
 */
export async function imageForAi(file: File): Promise<{ base64: string; mediaType: string }> {
  if (typeof createImageBitmap === "function" && typeof document !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, AI_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const base64 = dataUrl.split(",")[1] ?? "";
        if (base64) return { base64, mediaType: "image/jpeg" };
      } else {
        bitmap.close();
      }
    } catch {
      // Fall through to the raw bytes; the egress policy still strips metadata.
    }
  }
  return { base64: await toBase64(file), mediaType: file.type || "image/jpeg" };
}

/** Longest edge of a photo kept on a card: sharp on a phone, small enough to sync. */
export const CARD_IMAGE_MAX_EDGE = 1400;
/** Deck import accepts media up to 2 MB of data URL; stay well inside it. */
export const CARD_IMAGE_MAX_CHARS = 1_500_000;

/**
 * Prepare a photo of a diagram for a card's `imageUrl`: re-encoded through a
 * canvas (which drops the camera's GPS and device metadata, since the card
 * syncs and exports), scaled to CARD_IMAGE_MAX_EDGE, and stepped down in
 * quality until the data URL fits CARD_IMAGE_MAX_CHARS. Null when the browser
 * cannot decode the file or it cannot be made small enough; unlike the AI
 * path there is no raw fallback, because the raw bytes would carry metadata.
 */
export async function imageForCard(file: File): Promise<string | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    for (const edge of [CARD_IMAGE_MAX_EDGE, 1000]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      // A transparent PNG (a screenshot of a figure) would turn black as a JPEG.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length <= CARD_IMAGE_MAX_CHARS) return dataUrl;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
