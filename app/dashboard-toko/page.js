'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { loadSettings } from '../../lib/settings';
import SiteHeader from '../components/SiteHeader';

const STATUS = {
  active: { label: 'Aktif', className: 'badge badge-ok' },
  pending_verification: { label: 'Menunggu verifikasi', className: 'badge badge-warn' },
  inactive: { label: 'Belum aktif', className: 'badge badge-warn' },
};

export default function DashboardTokoPage() {
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [newOrders, setNewOrders] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [cfg, setCfg] = useState(null);
  const [shipping, setShipping] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/masuk-toko');
        return;
      }

      const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, address, phone, is_open, subscription_status, premium_until, flat_shipping_fee')
        .eq('owner_id', user.id)
        .single();

      setStore(storeData);
      setCfg(await loadSettings(supabase));
      if (storeData) {
        const pc = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', storeData.id);
        setProductCount(pc.count || 0);
        setShipping(String(storeData.flat_shipping_fee ?? 0));
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeData.id)
          .eq('status', 'menunggu_konfirmasi');
        setNewOrders(count || 0);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }

  async function toggleOpen() {
    setBusy(true);
    setNotice(null);
    const next = !store.is_open;
    const { error } = await supabase.from('stores').update({ is_open: next }).eq('id', store.id);
    setBusy(false);
    if (error) setNotice(error.message);
    else setStore({ ...store, is_open: next });
  }

  async function saveShipping(e) {
    e.preventDefault();
    const fee = Number(shipping);
    if (!Number.isFinite(fee) || fee < 0) {
      setNotice('Ongkos kirim harus angka 0 atau lebih.');
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.from('stores').update({ flat_shipping_fee: fee }).eq('id', store.id);
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setStore({ ...store, flat_shipping_fee: fee });
      setNotice('Ongkos kirim tersimpan.');
    }
  }

  const logoutButton = (
    <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
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

  const isActive = store?.subscription_status === 'active';
  const premium = Boolean(store?.premium_until && new Date(store.premium_until) > new Date());
  const limit = cfg?.freeProductLimit ?? 10;
  const status = STATUS[store?.subscription_status] || STATUS.inactive;

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        {store ? (
          <>
            <div className="page-head">
              <div>
                <h1>{store.name}</h1>
                <span className={status.className}>{status.label}</span>
              </div>
              <div className="actions">
                {isActive ? (
                  <>
                    <a className="btn btn-gold" href="/dashboard-toko/pesanan">
                      Pesanan{newOrders > 0 ? ` (${newOrders} baru)` : ''}
                    </a>
                    <a className="btn btn-outline" href="/dashboard-toko/produk">
                      Kelola produk
                    </a>
                  </>
                ) : (
                  <button className="btn btn-gold" disabled>
                    Kelola produk
                  </button>
                )}
                <a className="btn btn-outline" href="/dashboard-toko/saldo">
                  Saldo &amp; pencairan
                </a>
              </div>
            </div>

            {!isActive && (
              <div className="alert alert-warn">
                Toko kamu belum tayang. Pendaftaran baru diperiksa admin dulu; kamu akan bisa mengelola
                produk dan tampil di beranda setelah disetujui.
              </div>
            )}

            {isActive && (
              <section className="panel plan-card">
                <div>
                  {premium ? (
                    <>
                      <span className="badge badge-ok">Premium</span>
                      <div style={{ marginTop: 6 }}>
                        Aktif sampai{' '}
                        <strong>{new Date(store.premium_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="badge badge-warn">Paket Gratis</span>
                      <div style={{ marginTop: 6 }}>
                        <strong>{productCount}</strong> dari {limit} produk terpakai
                      </div>
                      <div className="meter" aria-hidden="true"><div style={{ width: `${Math.min(100, (productCount / limit) * 100)}%` }} /></div>
                    </>
                  )}
                </div>
                <div className="actions">
                  <a className="btn btn-gold btn-sm" href="/dashboard-toko/paket">
                    {premium ? 'Perpanjang' : 'Tingkatkan ke Premium'}
                  </a>
                </div>
              </section>
            )}

            {notice && <div className="alert alert-warn">{notice}</div>}

            {isActive && (
              <section className="panel">
                <h2>Promosi dan data</h2>
                <div className="actions">
                  <a className="btn btn-outline btn-sm" href="/dashboard-toko/banner">Sewa banner</a>
                  <a className="btn btn-outline btn-sm" href="/dashboard-toko/statistik">
                    Statistik pengunjung{premium ? '' : ' (Premium)'}
                  </a>
                </div>
              </section>
            )}

            <section className="panel">
              <h2>Pengaturan toko</h2>
              <div className="field">
                <label>Status toko</label>
                <button className={`btn btn-sm ${store.is_open ? 'btn-outline' : 'btn-navy'}`} onClick={toggleOpen} disabled={busy}>
                  {store.is_open ? 'Sedang buka. Klik untuk menutup' : 'Sedang tutup. Klik untuk membuka'}
                </button>
                <span className="hint muted small">Saat tutup, pembeli tidak bisa membuat pesanan baru.</span>
              </div>
              <form onSubmit={saveShipping}>
                <div className="field">
                  <label htmlFor="ship">Ongkos kirim tetap (Rp)</label>
                  <input id="ship" type="number" min="0" step="500" inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} />
                  <span className="hint muted small">Ditambahkan ke setiap pesanan. Isi 0 jika gratis ongkir.</span>
                </div>
                <button className="btn btn-navy btn-sm" type="submit" disabled={busy}>
                  Simpan ongkir
                </button>
              </form>
            </section>

            <section className="panel">
              <h2>Data toko</h2>
              <dl className="dl">
                <dt>Nomor HP</dt>
                <dd>{store.phone}</dd>
                <dt>Alamat</dt>
                <dd>{store.address || '-'}</dd>
              </dl>
            </section>
          </>
        ) : (
          <div className="empty">Profil toko tidak ditemukan.</div>
        )}
      </main>
    </>
  );
}
