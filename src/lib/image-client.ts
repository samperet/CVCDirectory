/**
 * Center-crop an image to a square and downscale it in the browser, so
 * uploads are small and consistent. PNG keeps transparency (for logos and
 * icons); JPEG keeps photos small.
 */
export async function prepareSquareImage(file: File, size: number, type: "image/jpeg" | "image/png"): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file couldn't be read as an image. Try a JPEG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(size, side);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't process the image.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the image."))), type, 0.85)
  );
}

/** Upload a prepared image as the raw request body; throws with the server's message on failure. */
export async function uploadImage(url: string, blob: Blob): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  if (!res.ok) {
    const detail = await res.json().then((body) => body?.detail).catch(() => null);
    throw new Error(detail ?? "Upload failed");
  }
}
