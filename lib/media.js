import { supabase } from './supabase';

export const rupiah = (n) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);

// "abc.webp" -> "abc_t.webp" (versi kecil untuk kartu produk)
export function thumbPath(path) {
  return path.replace(/(\.\w+)$/, '_t$1');
}

export function productImage(path, thumb = false) {
  if (!path) return null;
  return supabase.storage
    .from('produk')
    .getPublicUrl(thumb ? thumbPath(path) : path).data.publicUrl;
}

export function activePromo(p) {
  if (p.promo_price == null) return false;
  return !p.promo_ends_at || new Date(p.promo_ends_at) > new Date();
}

export function discountPercent(price, promo) {
  if (!price || promo == null) return 0;
  return Math.round((1 - promo / price) * 100);
}

export function whatsappLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}
