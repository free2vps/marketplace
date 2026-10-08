import * as midtrans from './midtrans';
import * as tripay from './tripay';

// Penyedia aktif ditentukan variabel PAYMENT_PROVIDER ('midtrans' atau 'tripay')
// dan hanya aktif kalau kuncinya sudah diisi.
export function activeProvider() {
  const p = (process.env.PAYMENT_PROVIDER || '').toLowerCase();
  if (p === 'midtrans' && midtrans.enabled()) return 'midtrans';
  if (p === 'tripay' && tripay.enabled()) return 'tripay';
  return null;
}

export function createQris(provider, args) {
  if (provider === 'midtrans') return midtrans.createQris(args);
  if (provider === 'tripay') return tripay.createQris(args);
  throw new Error('Penyedia pembayaran belum dipilih');
}
