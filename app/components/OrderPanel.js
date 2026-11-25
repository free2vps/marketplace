'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rupiah } from '../../lib/media';
import { addToCart } from '../../lib/cart';
import { useSettings } from '../../lib/useSettings';
import QtyStepper from './QtyStepper';
import WhatsAppButton from './WhatsAppButton';

// product: { id, name, unitPrice, stock, image_path }
// store:   { id, name, slug, logo_url, phone, is_open }
//
// Fase 1 (bawaan): pesan langsung ke penjual lewat WhatsApp.
// Fase 2 (saklar feature.web_orders hidup): keranjang dan checkout di aplikasi.
export default function OrderPanel({ product, store }) {
  const router = useRouter();
  const cfg = useSettings();
  const webOrders = cfg?.webOrdersOn === true;

  const max = product.stock == null ? 99 : Math.max(product.stock, 0);
  const soldOut = max === 0;
  const closed = store?.is_open === false;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

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

  const orderMessage = (origin) =>
    `Halo ${store.name}, saya ingin memesan ${qty} x ${product.name} (${rupiah(product.unitPrice)} per item), ` +
    `total ${rupiah(product.unitPrice * qty)}.\nProduk: ${origin}/produk/${product.id}`;

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

      {webOrders ? (
        <>
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
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            Pembayaran tunai saat barang sampai.
          </p>
        </>
      ) : (
        <>
          <WhatsAppButton
            phone={store?.phone}
            productId={product.id}
            label={soldOut ? 'Stok habis' : 'Pesan lewat WhatsApp'}
            className="btn btn-gold btn-block"
            message={orderMessage}
            disabled={soldOut}
          />
          {closed && (
            <p className="muted small" style={{ margin: '10px 0 0' }}>
              Toko sedang tutup. Pesananmu akan dibalas saat toko buka kembali.
            </p>
          )}
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            Pesanan, pembayaran, dan pengantaran disepakati langsung dengan penjual lewat WhatsApp.
          </p>
        </>
      )}
    </div>
  );
}
