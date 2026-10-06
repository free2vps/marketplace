'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import SiteHeader from '../components/SiteHeader';

const STATUS = {
  active: { label: 'Aktif', className: 'badge badge-ok' },
  pending_verification: { label: 'Menunggu verifikasi', className: 'badge badge-warn' },
  inactive: { label: 'Belum aktif', className: 'badge badge-warn' },
};

export default function DashboardTokoPage() {
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

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
        .select('*')
        .eq('owner_id', user.id)
        .single();

      setStore(storeData);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
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
              {isActive ? (
                <a className="btn btn-gold" href="/dashboard-toko/produk">
                  Kelola produk
                </a>
              ) : (
                <button className="btn btn-gold" disabled>
                  Kelola produk
                </button>
              )}
            </div>

            {!isActive && (
              <div className="alert alert-warn">
                Toko kamu belum aktif. Selesaikan pembayaran langganan supaya
                bisa mengelola produk dan tampil di halaman utama.
              </div>
            )}

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
