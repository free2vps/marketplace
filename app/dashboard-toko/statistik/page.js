'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import SiteHeader from '../../components/SiteHeader';

export default function StatistikPage() {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, locked: false, data: null, error: null });

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      const { data: s } = await supabase.from('stores').select('id').eq('owner_id', user.id).single();
      if (!s) {
        setState({ loading: false, locked: false, data: null, error: 'Profil toko tidak ditemukan.' });
        return;
      }
      const { data, error } = await supabase.rpc('store_stats', { p_store: s.id, p_days: 30 });
      if (error) {
        const locked = /Premium/.test(error.message);
        setState({ loading: false, locked, data: null, error: locked ? null : error.message });
      } else {
        setState({ loading: false, locked: false, data, error: null });
      }
    }
    init();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }
  const logoutButton = <button className="btn btn-ghost btn-sm" onClick={logout}>Keluar</button>;
  const { loading, locked, data, error } = state;

  const max = data ? Math.max(1, ...data.days.map((d) => d.visits)) : 1;
  const cards = data
    ? [
        ['Kunjungan toko', data.totals.visits],
        ['Produk dilihat', data.totals.product_views],
        ['Klik WhatsApp', data.totals.wa_clicks],
      ]
    : [];

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">&larr; Kembali ke dashboard</a>
        <h1>Statistik pengunjung</h1>
        {loading && <p>Memuat...</p>}
        {error && <div className="alert alert-error">{error}</div>}

        {locked && (
          <section className="panel">
            <h2>Fitur Premium</h2>
            <p className="muted">
              Lihat berapa orang mengunjungi tokomu, produk apa yang paling sering dibuka, dan berapa kali pembeli menekan
              tombol WhatsApp.
            </p>
            <a className="btn btn-gold" href="/dashboard-toko/paket">Lihat paket Premium</a>
          </section>
        )}

        {data && (
          <>
            <p className="muted">30 hari terakhir</p>
            <div className="stat-cards">
              {cards.map(([label, value]) => (
                <div key={label} className="stat-card">
                  <div className="stat-value">{value}</div>
                  <div className="muted small">{label}</div>
                </div>
              ))}
            </div>

            <section className="panel">
              <h2>Kunjungan per hari</h2>
              <div className="bars" role="img" aria-label="Grafik kunjungan 30 hari terakhir">
                {data.days.map((d) => (
                  <div key={d.day} className="bar-col" title={`${d.day}: ${d.visits} kunjungan`}>
                    <div className="bar" style={{ height: `${Math.max(3, (d.visits / max) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="bars-axis muted small">
                <span>{data.days[0]?.day}</span>
                <span>{data.days[data.days.length - 1]?.day}</span>
              </div>
            </section>

            <h2>Produk paling sering dibuka</h2>
            {data.top_products.length === 0 ? (
              <div className="empty">Belum ada produk.</div>
            ) : (
              <ul className="product-list">
                {data.top_products.map((p) => (
                  <li key={p.id} className="product-row">
                    <span>{p.name}</span>
                    <span className="muted small">{p.views}× dilihat · {p.sold} terjual</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small" style={{ marginTop: 12 }}>
              Data dihitung sejak fitur ini aktif. &ldquo;Produk dilihat&rdquo; di daftar ini adalah total sepanjang waktu.
            </p>
          </>
        )}
      </main>
    </>
  );
}
