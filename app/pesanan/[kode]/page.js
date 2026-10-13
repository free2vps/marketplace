'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { rupiah, whatsappLink } from '../../../lib/media';
import { phoneFor, rememberOrder, normalizePhone } from '../../../lib/localOrders';
import SearchHeader from '../../components/SearchHeader';
import PageNav from '../../components/PageNav';
import StoreAvatar from '../../components/StoreAvatar';
import ReviewBox from '../../components/ReviewBox';

const FLOW = {
  self: [
    ['menunggu_konfirmasi', 'Pesanan diterima'],
    ['disiapkan', 'Disiapkan toko'],
    ['diantar', 'Diantar'],
    ['selesai', 'Selesai'],
  ],
  courier_pool: [
    ['menunggu_konfirmasi', 'Pesanan diterima'],
    ['disiapkan', 'Disiapkan toko'],
    ['siap_diantar', 'Menunggu kurir'],
    ['diambil_kurir', 'Kurir mengambil'],
    ['diantar', 'Diantar'],
    ['selesai', 'Selesai'],
  ],
};

const BANNER = {
  menunggu_konfirmasi: ['Menunggu konfirmasi toko', 'Toko akan segera memeriksa pesananmu.'],
  disiapkan: ['Pesanan sedang disiapkan', 'Toko sedang menyiapkan barangmu.'],
  siap_diantar: ['Mencari kurir', 'Pesananmu sudah siap dan menunggu kurir.'],
  diambil_kurir: ['Kurir mengambil pesanan', 'Kurir sedang menuju toko.'],
  diantar: ['Pesanan sedang diantar', 'Siapkan diri, barangmu dalam perjalanan.'],
  selesai: ['Pesanan selesai', 'Terima kasih sudah berbelanja di UMKM Taliwang.'],
  dibatalkan: ['Pesanan dibatalkan', 'Pesanan ini sudah tidak diproses.'],
};

const dateTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PelacakanPage() {
  const { kode } = useParams();
  const code = String(kode || '').toUpperCase();

  const [phone, setPhone] = useState(null); // null = belum dibaca dari browser, '' = tidak diketahui
  const [phoneInput, setPhoneInput] = useState('');
  const [order, setOrder] = useState(undefined); // undefined = memuat, null = tidak ditemukan
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    setPhone(phoneFor(code));
  }, [code]);

  const load = useCallback(async () => {
    if (!phone) return;
    const { data, error: rpcError } = await supabase.rpc('get_order_detail', {
      p_order_code: code,
      p_buyer_phone: phone,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setOrder(data);
    if (data) rememberOrder({ code, phone, storeName: data.store?.name || '', total: Number(data.total_amount) });
  }, [code, phone]);

  useEffect(() => {
    load();
  }, [load]);

  const finished = order && ['selesai', 'dibatalkan'].includes(order.status);
  useEffect(() => {
    if (!phone || finished) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 10000);
    return () => clearInterval(id);
  }, [phone, finished, load]);

  async function run(promise, okMsg, failMsg) {
    setBusy(true);
    setNotice(null);
    const { data, error: rpcError } = await promise;
    setBusy(false);
    if (rpcError) {
      setNotice(rpcError.message);
      return false;
    }
    if (data === false) {
      setNotice(failMsg);
      return false;
    }
    if (okMsg) setNotice(okMsg);
    await load();
    return true;
  }

  const cancel = () =>
    window.confirm('Batalkan pesanan ini?') &&
    run(
      supabase.rpc('cancel_order_buyer', { p_order_code: code, p_buyer_phone: phone }),
      'Pesanan dibatalkan.',
      'Pesanan tidak bisa dibatalkan (sudah diproses, atau pembayaran sedang berjalan). Hubungi toko lewat WhatsApp.'
    );

  const received = () =>
    window.confirm('Barang sudah kamu terima?') &&
    run(
      supabase.rpc('confirm_order_received', { p_order_code: code, p_buyer_phone: phone }),
      null,
      'Pesanan belum bisa dikonfirmasi saat ini.'
    );

  async function reviewStore(rating, comment) {
    const { data, error: e } = await supabase.rpc('submit_review', {
      p_order_code: code, p_buyer_phone: phone, p_rating: rating, p_comment: comment || null,
    });
    if (e) return e.message;
    if (data === false) return 'Ulasan tidak bisa dikirim (mungkin sudah pernah).';
    await load();
    return null;
  }

  async function reviewProduct(productId, rating, comment) {
    const { data, error: e } = await supabase.rpc('submit_product_review', {
      p_order_code: code, p_buyer_phone: phone, p_product_id: productId, p_rating: rating, p_comment: comment || null,
    });
    if (e) return e.message;
    if (data === false) return 'Ulasan tidak bisa dikirim (mungkin sudah pernah).';
    await load();
    return null;
  }

  async function showQr() {
    setQrBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode: code, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Kode QRIS belum bisa dibuat');
      setQr(json);
    } catch (e) {
      setNotice(e.message);
    }
    setQrBusy(false);
  }

  const chrome = (children) => (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: 'Pesanan saya', href: '/pesanan' }, { label: `#${code}` }]} />
      <main className="container-narrow">{children}</main>
    </>
  );

  if (phone === null) return chrome(<p>Memuat...</p>);

  if (phone === '') {
    return chrome(
      <>
        <h1>Pesanan #{code}</h1>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            setPhone(normalizePhone(phoneInput));
          }}
        >
          <p className="muted">Masukkan nomor HP yang kamu pakai saat memesan untuk membuka pesanan ini.</p>
          <div className="field">
            <label htmlFor="t-phone">Nomor HP</label>
            <input id="t-phone" required type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
          </div>
          <button className="btn btn-navy" type="submit">Buka pesanan</button>
        </form>
      </>
    );
  }

  if (order === undefined) return chrome(<>{error ? <div className="alert alert-error">{error}</div> : <p>Memuat pesanan...</p>}</>);

  if (order === null) {
    return chrome(
      <>
        <h1>Pesanan #{code}</h1>
        <div className="alert alert-warn">
          Pesanan tidak ditemukan. Periksa kode pesanan dan nomor HP yang dipakai saat memesan.
        </div>
        <button className="btn btn-outline" onClick={() => setPhone('')}>Coba nomor HP lain</button>
      </>
    );
  }

  const flow = FLOW[order.delivery_mode] || FLOW.self;
  const stepIndex = flow.findIndex(([s]) => s === order.status);
  const [bannerTitle, bannerText] = BANNER[order.status] || ['', ''];
  const cancelled = order.status === 'dibatalkan';
  const wa = whatsappLink(order.store?.phone);
  const waText = encodeURIComponent(`Halo, saya ingin menanyakan pesanan #${code} atas nama ${order.buyer_name}.`);
  const unpaidQris = order.payment_method === 'qris' && order.payment_status === 'unpaid' && !cancelled;
  const expiredQris = order.payment_method === 'qris' && order.payment_status === 'expired' && !cancelled;

  return chrome(
    <>
      <div className={`status-banner${cancelled ? ' is-cancelled' : order.status === 'selesai' ? ' is-done' : ''}`}>
        <div className="status-title">{bannerTitle}</div>
        <div>{bannerText}</div>
        <div className="status-code">Kode pesanan #{order.order_code} · {dateTime(order.created_at)}</div>
      </div>

      {notice && <div className="alert alert-warn">{notice}</div>}
      {error && <div className="alert alert-error">Gagal memperbarui: {error}</div>}

      {!cancelled && (
        <ol className="timeline">
          {flow.map(([s, label], i) => (
            <li key={s} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}>
              <span className="dot">{i < stepIndex ? '✓' : i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {unpaidQris && (
        <section className="panel">
          <h2>Bayar dengan QRIS</h2>
          <p className="muted">
            Total {rupiah(order.total_amount)}. Toko baru memproses pesananmu setelah pembayaran diterima.
          </p>
          {qr?.qrUrl ? (
            <div className="qr-box">
              <img src={qr.qrUrl} alt="Kode QRIS" width="240" height="240" />
              <div className="muted small">
                Pindai dengan aplikasi bank atau e-wallet.
                {qr.expiresAt && ` Berlaku sampai ${dateTime(qr.expiresAt)}.`}
              </div>
            </div>
          ) : (
            <button className="btn btn-gold" onClick={showQr} disabled={qrBusy}>
              {qrBusy ? 'Membuat kode...' : 'Tampilkan kode QRIS'}
            </button>
          )}
          <p className="muted small" style={{ margin: '10px 0 0' }}>Halaman ini otomatis berubah setelah pembayaran diterima.</p>
        </section>
      )}

      {expiredQris && (
        <div className="alert alert-warn">
          Waktu pembayaran habis. Batalkan pesanan ini lalu buat pesanan baru.
        </div>
      )}

      {order.handover_otp && (
        <section className="panel otp-panel">
          <div className="muted small">Kode serah-terima</div>
          <div className="otp-code">{order.handover_otp}</div>
          <p className="muted small" style={{ margin: 0 }}>
            Sebutkan kode ini ke kurir hanya setelah barang kamu terima.
          </p>
        </section>
      )}

      {order.courier && (
        <section className="panel">
          <strong>Kurir: {order.courier.name}</strong>
          {order.courier.phone && (
            <div className="muted small">
              <a href={`tel:${order.courier.phone}`}>{order.courier.phone}</a>
            </div>
          )}
          {order.courier_location && (
            <div className="small" style={{ marginTop: 6 }}>
              <a
                href={`https://www.google.com/maps?q=${order.courier_location.lat},${order.courier_location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Lihat posisi kurir di peta
              </a>{' '}
              <span className="muted">(diperbarui {dateTime(order.courier_location.updated_at)})</span>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="cart-store">
          <StoreAvatar store={order.store} size="sm" />
          <Link href={`/toko/${order.store?.slug}`}>{order.store?.name}</Link>
        </div>
        <ul className="sum-items">
          {order.items.map((it) => (
            <li key={it.product_id}>
              <span>{it.quantity} × {it.name}</span>
              <span>{rupiah(it.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="sum-row"><span>Subtotal</span><span>{rupiah(order.subtotal)}</span></div>
        <div className="sum-row"><span>Ongkos kirim</span><span>{Number(order.shipping_fee) > 0 ? rupiah(order.shipping_fee) : 'Gratis'}</span></div>
        {Number(order.service_fee) > 0 && (
          <div className="sum-row"><span>Biaya layanan aplikasi</span><span>{rupiah(order.service_fee)}</span></div>
        )}
        <div className="sum-row sum-total"><span>Total</span><span>{rupiah(order.total_amount)}</span></div>
        <div className="muted small" style={{ marginTop: 8 }}>
          {order.payment_method === 'cod'
            ? 'Bayar tunai saat barang sampai.'
            : order.payment_status === 'paid' ? 'Sudah dibayar lewat QRIS.' : 'Pembayaran QRIS.'}
        </div>
      </section>

      <section className="panel">
        <h2>Pengantaran</h2>
        <dl className="dl">
          <dt>Penerima</dt><dd>{order.buyer_name}</dd>
          <dt>Alamat</dt>
          <dd>
            {order.delivery_address}
            {order.delivery_latitude != null && (
              <div className="small">
                <a href={`https://www.google.com/maps?q=${order.delivery_latitude},${order.delivery_longitude}`} target="_blank" rel="noopener noreferrer">
                  Lihat titik di peta
                </a>
              </div>
            )}
          </dd>
          {order.notes && (<><dt>Catatan</dt><dd>{order.notes}</dd></>)}
        </dl>
      </section>

      <div className="actions" style={{ marginBottom: 24 }}>
        {order.status === 'diantar' && order.delivery_mode === 'self' && (
          <button className="btn btn-gold" onClick={received} disabled={busy}>Barang sudah saya terima</button>
        )}
        {order.status === 'menunggu_konfirmasi' && (
          <button className="btn btn-outline" onClick={cancel} disabled={busy}>Batalkan pesanan</button>
        )}
        {wa && (
          <a className="btn btn-outline" href={`${wa}?text=${waText}`} target="_blank" rel="noopener noreferrer">
            Hubungi toko
          </a>
        )}
      </div>

      {order.status === 'selesai' && (
        <section>
          <h2>Ulasanmu</h2>
          <p className="muted small">Hanya pembeli seperti kamu yang bisa menulis ulasan.</p>
          {order.store_reviewed ? (
            <p className="added-note">✓ Ulasan untuk toko sudah terkirim. Terima kasih!</p>
          ) : (
            <ReviewBox title={`Bagaimana tokonya, ${order.store?.name}?`} onSubmit={reviewStore} />
          )}
          {order.items.map((it) =>
            it.reviewed ? (
              <p key={it.product_id} className="added-note">✓ Ulasan untuk {it.name} sudah terkirim.</p>
            ) : (
              <ReviewBox
                key={it.product_id}
                title={`Bagaimana ${it.name}?`}
                onSubmit={(r, c) => reviewProduct(it.product_id, r, c)}
              />
            )
          )}
        </section>
      )}
    </>
  );
}
