import Link from 'next/link';
import StoreAvatar from './StoreAvatar';

export default function StoreCard({ store }) {
  return (
    <Link
      className={`store-card${store.is_boosted ? ' featured' : ''}`}
      href={`/toko/${store.slug}`}
    >
      <StoreAvatar store={store} size="md" />
      <div className="store-info">
        <h3>{store.name}</h3>
        {store.is_boosted && <span className="badge badge-gold">Pilihan</span>}
        {store.address && <p className="muted small">{store.address}</p>}
        <p className="small">
          {store.rating_count > 0 ? (
            <>
              <span className="star">★</span> <strong>{Number(store.rating_avg).toFixed(1)}</strong>{' '}
              ({store.rating_count} ulasan)
            </>
          ) : (
            'Belum ada ulasan'
          )}
        </p>
      </div>
    </Link>
  );
}
