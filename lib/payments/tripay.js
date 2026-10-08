// Adapter TriPay (QRIS, closed payment).
// KERANGKA: ditulis dari pola umum TriPay dan BELUM diuji. Saat mendaftar, cocokkan nama field,
// rumus tanda tangan, dan kode metode (QRIS/QRISC) dengan dokumentasi resmi TriPay, lalu uji di sandbox.
import crypto from 'node:crypto';
import { safeEqual } from './util';

const base = () =>
  process.env.TRIPAY_IS_PRODUCTION === 'true'
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox';

export const enabled = () =>
  Boolean(
    process.env.TRIPAY_API_KEY && process.env.TRIPAY_PRIVATE_KEY && process.env.TRIPAY_MERCHANT_CODE
  );

export async function createQris({ orderCode, amount, customerName, customerPhone, items }) {
  const merchantCode = process.env.TRIPAY_MERCHANT_CODE;
  const amt = Math.round(amount);
  const signature = crypto
    .createHmac('sha256', process.env.TRIPAY_PRIVATE_KEY)
    .update(`${merchantCode}${orderCode}${amt}`)
    .digest('hex');

  const res = await fetch(`${base()}/transaction/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TRIPAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: process.env.TRIPAY_QRIS_METHOD || 'QRIS',
      merchant_ref: orderCode,
      amount: amt,
      customer_name: customerName,
      // Pembeli kita tanpa akun/email; TriPay meminta email, jadi pakai alamat pengganti.
      customer_email: process.env.TRIPAY_FALLBACK_EMAIL || 'pelanggan@example.com',
      customer_phone: customerPhone,
      order_items: items,
      expired_time: Math.floor(Date.now() / 1000) + 30 * 60,
      signature,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'TriPay gagal membuat kode QRIS');
  const d = json.data;
  return {
    providerRef: d.reference,
    qrString: d.qr_string || null,
    qrUrl: d.qr_url || null,
    expiresAt: d.expired_time ? new Date(d.expired_time * 1000) : null,
    fee: Number(d.fee_merchant ?? 0),
    raw: d,
  };
}

// Tanda tangan callback: HMAC-SHA256 dari isi mentah (raw body) dengan private key
export function verifyCallback(rawBody, signatureHeader) {
  const expected = crypto
    .createHmac('sha256', process.env.TRIPAY_PRIVATE_KEY || '')
    .update(rawBody)
    .digest('hex');
  return safeEqual(expected, signatureHeader || '');
}

export function parseCallback(body) {
  const map = { PAID: 'paid', EXPIRED: 'expired', FAILED: 'failed', REFUND: 'refunded' };
  return {
    orderCode: body.merchant_ref,
    providerRef: body.reference,
    amount: Number(body.total_amount ?? 0),
    status: map[body.status] || 'pending',
    paidAt: body.paid_at ? new Date(Number(body.paid_at) * 1000) : null,
    fee: Number(body.fee_merchant ?? 0),
  };
}
