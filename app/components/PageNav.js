import Link from 'next/link';
import BackButton from './BackButton';

// Tombol kembali + jejak halaman (Beranda > ... > halaman ini)
export default function PageNav({ crumbs = [] }) {
  return (
    <div className="page-nav">
      <BackButton />
      <nav aria-label="Jejak halaman">
        <ol className="crumbs">
          <li>
            <Link href="/">Beranda</Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={i} aria-current={c.href ? undefined : 'page'}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
