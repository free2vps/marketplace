import Link from 'next/link';
import { supabase } from '../lib/supabase';
import SearchHeader from './components/SearchHeader';
import ProductCard from './components/ProductCard';
import StoreCard from './components/StoreCard';

export const revalidate = 0; // selalu ambil data terbaru

const TABS = [
  { key: 'terlaris', label: 'Terlaris' },
  { key: 'rating', label: 'Rating terbaik' },
  { key: 'dicari', label: 'Paling dicari' },
  { key: 'diskon', label: 'Diskon' },
];
const PAGE_SIZE = 30;

function buildHref({ q, kategori, tab, n }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (kategori) params.set('kategori', kategori);
  if (tab && tab !== 'terlaris') params.set('tab', tab);
  if (n && n !== PAGE_SIZE) params.set('n', String(n));
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

export default async function HomePage({ searchParams }) {
  const q = String(searchParams?.q || '').trim().slice(0, 60);
  const kategori = String(searchParams?.kategori || '');
  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams.tab : 'terlaris';
  const limit = Math.min(Number(searchParams?.n) || PAGE_SIZE, 120);

  const [{ data: categories }, { data: popular }] = await Promise.all([
    supabase.from('categories').select('id, name, slug').order('name'),
    supabase
      .from('search_terms')
      .select('term')
      .order('hits', { ascending: false })
      .order('last_at', { ascending: false })
      .limit(6),
  ]);

  if (q) await supabase.rpc('log_search', { p_term: q });

  let query = supabase
    .from('products')
    .select(
      'id, name, price, promo_price, promo_ends_at, image_path, sold_count, rating_avg, rating_count, stores(name, slug, logo_url)'
    )
    .eq('is_available', true);

  if (q) query = query.ilike('name', `%${q.replace(/[%_,]/g, ' ')}%`);

  const activeCategory = categories?.find((c) => c.slug === kategori);
  if (activeCategory) query = query.eq('category_id', activeCategory.id);

  if (tab === 'diskon') {
    query = query
      .not('promo_price', 'is', null)
      .or(`promo_ends_at.is.null,promo_ends_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false });
  } else if (tab === 'rating') {
    query = query
      .order('rating_avg', { ascending: false })
      .order('rating_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else if (tab === 'dicari') {
    query = query
      .order('view_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else {
    query = query
      .order('sold_count', { ascending: false })
      .order('created_at', { ascending: false });
  }

  const { data: rows, error } = await query.limit(limit + 1);
  const hasMore = (rows?.length || 0) > limit;
  const products = (rows || []).slice(0, limit);

  const { data: topStores } = await supabase
    .from('stores')
    .select('id, name, slug, logo_url, address, is_boosted, rating_avg, rating_count')
    .eq('subscription_status', 'active')
    .order('is_boosted', { ascending: false })
    .order('rating_avg', { ascending: false })
    .order('visit_count', { ascending: false })
    .limit(4);

  return (
    <>
      <SearchHeader q={q} />

      {popular?.length > 0 && (
        <div className="pop-strip">
          <div className="pop-inner">
            <span>Populer:</span>
            {popular.map((s) => (
              <Link key={s.term} className="chip chip-ghost" href={buildHref({ q: s.term })}>
                {s.term}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="cat-strip">
        <div className="chip-row">
          <Link className={`chip${!activeCategory ? ' is-active' : ''}`} href={buildHref({ q, tab })}>
            Semua
          </Link>
          {categories?.map((c) => (
            <Link
              key={c.id}
              className={`chip${activeCategory?.id === c.id ? ' is-active' : ''}`}
              href={buildHref({ q, kategori: c.slug, tab })}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <main className="container">
        <h2>{q ? `Hasil untuk "${q}"` : 'Produk untukmu'}</h2>

        <nav className="tabs" aria-label="Urutan produk">
          {TABS.map((t) => (
            <Link
              key={t.key}
              className={`tab${tab === t.key ? ' is-active' : ''}`}
              href={buildHref({ q, kategori, tab: t.key })}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {error && (
          <div className="alert alert-error">Produk belum bisa dimuat: {error.message}</div>
        )}

        {!error && products.length === 0 && (
          <div className="empty">
            {q || activeCategory || tab === 'diskon'
              ? 'Belum ada produk yang cocok. Coba kata kunci, kategori, atau tab lain.'
              : 'Belum ada produk. Toko yang sudah aktif bisa menambahkan produk dari dashboard.'}
          </div>
        )}

        {products.length > 0 && (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} href={`/produk/${p.id}`} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="more-row">
            <Link
              className="btn btn-outline"
              href={buildHref({ q, kategori, tab, n: limit + PAGE_SIZE })}
            >
              Muat lebih banyak produk
            </Link>
          </div>
        )}

        <div className="section-row">
          <h2>Toko terbaik di Taliwang</h2>
          <Link className="btn btn-navy btn-sm" href="/toko">
            Lihat semua toko
          </Link>
        </div>

        {topStores?.length > 0 ? (
          <div className="store-grid store-grid-4">
            {topStores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        ) : (
          <div className="empty">Belum ada toko yang aktif.</div>
        )}
      </main>
    </>
  );
}
