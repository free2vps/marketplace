'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { rupiah, productImage } from '../../lib/media';
import { useCart, setQty, removeItem, clearCart } from '../../lib/cart';
import { fetchCartData, describeCart } from '../../lib/cartSync';
import { loadSettings } from '../../lib/settings';
import { orderBreakdown } from '../../lib/fees';
import SearchHeader from '../components/SearchHeader';
import PageNav from '../components/PageNav';
import QtyStepper from '../components/QtyStepper';
import StoreAvatar from '../components/StoreAvatar';

export default function KeranjangPage() {
  const { cart, ready } = useCart();
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);

  // Segarkan harga/stok hanya saat daftar produk atau tokonya berubah (bukan tiap jumlah berubah)
  const key = cart.items.map((i) => i.productId).sort().join(',') + '|' + (cart.store?.id || '');
  useEffect(() => {
    if (!ready || cart.items.length === 0) return;
    let live = true;
    fetchCartData(supabase, cart).then((d) => live && setData(d));
    loadSettings(supabase).then((s) => live && setCfg(s));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const info = useMemo(() => describeCart(cart, data), [cart, data]);
  const fees = orderBreakdown({
    goods: info.subtotal,
    shipping: info.store ? Number(info.store.flat_shipping_fee) : 0,
    commissionPercent: cfg?.commissionOn ? cfg.commissionPercent : 0,
    serviceFee: cfg?.commissionOn ? cfg.serviceFee : 0,
  });

  return (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: 'Keranjang' }]} />
      <main className="container-narrow">
        <h1>Keranjang</h1>

        {ready && cart.items.length === 0 && (
          <div className="empty">
            Keranjangmu masih kosong. <Link href="/">Cari produk</Link>
          </div>
        )}

        {cart.items.length > 0 && (
          <>
            <div className="cart-store">
              <StoreAvatar store={cart.store} size="sm" />
              <Link href={`/toko/${cart.store.slug}`}>{cart.store.name}</Link>
              <button
                type="button"
                className="link-btn"
                onClick={() => window.confirm('Kosongkan keranjang?') && clearCart()}
              >
                Kosongkan
              </button>
            </div>

            {info.storeIssue && <div className="alert alert-warn">{info.storeIssue}.</div>}

            <ul className="cart-list">
              {info.lines.map((l) => {
                const img = productImage(l.image_path, true);
                return (
                  <li key={l.productId} className="cart-line">
                    <div className="cart-thumb">{img && <img src={img} alt="" loading="lazy" />}</div>
                    <div className="cart-info">
                      <Link href={`/produk/${l.productId}`} className="cart-name">
                        {l.name}
                      </Link>
                      <div className="muted small">{rupiah(l.unitPrice)} per item</div>
                      {l.issue && <div className="cart-issue">{l.issue}</div>}
                      <div className="cart-controls">
                        <QtyStepper
                          value={l.qty}
                          max={l.stock == null ? 99 : Math.max(l.stock, 1)}
                          onChange={(n) => setQty(l.productId, n)}
                        />
                        <button type="button" className="link-btn danger" onClick={() => removeItem(l.productId)}>
                          Hapus
                        </button>
                      </div>
                    </div>
                    <div className="cart-price">{rupiah(l.unitPrice * l.qty)}</div>
                  </li>
                );
              })}
            </ul>

            <section className="panel summary">
              <div className="sum-row">
                <span>Subtotal</span>
                <span>{rupiah(fees.goods)}</span>
              </div>
              <div className="sum-row">
                <span>Ongkos kirim</span>
                <span>{fees.shipping > 0 ? rupiah(fees.shipping) : 'Gratis'}</span>
              </div>
              {fees.serviceFee > 0 && (
                <div className="sum-row">
                  <span>Biaya layanan aplikasi</span>
                  <span>{rupiah(fees.serviceFee)}</span>
                </div>
              )}
              <div className="sum-row sum-total">
                <span>Total</span>
                <span>{rupiah(fees.total)}</span>
              </div>
              {info.canOrder ? (
                <Link className="btn btn-gold btn-block" href="/checkout">
                  Lanjut ke checkout
                </Link>
              ) : (
                <button className="btn btn-gold btn-block" disabled>
                  {data ? 'Perbaiki dulu isi keranjang' : 'Memeriksa harga...'}
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
