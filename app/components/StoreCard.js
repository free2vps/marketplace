import Link from 'next/link';

export default function StoreCard({ store }) {
  return (
    <Link
      className={`store-card${store.is_boosted ? ' featured' : ''}`}
      href={`/toko/${store.slug}`}
    >
      {store.logo_url ? (
        <img className="store-logo" src={store.logo_url} alt="" loading="lazy" />
      ) : (
        <div className="monogram" aria-hidden="true">
          {store.name.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <div className="store-info">
        <h3>{store.name}</h3>
        {store.is_boosted && <span className="badge badge-gold">Pilihan</span>}
        {store.address && <p className="muted small">{store.address}</p>}
        <p className="small">
          {store.rating_count > 0
            ? `★ ${Number(store.rating_avg).toFixed(1)} (${store.rating_count} ulasan)`
            : 'Belum ada ulasan'}
        </p>
      </div>
    </Link>
  );
}
