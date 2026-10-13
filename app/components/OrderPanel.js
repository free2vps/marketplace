'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rupiah, whatsappLink } from '../../lib/media';
import { addToCart } from '../../lib/cart';
import QtyStepper from './QtyStepper';

// product: { id, name, unitPrice, stock, image_path }
// store:   { id, name, slug, logo_url, phone, is_open }
export default function OrderPanel({ product, store }) {
  const router = useRouter();
  const max = product.stock == null ? 99 : Math.max(product.stock, 0);
  const soldOut = max === 0;
  const closed = store?.is_open === false;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const wa = whatsappLink(store?.phone);

  function add(goCheckout) {
    setAdded(false);
    const item = {
      productId: product.id,
      name: product.name,
      price: product.unitPrice,
      image_path: product.image_path,
      stock: product.stock,
    };
    let res = addToCart(store, item, qty);
    if (!res.ok && res.reason === 'other_store') {
      const ok = window.confirm(
        `Keranjangmu berisi produk dari ${res.currentStore.name}. Satu pesanan hanya untuk satu toko. ` +
          `Kosongkan keranjang dan ganti ke ${store.name}?`
      );
      if (!ok) return;
      res = addToCart(store, item, qty, { replace: true });
    }
    if (!res.ok) return;
    if (goCheckout) router.push('/checkout');
    else setAdded(true);
  }

  function askSeller() {
    if (!wa) return;
    const text = `Halo, saya ingin menanyakan produk ${product.name} (${window.location.origin}/produk/${product.id}).`;
    window.open(`${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  return (
    <div className="order-box">
      <div className="order-row">
        <span className="qty-label">Jumlah</span>
        <QtyStepper value={qty} onChange={setQty} max={max} disabled={soldOut} />
        {product.stock != null && !soldOut && <span className="muted small">Stok {product.stock}</span>}
      </div>

      <div className="order-total">
        <span className="muted">Total</span>
        <strong>{rupiah(product.unitPrice * qty)}</strong>
      </div>

      {closed && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          Toko sedang tutup, jadi belum bisa menerima pesanan.
        </div>
      )}

      <div className="order-actions">
        <button type="button" className="btn btn-outline" onClick={() => add(false)} disabled={soldOut || closed}>
          Tambah ke keranjang
        </button>
        <button type="button" className="btn btn-gold" onClick={() => add(true)} disabled={soldOut || closed}>
          {soldOut ? 'Stok habis' : 'Beli sekarang'}
        </button>
      </div>

      {added && (
        <p className="added-note">
          Ditambahkan ke keranjang. <Link href="/keranjang">Lihat keranjang</Link>
        </p>
      )}

      {wa && (
        <button type="button" className="link-btn" onClick={askSeller}>
          Tanya penjual lewat WhatsApp
        </button>
      )}
      <p className="muted small" style={{ margin: '10px 0 0' }}>
        Pembayaran tunai saat barang sampai.
      </p>
    </div>
  );
}
