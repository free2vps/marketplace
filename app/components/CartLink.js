'use client';

import Link from 'next/link';
import { useCart, cartCount } from '../../lib/cart';

export default function CartLink() {
  const { cart } = useCart();
  const n = cartCount(cart);
  return (
    <Link className="cart-link" href="/keranjang" aria-label={`Keranjang, ${n} barang`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6" />
      </svg>
      {n > 0 && <span className="cart-badge">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
