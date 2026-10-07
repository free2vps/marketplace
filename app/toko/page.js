import { supabase } from '../../lib/supabase';
import SearchHeader from '../components/SearchHeader';
import StoreCard from '../components/StoreCard';
import PageNav from '../components/PageNav';

export const revalidate = 0;
export const metadata = { title: 'Semua toko · UMKM Taliwang' };

export default async function SemuaTokoPage() {
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, slug, logo_url, address, is_boosted, rating_avg, rating_count')
    .eq('subscription_status', 'active')
    .order('is_boosted', { ascending: false })
    .order('rating_avg', { ascending: false })
    .order('visit_count', { ascending: false });

  return (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: 'Semua toko' }]} />
      <main className="container">
        <h1>Semua toko di Taliwang</h1>

        {error && <div className="alert alert-error">Toko belum bisa dimuat: {error.message}</div>}

        {!error && stores?.length === 0 && <div className="empty">Belum ada toko yang aktif.</div>}

        <div className="store-grid">
          {stores?.map((s) => (
            <StoreCard key={s.id} store={s} />
          ))}
        </div>
      </main>
    </>
  );
}
