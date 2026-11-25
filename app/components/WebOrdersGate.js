'use client';

import Link from 'next/link';
import { useSettings } from '../../lib/useSettings';
import SearchHeader from './SearchHeader';
import PageNav from './PageNav';

// Membungkus halaman keranjang/checkout: aktif hanya bila pemesanan lewat aplikasi dibuka.
export default function WebOrdersGate({ title, children }) {
  const cfg = useSettings();
  if (cfg === null) return null;
  if (cfg.webOrdersOn) return children;
  return (
    <>
      <SearchHeader />
      <PageNav crumbs={[{ label: title }]} />
      <main className="container-narrow">
        <h1>{title}</h1>
        <div className="alert alert-warn">
          Pemesanan lewat aplikasi belum dibuka. Untuk saat ini, pesan langsung ke penjual lewat tombol
          WhatsApp di halaman produk atau halaman toko.
        </div>
        <Link className="btn btn-gold" href="/">
          Cari produk
        </Link>
      </main>
    </>
  );
}
