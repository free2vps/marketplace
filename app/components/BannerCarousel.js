'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { bannerImage } from '../../lib/media';

function hrefOf(b) {
  if (b.link_type === 'store') return `/toko/${b.link_value}`;
  if (b.link_type === 'product') return `/produk/${b.link_value}`;
  return b.link_value;
}

// Banner iklan berputar. Setiap tayangan/klik dicatat untuk laporan penyewa.
export default function BannerCarousel({ banners, ratio = '3 / 1' }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;
  const current = banners[Math.min(i, count - 1)];

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % count), 6000);
    return () => clearInterval(id);
  }, [count, paused]);

  useEffect(() => {
    if (!current) return;
    try {
      const key = `bi:${current.id}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // abaikan
    }
    supabase.rpc('track_banner', { p_id: current.id, p_kind: 'impression' }).then(() => {});
  }, [current]);

  if (!current) return null;
  const external = current.link_type === 'url';
  const img = (
    <img src={bannerImage(current.image_path)} alt={current.title} style={{ aspectRatio: ratio }} />
  );
  const onClick = () => supabase.rpc('track_banner', { p_id: current.id, p_kind: 'click' }).then(() => {});

  return (
    <section
      className="banner-wrap"
      aria-label="Iklan"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="banner-frame">
        {external ? (
          <a href={hrefOf(current)} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick}>
            {img}
          </a>
        ) : (
          <Link href={hrefOf(current)} onClick={onClick}>
            {img}
          </Link>
        )}
        <span className="banner-label">Iklan</span>
        {count > 1 && (
          <div className="banner-dots">
            {banners.map((b, n) => (
              <button
                key={b.id}
                type="button"
                className={n === i ? 'on' : ''}
                aria-label={`Banner ${n + 1}`}
                onClick={() => setI(n)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
