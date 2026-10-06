import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { whatsappLink } from '../../../lib/media';
import SearchHeader from '../../components/SearchHeader';
import ProductCard from '../../components/ProductCard';
import TrackVisit from '../../components/TrackVisit';

export const revalidate = 0;

export default async function TokoPage({ params, searchParams }) {
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, slug, description, address, phone, is_boosted, is_open, rating_avg, rating_count')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!store) notFound();

  const { data: products, error } = await supabase
    .from('products')
    .select(
      'id, name, price, promo_price, promo_ends_at, image_path, sold_count, rating_avg, rating_count, categories(name, slug)'
    )
    .eq('store_id', store.id)
    .eq('is_available', true)
    .order('created_at', { ascending: false });

  const categories = [];
  const seen = new Set();
  for (const p of products || []) {
    if (p.categories && !seen.has(p.categories.slug)) {
      seen.add(p.categories.slug);
      categories.push(p.categories);
    }
  }

  const kategori = String(searchParams?.kategori || '');
  const shown = kategori
    ? (products || []).filter((p) => p.categories?.slug === kategori)
    : products || [];

  const wa = whatsappLink(store.phone);

  return (
    <>
      <SearchHeader />
      <TrackVisit slug={store.slug} />

      <section className="store-banner">
        <div className="store-banner-inner">
          <div className="monogram monogram-lg" aria-hidden="true">
            {store.name.trim().charAt(0).toUpperCase()}
          </div>
          <div className="grow">
            <h1>{store.name}</h1>
            <p>
              {store.rating_count > 0
                ? `★ ${Number(store.rating_avg).toFixed(1)} (${store.rating_count} ulasan)`
                : 'Belum ada ulasan'}
              {store.address ? ` · ${store.address}` : ''}
            </p>
            {store.description && <p>{store.description}</p>}
            <p>
              {store.is_boosted && <span className="badge badge-gold">Pilihan</span>}{' '}
              <span className={`badge ${store.is_open ? 'badge-ok' : 'badge-warn'}`}>
                {store.is_open ? 'Buka' : 'Tutup'}
              </span>
            </p>
          </div>
          {wa && (
            <a className="btn btn-gold" href={wa} target="_blank" rel="noopener noreferrer">
              Chat WhatsApp
            </a>
          )}
        </div>
      </section>

      <main className="container">
        {categories.length > 0 && (
          <div className="chip-row">
            <Link className={`chip${!kategori ? ' is-active' : ''}`} href={`/toko/${store.slug}`}>
              Semua
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                className={`chip${kategori === c.slug ? ' is-active' : ''}`}
                href={`/toko/${store.slug}?kategori=${c.slug}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {error && <div className="alert alert-error">Produk belum bisa dimuat: {error.message}</div>}

        {!error && shown.length === 0 && (
          <div className="empty">Toko ini belum punya produk yang ditampilkan.</div>
        )}

        {shown.length > 0 && (
          <div className="product-grid">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} showStore={false} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
