'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rupiah } from '../../lib/media';
import { listLocalOrders, rememberOrder, normalizePhone } from '../../lib/localOrders';
import SearchHeader from '../components/SearchHeader';
import PageNav from '../components/PageNav';

export default function PesananSayaPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    setOrders(listLocalOrders());
  }, []);

  function lookup(e) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const p = normalizePhone(phone);
    rememberOrder({ code: c, phone: p });
    router.push(`/pesanan/${c}`);
  }

  return (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: 'Pesanan saya' }]} />
      <main className="container-narrow">
        <h1>Pesanan saya</h1>

        {orders.length > 0 ? (
          <ul className="product-list" style={{ marginBottom: 28 }}>
            {orders.map((o) => (
              <li key={o.code} className="product-row">
                <Link href={`/pesanan/${o.code}`} className="order-link">
                  <strong>#{o.code}</strong>
                  <div className="muted small">
                    {o.storeName || 'Pesanan'} · {new Date(o.savedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </Link>
                {o.total > 0 && <span className="price">{rupiah(o.total)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty" style={{ marginBottom: 28 }}>
            Belum ada pesanan di perangkat ini. Pesananmu otomatis tersimpan di sini setelah checkout.
          </div>
        )}

        <form className="panel" onSubmit={lookup}>
          <h2>Cari pesanan</h2>
          <p className="muted small">Pesan dari perangkat lain? Masukkan kode pesanan dan nomor HP yang dipakai saat memesan.</p>
          <div className="field">
            <label htmlFor="l-code">Kode pesanan</label>
            <input id="l-code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. A1B2C3" />
          </div>
          <div className="field">
            <label htmlFor="l-phone">Nomor HP</label>
            <input id="l-phone" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn btn-navy" type="submit">Buka pesanan</button>
        </form>
      </main>
    </>
  );
}
