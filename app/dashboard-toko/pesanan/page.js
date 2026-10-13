'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { rupiah, whatsappLink } from '../../../lib/media';
import SiteHeader from '../../components/SiteHeader';

const STATUS_LABEL = {
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  disiapkan: 'Disiapkan',
  siap_diantar: 'Menunggu kurir',
  diambil_kurir: 'Kurir mengambil',
  diantar: 'Diantar',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};
const FILTERS = [
  ['aktif', 'Aktif'],
  ['selesai', 'Selesai'],
  ['batal', 'Dibatalkan'],
];
const isActive = (s) => !['selesai', 'dibatalkan'].includes(s);
const dateTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PesananTokoPage() {
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('aktif');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async (storeId) => {
    // Kolom disebut satu per satu (kode serah-terima memang tidak boleh terbaca)
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_code, status, delivery_mode, payment_method, payment_status, buyer_name, buyer_phone, ' +
          'delivery_address, delivery_latitude, delivery_longitude, notes, subtotal, shipping_fee, ' +
          'service_fee, total_amount, created_at, order_items(product_name, quantity, subtotal)'
      )
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) setMessage(error.message);
    else setOrders(data || []);
  }, []);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      const { data: s } = await supabase
        .from('stores')
        .select('id, name, subscription_status')
        .eq('owner_id', user.id)
        .single();
      setStore(s);
      if (s) await load(s.id);
      setLoading(false);
    }
    init();
  }, [router, load]);

  // Perbarui otomatis tiap 15 detik selama halaman terbuka
  useEffect(() => {
    if (!store) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) load(store.id);
    }, 15000);
    return () => clearInterval(id);
  }, [store, load]);

  async function setStatus(order, status, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(order.id);
    setMessage(null);
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', order.id)
      .select('id');
    setBusyId(null);
    if (error) setMessage(error.message);
    else if (!data || data.length === 0) setMessage('Perubahan ditolak. Muat ulang halaman lalu coba lagi.');
    await load(store.id);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }

  const logoutButton = (
    <button className="btn btn-ghost btn-sm" onClick={logout}>
      Keluar
    </button>
  );

  if (loading) {
    return (
      <>
        <SiteHeader>{logoutButton}</SiteHeader>
        <main className="container-narrow">Memuat...</main>
      </>
    );
  }

  const shown = orders.filter((o) =>
    filter === 'aktif' ? isActive(o.status) : filter === 'selesai' ? o.status === 'selesai' : o.status === 'dibatalkan'
  );
  const newCount = orders.filter((o) => o.status === 'menunggu_konfirmasi').length;

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">
          &larr; Kembali ke dashboard
        </a>
        <h1>Pesanan masuk</h1>
        {newCount > 0 && <div className="alert alert-warn">{newCount} pesanan baru menunggu konfirmasimu.</div>}
        {message && <div className="alert alert-error">{message}</div>}

        <div className="chip-row" style={{ paddingTop: 0 }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={`chip${filter === key ? ' is-active' : ''}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 && <div className="empty">Tidak ada pesanan di tab ini.</div>}

        <ul className="order-cards">
          {shown.map((o) => {
            const wa = whatsappLink(o.buyer_phone);
            const waitingPayment = o.payment_method === 'qris' && o.payment_status !== 'paid';
            const busy = busyId === o.id;
            return (
              <li key={o.id} className="order-card">
                <div className="order-card-head">
                  <strong>#{o.order_code}</strong>
                  <span className={`badge ${o.status === 'selesai' ? 'badge-ok' : o.status === 'dibatalkan' ? 'badge-warn' : 'badge-gold'}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                  <span className="muted small">{dateTime(o.created_at)}</span>
                </div>

                <ul className="sum-items">
                  {o.order_items.map((it, i) => (
                    <li key={i}>
                      <span>{it.quantity} × {it.product_name}</span>
                      <span>{rupiah(it.subtotal)}</span>
                    </li>
                  ))}
                </ul>

                <div className="sum-row sum-total">
                  <span>
                    Total{' '}
                    <span className="muted small">
                      ({o.payment_method === 'cod' ? 'tunai' : o.payment_status === 'paid' ? 'QRIS lunas' : 'QRIS belum dibayar'})
                    </span>
                  </span>
                  <span>{rupiah(o.total_amount)}</span>
                </div>

                <dl className="dl" style={{ margin: '10px 0' }}>
                  <dt>Pembeli</dt>
                  <dd>
                    {o.buyer_name}{' '}
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer">{o.buyer_phone}</a>
                    )}
                  </dd>
                  <dt>Alamat</dt>
                  <dd>
                    {o.delivery_address}
                    {o.delivery_latitude != null && (
                      <div className="small">
                        <a href={`https://www.google.com/maps?q=${o.delivery_latitude},${o.delivery_longitude}`} target="_blank" rel="noopener noreferrer">
                          Buka titik di peta
                        </a>
                      </div>
                    )}
                  </dd>
                  {o.notes && (<><dt>Catatan</dt><dd>{o.notes}</dd></>)}
                </dl>

                {waitingPayment && o.status === 'menunggu_konfirmasi' && (
                  <p className="muted small">Menunggu pembeli membayar QRIS. Pesanan bisa diproses setelah lunas.</p>
                )}

                <div className="actions">
                  {o.status === 'menunggu_konfirmasi' && (
                    <>
                      <button className="btn btn-gold btn-sm" disabled={busy || waitingPayment} onClick={() => setStatus(o, 'disiapkan')}>
                        Terima pesanan
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setStatus(o, 'dibatalkan', 'Tolak dan batalkan pesanan ini?')}>
                        Tolak
                      </button>
                    </>
                  )}
                  {o.status === 'disiapkan' && o.delivery_mode === 'self' && (
                    <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => setStatus(o, 'diantar')}>
                      Mulai antar
                    </button>
                  )}
                  {o.status === 'disiapkan' && o.delivery_mode === 'courier_pool' && (
                    <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => setStatus(o, 'siap_diantar')}>
                      Siap diambil kurir
                    </button>
                  )}
                  {o.status === 'diantar' && o.delivery_mode === 'self' && (
                    <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => setStatus(o, 'selesai', 'Tandai pesanan ini selesai?')}>
                      Tandai selesai
                    </button>
                  )}
                  {['disiapkan', 'siap_diantar'].includes(o.status) && (
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setStatus(o, 'dibatalkan', 'Batalkan pesanan ini? Pembeli akan melihat statusnya.')}>
                      Batalkan
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
