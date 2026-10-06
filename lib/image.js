// Kompres foto di browser sebelum diupload supaya penyimpanan hemat.
// Hasil: WebP (atau JPEG kalau browser tidak mendukung WebP).

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file, { maxSide, targetBytes }) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();

  const probe = await encode(canvas, 'image/webp', 0.8);
  const type = probe && probe.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  let blob = null;
  for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    blob = await encode(canvas, type, quality);
    if (blob && blob.size <= targetBytes) break;
  }

  if (!blob || blob.size > 200 * 1024) {
    throw new Error('Foto terlalu besar untuk dikompres. Coba foto lain.');
  }
  return { blob, ext: type === 'image/webp' ? 'webp' : 'jpg' };
}
