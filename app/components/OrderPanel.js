'use client';

import { useState } from 'react';
import { rupiah, whatsappLink } from '../../lib/media';

export default function OrderPanel({ id, name, unitPrice, stock, phone, storeOpen }) {
  const max = stock == null ? 99 : Math.max(stock, 0);
  const soldOut = max === 0;
  const [qty, setQty] = useState(1);

  const clamp = (n) => Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), Math.max(max, 1));
  const total = unitPrice * qty;
  const wa = whatsappLink(phone);

  function orderViaWhatsapp() {
    if (!wa) return;
    const text =
      `Halo, saya ingin memesan ${qty} x ${name} (${rupiah(unitPrice)} per item), ` +
      `total ${rupiah(total)}.\nProduk: ${window.location.origin}/produk/${id}`;
    window.open(`${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  return (
    <div className="order-box">
      <div className="order-row">
        <span className="qty-label">Jumlah</span>
        <div className="qty">
          <button type="button" aria-label="Kurangi" onClick={() => setQty(clamp(qty - 1))} disabled={soldOut}>
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={max || 1}
            value={qty}
            disabled={soldOut}
            onChange={(e) => setQty(clamp(parseInt(e.target.value, 10)))}
            aria-label="Jumlah"
          />
          <button type="button" aria-label="Tambah" onClick={() => setQty(clamp(qty + 1))} disabled={soldOut}>
            +
          </button>
        </div>
        {stock != null && !soldOut && <span className="muted small">Stok {stock}</span>}
      </div>

      <div className="order-total">
        <span className="muted">Total</span>
        <strong>{rupiah(total)}</strong>
      </div>

      <button
        type="button"
        className="btn btn-gold btn-block"
        onClick={orderViaWhatsapp}
        disabled={soldOut || !wa}
      >
        {soldOut ? 'Stok habis' : 'Pesan lewat WhatsApp'}
      </button>

      {!storeOpen && !soldOut && (
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Toko sedang tutup. Pesananmu akan dibalas saat toko buka kembali.
        </p>
      )}
      <p className="muted small" style={{ margin: '10px 0 0' }}>
        Pembayaran tunai saat barang sampai. Pemesanan langsung di web lengkap dengan pelacakan
        menyusul di tahap berikutnya.
      </p>
    </div>
  );
}
