import Link from 'next/link';
import { rupiah, productImage, activePromo, discountPercent } from '../../lib/media';

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
        <div className="pcard-meta">
          {p.rating_count > 0 ? `★ ${Number(p.rating_avg).toFixed(1)}` : 'Baru'}
          {p.sold_count > 0 ? ` · ${p.sold_count} terjual` : ''}
        </div>
        {showStore && p.stores?.name && <div className="pcard-meta">{p.stores.name}</div>}
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
