import Link from 'next/link';
import HeaderOrderLinks from './HeaderOrderLinks';

export default function SearchHeader({ q = '' }) {
  return (
    <header className="site-header">
      <div className="site-header-inner shop-header">
        <Link className="brand" href="/">
          UMKM Taliwang
        </Link>

        <form className="searchbar" action="/" method="get" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cari produk di Taliwang"
            aria-label="Cari produk"
          />
          <button className="btn btn-gold btn-sm" type="submit">
            Cari
          </button>
        </form>

        <nav className="nav">
          <HeaderOrderLinks />
          <Link className="nav-link hide-sm" href="/masuk-toko">
            Masuk
          </Link>
          <Link className="btn btn-gold btn-sm hide-sm" href="/daftar-toko">
            Daftarkan toko
          </Link>
        </nav>
      </div>
    </header>
  );
}
