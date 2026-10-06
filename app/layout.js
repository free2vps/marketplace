import { Fraunces, Figtree } from 'next/font/google';
import './globals.css';
import './shop.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata = {
  title: 'UMKM Taliwang',
  description: 'Belanja langsung dari toko dan usaha lokal Taliwang',
};

export const viewport = {
  themeColor: '#0f1b33',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${fraunces.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
