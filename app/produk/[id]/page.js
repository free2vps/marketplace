import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { rupiah, productImage, activePromo, discountPercent } from '../../../lib/media';
import SearchHeader from '../../components/SearchHeader';
import PageNav from '../../components/PageNav';
import StoreAvatar from '../../components/StoreAvatar';
import ProductCard from '../../components/ProductCard';
import OrderPanel from '../../components/OrderPanel';
import TrackProductView from '../../components/TrackProductView';

export const revalidate = 0;

const CARD =
  'id, name, price, promo_price, promo_ends_at, image_path, sold_count, rating_avg, rating_count, stores(name, slug, logo_url)';

const dateId = (iso) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function ProdukPage({ params }) {
  const { data: p } = await supabase
    .from('products')
    .select(
      'id, name, description, price, promo_price, promo_ends_at, image_path, stock, sold_count, view_count, rating_avg, rating_count, category_id, store_id, is_available, categories(name, slug), stores(id, name, slug, logo_url, phone, address, is_open, rating_avg, rating_count)'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!p || !p.is_available) notFound();

  const store = p.stores;
  const promo = activePromo(p);
  const price = Number(p.price);
  const unitPrice = promo ? Number(p.promo_price) : price;
  const pct = promo ? discountPercent(price, unitPrice) : 0;
  const img = productImage(p.image_path);

  // Ulasan hanya berasal dari pembeli (tabel diisi lewat fungsi khusus di database)
  const reviewsPromise = supabase
    .from('product_reviews')
    .select('id, reviewer_name, rating, comment, created_at')
    .eq('product_id', p.id)
    .order('created_at', { ascending: false })
    .limit(8);

  const sameStorePromise = supabase
    .from('products')
    .select(CARD)
    .eq('is_available', true)
    .eq('store_id', p.store_id)
    .neq('id', p.id)
    .order('sold_count', { ascending: false })
    .limit(6);

  const similarPromise = p.category_id
    ? supabase
        .from('products')
        .select(CARD)
        .eq('is_available', true)
        .eq('category_id', p.category_id)
        .neq('id', p.id)
        .neq('store_id', p.store_id)
        .order('sold_count', { ascending: false })
        .limit(6)
    : Promise.resolve({ data: [] });

  const [reviewsRes, sameStoreRes, similarRes] = await Promise.all([
    reviewsPromise,
    sameStorePromise,
    similarPromise,
  ]);

  const reviews = reviewsRes.data || [];
  const sameStore = sameStoreRes.data || [];
  let similar = similarRes.data || [];
  let similarTitle = 'Produk serupa';

  // Kalau tidak ada yang serupa, tampilkan produk populer sebagai rekomendasi
  if (similar.length === 0) {
    const { data: popular } = await supabase
      .from('products')
      .select(CARD)
      .eq('is_available', true)
      .neq('id', p.id)
      .neq('store_id', p.store_id)
      .order('sold_count', { ascending: false })
      .limit(6);
    similar = popular || [];
    similarTitle = 'Rekomendasi untukmu';
  }

  const crumbs = [
    ...(p.categories ? [{ label: p.categories.name, href: `/?kategori=${p.categories.slug}` }] : []),
    { label: p.name },
  ];

  const stockLabel = p.stock == null ? 'Tersedia' : p.stock > 0 ? `${p.stock} tersisa` : 'Habis';

  return (
    <>
      <SearchHeader />
      <PageNav crumbs={crumbs} />
      <TrackProductView id={p.id} />

      <main className="container pdp-page">
        <div className="pdp">
          <div className="pdp-photo">
            {img ? <img src={img} alt={p.name} /> : <span className="pdp-nophoto">Belum ada foto</span>}
          </div>

          <div>
            <h1 className="pdp-title">{p.name}</h1>

            <div className="pdp-stats">
              {p.rating_count > 0 ? (
                <span className="pdp-rating">
                  <span className="star" aria-hidden="true">
                    ★
                  </span>
                  {Number(p.rating_avg).toFixed(1)}
                  <span className="muted small">({p.rating_count} ulasan)</span>
                </span>
              ) : (
                <span className="pcard-new">Produk baru</span>
              )}
              {p.sold_count > 0 && <span className="pcard-sold">{p.sold_count} terjual</span>}
            </div>

            <div className="pdp-price-row">
              <span className="pdp-price">{rupiah(unitPrice)}</span>
              {promo && (
                <>
                  <span className="pdp-old">{rupiah(price)}</span>
                  <span className="pdp-discount">-{pct}%</span>
                </>
              )}
            </div>
            {promo && p.promo_ends_at && (
              <p className="pdp-promo-note">Promo berakhir {dateId(p.promo_ends_at)}</p>
            )}

            <dl className="pdp-specs">
              <dt>Kategori</dt>
              <dd>
                {p.categories ? (
                  <Link href={`/?kategori=${p.categories.slug}`}>{p.categories.name}</Link>
                ) : (
                  '-'
                )}
              </dd>
              <dt>Stok</dt>
              <dd>{stockLabel}</dd>
              <dt>Dilihat</dt>
              <dd>{p.view_count} kali</dd>
            </dl>

            <OrderPanel
              id={p.id}
              name={p.name}
              unitPrice={unitPrice}
              stock={p.stock}
              phone={store?.phone}
              storeOpen={store?.is_open}
            />

            {store && (
              <div className="store-box">
                <Link href={`/toko/${store.slug}`} className="store-box-main">
                  <StoreAvatar store={store} size="md" />
                  <div>
                    <strong>{store.name}</strong>
                    <div className="muted small">
                      {store.rating_count > 0 && (
                        <>
                          <span className="star">★</span> {Number(store.rating_avg).toFixed(1)} ·{' '}
                        </>
                      )}
                      {store.address || 'Taliwang'}
                    </div>
                  </div>
                </Link>
                <span className={`badge ${store.is_open ? 'badge-ok' : 'badge-warn'}`}>
                  {store.is_open ? 'Buka' : 'Tutup'}
                </span>
                <Link className="btn btn-outline btn-sm" href={`/toko/${store.slug}`}>
                  Kunjungi toko
                </Link>
              </div>
            )}
          </div>
        </div>

        <section className="section">
          <h2>Deskripsi produk</h2>
          <p className="pdp-desc">{p.description || 'Penjual belum menambahkan deskripsi.'}</p>
        </section>

        <section className="section">
          <h2>Ulasan pembeli ({p.rating_count})</h2>
          <p className="muted small">
            Ulasan hanya bisa ditulis oleh pembeli yang pesanannya sudah selesai.
          </p>
          {reviews.length === 0 ? (
            <div className="empty">Belum ada ulasan untuk produk ini.</div>
          ) : (
            <ul className="review-list">
              {reviews.map((r) => (
                <li key={r.id} className="review">
                  <div className="review-head">
                    <span className="review-name">{r.reviewer_name}</span>
                    <span className="verified">Pembeli terverifikasi</span>
                  </div>
                  <div className="review-stars" aria-label={`${r.rating} dari 5 bintang`}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  <span className="muted small">{dateId(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sameStore.length > 0 && (
          <section className="section">
            <div className="section-row" style={{ margin: '0 0 16px' }}>
              <h2>Lainnya dari {store?.name}</h2>
              {store && (
                <Link className="btn btn-outline btn-sm" href={`/toko/${store.slug}`}>
                  Lihat semua
                </Link>
              )}
            </div>
            <div className="product-grid">
              {sameStore.map((s) => (
                <ProductCard key={s.id} product={s} href={`/produk/${s.id}`} showStore={false} />
              ))}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="section">
            <h2>{similarTitle}</h2>
            <div className="product-grid">
              {similar.map((s) => (
                <ProductCard key={s.id} product={s} href={`/produk/${s.id}`} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
