import { supabase } from '../lib/supabase';

export const revalidate = 0; // selalu ambil data terbaru saat dev

export default async function HomePage() {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, description')
    .eq('subscription_status', 'active')
    .order('is_boosted', { ascending: false })
    .order('rating_avg', { ascending: false });

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Marketplace UMKM Taliwang</h1>
      <p>Halaman ini adalah test koneksi ke Supabase.</p>

      {error && (
        <p style={{ color: 'red' }}>
          Gagal ambil data: {error.message}
        </p>
      )}

      {!error && stores?.length === 0 && (
        <p>Belum ada toko aktif (wajar, database masih kosong).</p>
      )}

      <ul>
        {stores?.map((store) => (
          <li key={store.id}>
            <strong>{store.name}</strong> — {store.description}
          </li>
        ))}
      </ul>
    </main>
  );
}
