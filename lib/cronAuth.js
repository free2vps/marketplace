// Pekerjaan terjadwal hanya boleh dijalankan pemilik: wajib membawa CRON_SECRET.
// Vercel Cron otomatis mengirim "Authorization: Bearer <CRON_SECRET>".
// Penjadwal luar (mis. cron-job.org) bisa memakai header yang sama atau ?key=<CRON_SECRET>.
import crypto from 'node:crypto';

export function isAuthorizedCron(request) {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) return false; // tanpa rahasia yang cukup panjang, pekerjaan terjadwal nonaktif
  const header = request.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : new URL(request.url).searchParams.get('key') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
