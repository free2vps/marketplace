import Link from 'next/link';
import { rupiah, productImage, activePromo, discountPercent } from '../../lib/media';
import StoreAvatar from './StoreAvatar';

export default function ProductCard({ product: p, href, showStore = true }) {
  const promo = activePromo(p);
  const price = Number(p.price);
  const img = productImage(p.image_path, true);
  const pct = promo ? discountPercent(price, Number(p.promo_price)) : 0;

  const inner = (
    <>
      <div className="pcard-photo">
        {img ? (
          <img src={img} alt={p.name} loading="lazy" />
        ) : (
          <span className="pcard-empty">Belum ada foto</span>
        )}
        {pct > 0 && <span className="pcard-badge">-{pct}%</span>}
      </div>
      <div className="pcard-body">
        <div className="pcard-name">{p.name}</div>
        <div className="pcard-price">
          {rupiah(promo ? Number(p.promo_price) : price)}
          {promo && <span className="pcard-old">{rupiah(price)}</span>}
        </div>
        <div className="pcard-stats">
          {p.rating_count > 0 ? (
            <span className="pcard-rating">
              <span className="star" aria-hidden="true">
                ★
              </span>
              {Number(p.rating_avg).toFixed(1)}
            </span>
          ) : (
            <span className="pcard-new">Baru</span>
          )}
          {p.sold_count > 0 && <span className="pcard-sold">{p.sold_count} terjual</span>}
        </div>
        {showStore && p.stores?.name && (
          <div className="pcard-store">
            <StoreAvatar store={p.stores} size="sm" />
            <span>{p.stores.name}</span>
          </div>
        )}
      </div>
    </>
  );

  return href ? (
    <Link className="pcard" href={href}>
      {inner}
    </Link>
  ) : (
    <div className="pcard">{inner}</div>
  );
}
