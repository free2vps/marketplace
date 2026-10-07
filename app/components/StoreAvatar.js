// Ikon/logo toko. Memakai logo jika ada, kalau tidak huruf pertama nama toko.
export default function StoreAvatar({ store, size = 'md' }) {
  if (store?.logo_url) {
    return <img className={`avatar avatar-${size}`} src={store.logo_url} alt="" loading="lazy" />;
  }
  return (
    <span className={`avatar avatar-${size} avatar-mono`} aria-hidden="true">
      {(store?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
