'use client';

import Link from 'next/link';
import { useSettings } from '../../lib/useSettings';
import CartLink from './CartLink';

// Tautan Pesanan dan Keranjang hanya muncul saat pemesanan lewat aplikasi dibuka (Fase 2).
export default function HeaderOrderLinks() {
  const cfg = useSettings();
  if (!cfg?.webOrdersOn) return null;
  return (
    <>
      <Link className="nav-link" href="/pesanan">
        Pesanan
      </Link>
      <CartLink />
    </>
  );
}
