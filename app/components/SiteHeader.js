export default function SiteHeader({ children }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href="/">
          UMKM Taliwang
        </a>
        <nav className="nav">
          {children ?? (
            <>
              <a className="nav-link" href="/masuk-toko">
                Masuk
              </a>
              <a className="btn btn-gold btn-sm" href="/daftar-toko">
                Daftarkan toko
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
