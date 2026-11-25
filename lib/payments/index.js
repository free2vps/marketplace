import * as midtrans from './midtrans';
import * as tripay from './tripay';
import * as xendit from './xendit';

// Penyedia aktif ditentukan PAYMENT_PROVIDER: 'xendit' (utama, split payment),
// 'midtrans', atau 'tripay'. Aktif hanya kalau kuncinya sudah diisi.
export function activeProvider() {
  const p = (process.env.PAYMENT_PROVIDER || '').toLowerCase();
  if (p === 'xendit' && xendit.enabled()) return 'xendit';
  if (p === 'midtrans' && midtrans.enabled()) return 'midtrans';
  if (p === 'tripay' && tripay.enabled()) return 'tripay';
  return null;
}

// Hasil seragam: { providerRef, qrString?, qrUrl?, payUrl?, expiresAt, fee, raw }
export async function createPayment(provider, args) {
  if (provider === 'xendit') return xendit.createInvoice(args);
  if (provider === 'midtrans') return midtrans.createQris(args);
  if (provider === 'tripay') return tripay.createQris(args);
  throw new Error('Penyedia pembayaran belum dipilih');
}

export const createQris = createPayment; // nama lama, tetap tersedia
