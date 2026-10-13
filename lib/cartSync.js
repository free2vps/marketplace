import { activePromo } from './media';

// Mengambil harga/stok/status TERBARU dari database untuk isi keranjang.
// Harga di keranjang hanya perkiraan; yang dipakai saat memesan selalu harga server.
export async function fetchCartData(supabase, cart) {
  const ids = cart.items.map((i) => i.productId);
  const [prodRes, storeRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, price, promo_price, promo_ends_at, stock, is_available, image_path')
      .in('id', ids),
    supabase
      .from('stores')
      .select('id, name, slug, logo_url, is_open, subscription_status, flat_shipping_fee, delivery_mode_default, phone')
      .eq('id', cart.store.id)
      .maybeSingle(),
  ]);
  return {
    products: Object.fromEntries((prodRes.data || []).map((p) => [p.id, p])),
    store: storeRes.data || null,
  };
}

// Menggabungkan isi keranjang dengan data terbaru, menandai masalah (stok, produk hilang, toko tutup)
export function describeCart(cart, data) {
  const lines = cart.items.map((it) => {
    const p = data?.products?.[it.productId];
    if (!data) return { ...it, unitPrice: it.price, issue: null };
    if (!p || !p.is_available) return { ...it, unitPrice: it.price, issue: 'Produk tidak lagi tersedia' };
    const unitPrice = activePromo(p) ? Number(p.promo_price) : Number(p.price);
    let issue = null;
    if (p.stock != null && p.stock < it.qty) issue = p.stock === 0 ? 'Stok habis' : `Stok tinggal ${p.stock}`;
    return { ...it, name: p.name, image_path: p.image_path, stock: p.stock, unitPrice, issue };
  });

  const store = data?.store || null;
  let storeIssue = null;
  if (data && (!store || store.subscription_status !== 'active')) storeIssue = 'Toko tidak tersedia';
  else if (data && !store.is_open) storeIssue = 'Toko sedang tutup';

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return {
    lines,
    store,
    storeIssue,
    subtotal,
    canOrder: Boolean(data) && lines.length > 0 && lines.every((l) => !l.issue) && !storeIssue,
  };
}
