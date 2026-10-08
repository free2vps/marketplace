import crypto from 'node:crypto';

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// "2026-10-08 12:30:00" (WIB) -> Date
export function parseWib(text) {
  if (!text) return null;
  const d = new Date(String(text).replace(' ', 'T') + '+07:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
