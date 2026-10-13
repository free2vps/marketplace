'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { rupiah } from '../../lib/media';
import { useCart, clearCart } from '../../lib/cart';
import { fetchCartData, describeCart } from '../../lib/cartSync';
import { loadSettings } from '../../lib/settings';
import { orderBreakdown } from '../../lib/fees';
import { loadBuyer, saveBuyer, rememberOrder, normalizePhone } from '../../lib/localOrders';
import SearchHeader from '../components/SearchHeader';
import PageNav from '../components/PageNav';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, ready } = useCart();
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [pay, setPay] = useState('cod');
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const b = loadBuyer();
    setForm((f) => ({ ...f, name: b.name || '', phone: b.phone || '', address: b.address || '' }));
  }, []);

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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function useMyLocation() {
    setLocMsg(null);
    if (!navigator.geolocation) {
      setLocMsg('Peramban ini tidak mendukung lokasi. Tulis alamat selengkap mungkin.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocMsg('Lokasi tidak bisa diambil. Izinkan akses lokasi, atau tulis alamat selengkap mungkin.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!info.canOrder) {
      setError('Isi keranjang perlu diperbaiki dulu.');
      return;
    }
    const phone = normalizePhone(form.phone);
    if (!/^[0-9+]{8,15}$/.test(phone)) {
      setError('Nomor HP tidak valid (8–15 angka).');
      return;
    }
    setBusy(true);

    const mode =
      info.store.delivery_mode_default === 'courier_pool' && cfg?.courierOn ? 'courier_pool' : 'self';

    const { data: code, error: rpcError } = await supabase.rpc('create_guest_order', {
      p_store_id: cart.store.id,
      p_buyer_name: form.name.trim(),
      p_buyer_phone: phone,
      p_delivery_address: form.address.trim(),
      p_delivery_latitude: loc ? loc.lat : null,
      p_delivery_longitude: loc ? loc.lng : null,
      p_delivery_mode: mode,
      p_items: cart.items.map((i) => ({ product_id: i.productId, quantity: i.qty })),
      p_payment_method: pay,
      p_notes: form.notes.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    saveBuyer({ name: form.name.trim(), phone, address: form.address.trim() });
    rememberOrder({ code, phone, storeName: cart.store.name, total: fees.total });
    clearCart();
    router.push(`/pesanan/${code}`);
  }

  const mapSrc = loc
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - 0.004},${loc.lat - 0.003},${loc.lng + 0.004},${loc.lat + 0.003}&layer=mapnik&marker=${loc.lat},${loc.lng}`
    : null;

  if (ready && cart.items.length === 0) {
    return (
      <>
        <SearchHeader />
        <PageNav crumbs={[{ label: 'Checkout' }]} />
        <main className="container-narrow">
          <div className="empty">
            Keranjangmu kosong. <Link href="/">Cari produk</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: 'Keranjang', href: '/keranjang' }, { label: 'Checkout' }]} />
      <main className="container checkout-page">
        <h1>Checkout</h1>
        {info.storeIssue && <div className="alert alert-warn">{info.storeIssue}.</div>}

        <div className="checkout-grid">
          <form className="panel" onSubmit={submit}>
            <h2>Data pengantaran</h2>
            <div className="field">
              <label htmlFor="c-name">Nama penerima</label>
              <input id="c-name" required autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Nomor HP / WhatsApp</label>
              <input id="c-phone" required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <span className="hint muted small">Dipakai toko menghubungimu, dan untuk membuka pesananmu lagi nanti.</span>
            </div>
            <div className="field">
              <label htmlFor="c-addr">Alamat lengkap</label>
              <textarea id="c-addr" required rows={3} minLength={5} maxLength={300} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Jalan, nomor rumah, patokan (mis. pagar hijau)" />
            </div>

            <div className="field">
              <label>Titik lokasi (opsional, membantu pengantar)</label>
              <button type="button" className="btn btn-outline btn-sm" onClick={useMyLocation} disabled={locating}>
                {locating ? 'Mencari lokasi...' : loc ? 'Perbarui lokasi saya' : 'Gunakan lokasi saya'}
              </button>
              {locMsg && <span className="hint small" style={{ color: 'var(--danger)' }}>{locMsg}</span>}
              {loc && (
                <>
                  <iframe className="map-frame" title="Pratinjau lokasi" src={mapSrc} loading="lazy" />
                  <span className="hint muted small">
                    Pastikan titiknya sesuai.{' '}
                    <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noopener noreferrer">
                      Buka di Google Maps
                    </a>{' '}
                    ·{' '}
                    <button type="button" className="link-btn" onClick={() => setLoc(null)}>
                      Hapus titik
                    </button>
                  </span>
                </>
              )}
            </div>

            <div className="field">
              <label htmlFor="c-notes">Catatan untuk toko (opsional)</label>
              <input id="c-notes" maxLength={300} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="mis. kurangi pedas" />
            </div>

            <h2>Pembayaran</h2>
            <label className="radio-row">
              <input type="radio" name="pay" checked={pay === 'cod'} onChange={() => setPay('cod')} />
              <span>
                <strong>Bayar tunai saat barang sampai</strong>
                <span className="muted small"> (COD)</span>
              </span>
            </label>
            {cfg?.onlinePaymentOn && (
              <label className="radio-row">
                <input type="radio" name="pay" checked={pay === 'qris'} onChange={() => setPay('qris')} />
                <span>
                  <strong>QRIS</strong>
                  <span className="muted small"> bayar sekarang lewat aplikasi bank atau e-wallet</span>
                </span>
              </label>
            )}

            {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

            <button className="btn btn-gold btn-block" style={{ marginTop: 16 }} type="submit" disabled={busy || !info.canOrder}>
              {busy ? 'Memproses...' : `Pesan sekarang · ${rupiah(fees.total)}`}
            </button>
          </form>

          <aside className="panel summary">
            <h2>Ringkasan</h2>
            <div className="cart-store">
              <Link href={`/toko/${cart.store?.slug || ''}`}>{cart.store?.name}</Link>
            </div>
            <ul className="sum-items">
              {info.lines.map((l) => (
                <li key={l.productId}>
                  <span>
                    {l.qty} × {l.name}
                    {l.issue && <span className="cart-issue"> — {l.issue}</span>}
                  </span>
                  <span>{rupiah(l.unitPrice * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="sum-row"><span>Subtotal</span><span>{rupiah(fees.goods)}</span></div>
            <div className="sum-row"><span>Ongkos kirim</span><span>{fees.shipping > 0 ? rupiah(fees.shipping) : 'Gratis'}</span></div>
            {fees.serviceFee > 0 && (
              <div className="sum-row"><span>Biaya layanan aplikasi</span><span>{rupiah(fees.serviceFee)}</span></div>
            )}
            <div className="sum-row sum-total"><span>Total</span><span>{rupiah(fees.total)}</span></div>
            <p className="muted small" style={{ margin: '10px 0 0' }}>
              Harga akhir dihitung ulang oleh sistem saat pesanan dibuat.
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
