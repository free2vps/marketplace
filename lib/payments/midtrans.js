// Adapter Midtrans (QRIS lewat Core API).
// KERANGKA: belum diuji ke Midtrans. Uji dulu di mode sandbox sebelum dipakai sungguhan.
import crypto from 'node:crypto';
import { safeEqual, parseWib } from './util';

const base = () =>
  process.env.MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';

export const enabled = () => Boolean(process.env.MIDTRANS_SERVER_KEY);

export async function createQris({ orderCode, amount }) {
  const auth = 'Basic ' + Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString('base64');
  const res = await fetch(`${base()}/v2/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: { order_id: orderCode, gross_amount: Math.round(amount) },
      qris: { acquirer: 'gopay' },
    }),
  });
  const data = await res.json();
  if (!res.ok || !['200', '201'].includes(String(data.status_code))) {
    throw new Error(data.status_message || 'Midtrans gagal membuat kode QRIS');
  }
  const qrAction = (data.actions || []).find((a) => a.name === 'generate-qr-code');
  return {
    providerRef: data.transaction_id,
    qrString: data.qr_string || null,
    qrUrl: qrAction?.url || null,
    expiresAt: parseWib(data.expiry_time),
    fee: 0, // Midtrans tidak mengirim biaya di notifikasi; sistem memakai perkiraan dari pengaturan
    raw: data,
  };
}

// Tanda tangan notifikasi: SHA512(order_id + status_code + gross_amount + ServerKey)
export function verifyNotification(body) {
  const { order_id, status_code, gross_amount, signature_key } = body || {};
  if (!order_id || !status_code || !gross_amount || !signature_key) return false;
  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}`)
    .digest('hex');
  return safeEqual(expected, signature_key);
}

export function parseNotification(body) {
  const s = body.transaction_status;
  let status = 'pending';
  if (s === 'settlement' || (s === 'capture' && body.fraud_status !== 'challenge')) status = 'paid';
  else if (s === 'expire') status = 'expired';
  else if (['cancel', 'deny', 'failure'].includes(s)) status = 'failed';
  return {
    orderCode: body.order_id,
    providerRef: body.transaction_id,
    amount: Number(body.gross_amount),
    status,
    paidAt: parseWib(body.settlement_time),
    fee: 0,
  };
}
