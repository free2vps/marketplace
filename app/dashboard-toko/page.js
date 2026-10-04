'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

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

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'sans-serif' }}>Memuat...</main>;
  }

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Dashboard Toko</h1>

      {store ? (
        <>
          <p>
            <strong>{store.name}</strong>
          </p>
          <p>Status langganan: {store.subscription_status}</p>
          <p>No HP: {store.phone}</p>
          <p>Alamat: {store.address || '-'}</p>

          {store.subscription_status !== 'active' && (
            <p style={{ color: '#b45309' }}>
              Toko kamu belum aktif. Lengkapi pembayaran langganan supaya bisa
              mulai jualan dan tampil di halaman utama.
            </p>
          )}

          <button disabled>Tambah Produk (segera hadir)</button>
        </>
      ) : (
        <p>Profil toko tidak ditemukan.</p>
      )}

      <div style={{ marginTop: 24 }}>
        <button onClick={handleLogout}>Keluar</button>
      </div>
    </main>
  );
}
