// Manifest PWA: membuat web bisa dipasang di layar utama HP ("Tambahkan ke Layar Utama").
export default function manifest() {
  return {
    name: 'UMKM Taliwang',
    short_name: 'UMKM Taliwang',
    description: 'Belanja langsung dari toko dan usaha lokal Taliwang',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1b33',
    theme_color: '#0f1b33',
    lang: 'id',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
