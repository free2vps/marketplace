// Adapter Xendit (xenPlatform + split payment) via Invoice API.
// KERANGKA FASE 2: belum diuji ke Xendit. Rancangan mengikuti dokumentasi resmi:
//  - Tagihan dibuat atas nama sub-akun toko: header `for-user-id` (ID sub-akun toko)
//  - Pembagian dana ke platform: header `with-split-rule` (ID aturan pembagian)
//  - Pembeli membayar di halaman invoice_url milik Xendit (QRIS/VA/e-wallet dipilih di sana)
// Cocokkan nama field callback dengan dashboard/dokumentasi Xendit saat uji sandbox.
import { safeEqual } from './util';

const BASE = 'https://api.xendit.co';

export const enabled = () =>
  Boolean(process.env.XENDIT_SECRET_KEY && process.env.XENDIT_CALLBACK_TOKEN);

const auth = () => 'Basic ' + Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64');

// Aturan pembagian per pesanan: jumlah TETAP untuk akun induk (platform), sisanya tetap di sub-akun toko.
// Dibuat per pesanan karena komisi dihitung dari harga barang saja, bukan dari seluruh total.
export async function createSplitRule({ orderCode, masterAccountId, amount }) {
  const res = await fetch(`${BASE}/split_rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth() },
    body: JSON.stringify({
      name: `Pesanan ${orderCode}`,
      description: 'Komisi dan biaya layanan platform',
      routes: [
        {
          flat_amount: Math.round(amount),
          currency: 'IDR',
          destination_account_id: masterAccountId,
          reference_id: `fee-${orderCode}`,
        },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Xendit gagal membuat aturan pembagian');
  return json.id;
}

export async function createInvoice({
  orderCode,
  amount,
  customerName,
  description,
  storeAccountId,
  splitRuleId,
  successUrl,
  failureUrl,
  durationSeconds = 7200, // 2 jam, sejajar dengan batas kedaluwarsa QRIS di refresh_expired_plans
}) {
  const headers = { 'Content-Type': 'application/json', Authorization: auth() };
  if (storeAccountId) {
    headers['for-user-id'] = storeAccountId;
    if (splitRuleId) headers['with-split-rule'] = splitRuleId;
  }
  const res = await fetch(`${BASE}/v2/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      external_id: orderCode,
      amount: Math.round(amount),
      currency: 'IDR',
      description,
      invoice_duration: durationSeconds,
      customer: customerName ? { given_names: customerName } : undefined,
      success_redirect_url: successUrl,
      failure_redirect_url: failureUrl,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Xendit gagal membuat tagihan');
  return {
    providerRef: json.id,
    payUrl: json.invoice_url,
    expiresAt: json.expiry_date ? new Date(json.expiry_date) : null,
    fee: 0,
    raw: json,
  };
}

// Callback Xendit membawa token di header x-callback-token (diatur di dashboard Xendit)
export function verifyCallback(headers) {
  const token = headers.get('x-callback-token') || '';
  const expected = process.env.XENDIT_CALLBACK_TOKEN || '';
  return expected !== '' && safeEqual(token, expected);
}

export function parseCallback(body) {
  const map = { PAID: 'paid', SETTLED: 'paid', EXPIRED: 'expired', FAILED: 'failed' };
  return {
    orderCode: body.external_id,
    providerRef: body.id,
    amount: Number(body.amount ?? body.paid_amount ?? 0),
    status: map[body.status] || 'pending',
    paidAt: body.paid_at ? new Date(body.paid_at) : null,
    fee: 0,
  };
}
