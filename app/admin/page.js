'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { rupiah, bannerImage } from '../../lib/media';
import { clearSettingsCache } from '../../lib/useSettings';
import SiteHeader from '../components/SiteHeader';

const TABS = [
  ['pembayaran', 'Pembayaran'],
  ['toko', 'Toko'],
  ['banner', 'Banner'],
  ['pengaturan', 'Pengaturan'],
];
const dateTime = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const BANNER_STATUS = { pending_review: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', paused: 'Dijeda', expired: 'Selesai' };

export default function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState('loading'); // loading | denied | ok
  const [tab, setTab] = useState('pembayaran');
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [stores, setStores] = useState([]);
  const [banners, setBanners] = useState([]);
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    const [sm, pay, st, bn, se] = await Promise.all([
      supabase.rpc('admin_summary'),
      supabase
        .from('manual_payments')
        .select('id, kind, months, amount, proof_path, created_at, stores(name, slug), banners(title, slot, start_date, end_date, image_path)')
        .eq('status', 'pending')
        .order('created_at'),
      supabase
        .from('stores')
        .select('id, name, slug, subscription_status, plan, premium_until, verified_at, is_boosted, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('banners')
        .select('id, slot, title, image_path, start_date, end_date, status, price, impressions, clicks, stores(name)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('platform_settings').select('key, value, description, is_public').order('key'),
    ]);
    setSummary(sm.data);
    setPayments(pay.data || []);
    setStores(st.data || []);
    setBanners(bn.data || []);
    setSettings(se.data || []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      const { data: isAdmin } = await supabase.rpc('is_admin');
      if (!isAdmin) {
        setState('denied');
        return;
      }
      await loadAll();
      setState('ok');
    }
    init();
  }, [router, loadAll]);

  async function run(fn) {
    setBusy(true);
    setMessage(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setMessage(error.message);
    await loadAll();
  }

  async function viewProof(path) {
    const { data, error } = await supabase.storage.from('bukti').createSignedUrl(path, 300);
    if (error) setMessage(error.message);
    else window.open(data.signedUrl, '_blank', 'noopener');
  }

  const review = (p, approve) => {
    const note = approve ? null : window.prompt('Alasan penolakan (opsional, dilihat pemilik toko):') || null;
    if (!approve && note === null && !window.confirm('Tolak tanpa alasan?')) return;
    run(() => supabase.rpc('admin_review_manual_payment', { p_id: p.id, p_approve: approve, p_note: note }));
  };

  async function saveSetting(row) {
    const raw = drafts[row.key];
    let value = raw;
    if (typeof row.value === 'number') {
      value = Number(raw);
      if (!Number.isFinite(value)) {
        setMessage('Isi harus angka.');
        return;
      }
    }
    await run(() => supabase.from('platform_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', row.key));
    clearSettingsCache();
    setDrafts((d) => {
      const n = { ...d };
      delete n[row.key];
      return n;
    });
  }

  async function toggleSetting(row) {
    await run(() => supabase.from('platform_settings').update({ value: !row.value, updated_at: new Date().toISOString() }).eq('key', row.key));
    clearSettingsCache();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }
  const logoutButton = <button className="btn btn-ghost btn-sm" onClick={logout}>Keluar</button>;

  if (state === 'loading') return (<><SiteHeader>{logoutButton}</SiteHeader><main className="container">Memuat...</main></>);
  if (state === 'denied') {
    return (
      <>
        <SiteHeader>{logoutButton}</SiteHeader>
        <main className="container-narrow">
          <h1>Admin</h1>
          <div className="alert alert-error">Akun ini bukan admin.</div>
        </main>
      </>
    );
  }

  const now = new Date();
  const cards = summary
    ? [
        ['Toko tayang', `${summary.stores_live} / ${summary.stores_total}`],
        ['Toko Premium', summary.stores_premium],
        ['Produk', summary.products_total],
        ['Pembayaran menunggu', summary.pending_payments],
        ['Banner tayang', summary.banners_live],
        ['Pesanan', summary.orders_total],
      ]
    : [];
  // Pemasukan platform (dihitung admin_summary; lihat supabase/009_pendapatan_admin.sql)
  const incomeCards = summary && summary.income_premium != null
    ? [
        ['Premium (masuk)', rupiah(summary.income_premium || 0)],
        ['Banner (masuk)', rupiah(summary.income_banner || 0)],
        ['Menunggu persetujuan', rupiah(summary.income_pending || 0)],
        ['GMV 30 hari', rupiah(summary.gmv_30d || 0)],
        ['Potensi komisi + fee 30 hari', rupiah(summary.fees_30d || 0)],
        ['GMV sejak awal', rupiah(summary.gmv_total || 0)],
      ]
    : [];

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container">
        <h1>Panel admin</h1>
        {message && <div className="alert alert-error">{message}</div>}

        <div className="stat-cards">
          {cards.map(([label, value]) => (
            <div key={label} className="stat-card">
              <div className="stat-value">{value}</div>
              <div className="muted small">{label}</div>
            </div>
          ))}
        </div>

        {incomeCards.length > 0 && (
          <>
            <h2 style={{ marginTop: 8 }}>Pendapatan platform</h2>
            <div className="stat-cards" style={{ paddingTop: 0 }}>
              {incomeCards.map(([label, value]) => (
                <div key={label} className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.15rem' }}>{value}</div>
                  <div className="muted small">{label}</div>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: -6 }}>
              GMV menghitung pesanan selesai (COD diasumsikan tertagih). Komisi + fee adalah
              potensi, bukan bukti dana diterima. Premium/banner berdasarkan transfer yang
              disetujui di tab Pembayaran, bukan laba bersih.
            </p>
          </>
        )}

        <div className="chip-row" style={{ paddingTop: 0 }}>
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={`chip${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>
              {label}
              {key === 'pembayaran' && payments.length > 0 ? ` (${payments.length})` : ''}
            </button>
          ))}
        </div>

        {tab === 'pembayaran' && (
          <>
            {payments.length === 0 && <div className="empty">Tidak ada pembayaran yang menunggu.</div>}
            <ul className="order-cards">
              {payments.map((p) => (
                <li key={p.id} className="order-card">
                  <div className="order-card-head">
                    <strong>{p.stores?.name}</strong>
                    <span className="badge badge-gold">{p.kind === 'premium' ? `Premium ${p.months} bulan` : 'Sewa banner'}</span>
                    <span className="muted small">{dateTime(p.created_at)}</span>
                  </div>
                  <div className="sum-row sum-total"><span>Jumlah transfer</span><span>{rupiah(p.amount)}</span></div>
                  {p.banners && (
                    <div className="admin-banner">
                      <img src={bannerImage(p.banners.image_path)} alt={p.banners.title} />
                      <div className="small">
                        <strong>{p.banners.title}</strong>
                        <div className="muted">{p.banners.slot} · {dateOnly(p.banners.start_date)} – {dateOnly(p.banners.end_date)}</div>
                      </div>
                    </div>
                  )}
                  <div className="actions" style={{ marginTop: 12 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => viewProof(p.proof_path)}>Lihat bukti transfer</button>
                    <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => review(p, true)}>Setujui</button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => review(p, false)}>Tolak</button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">Cocokkan jumlah dan nama pengirim dengan mutasi rekening sebelum menyetujui.</p>
          </>
        )}

        {tab === 'toko' && (
          <ul className="order-cards">
            {stores.map((s) => {
              const prem = s.premium_until && new Date(s.premium_until) > now;
              const live = s.subscription_status === 'active';
              return (
                <li key={s.id} className="order-card">
                  <div className="order-card-head">
                    <strong>{s.name}</strong>
                    <span className={`badge ${live ? 'badge-ok' : 'badge-warn'}`}>{live ? 'Tayang' : 'Tidak tayang'}</span>
                    {prem && <span className="badge badge-gold">Premium s.d. {dateOnly(s.premium_until)}</span>}
                    {s.verified_at && <span className="badge badge-ok">Terverifikasi</span>}
                    {s.is_boosted && <span className="badge badge-gold">Pilihan</span>}
                    <a className="muted small" style={{ marginLeft: 'auto' }} href={`/toko/${s.slug}`} target="_blank" rel="noopener noreferrer">Buka</a>
                  </div>
                  <div className="actions">
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_set_store', { p_id: s.id, p_active: !live }))}>
                      {live ? 'Tangguhkan' : 'Tayangkan'}
                    </button>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_set_store', { p_id: s.id, p_boosted: !s.is_boosted }))}>
                      {s.is_boosted ? 'Cabut Pilihan' : 'Tandai Pilihan'}
                    </button>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_set_store', { p_id: s.id, p_verified: !s.verified_at }))}>
                      {s.verified_at ? 'Cabut lencana' : 'Beri lencana'}
                    </button>
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_grant_premium', { p_id: s.id, p_days: 30 }))}>
                      +30 hari Premium
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'banner' && (
          <>
            {banners.length === 0 && <div className="empty">Belum ada banner.</div>}
            <ul className="order-cards">
              {banners.map((b) => (
                <li key={b.id} className="order-card">
                  <div className="admin-banner">
                    <img src={bannerImage(b.image_path)} alt={b.title} />
                    <div className="small">
                      <strong>{b.title}</strong> <span className="badge badge-gold">{BANNER_STATUS[b.status]}</span>
                      <div className="muted">{b.stores?.name} · {b.slot} · {dateOnly(b.start_date)} – {dateOnly(b.end_date)}</div>
                      <div className="muted">{rupiah(b.price)} · {b.impressions} tayangan · {b.clicks} klik</div>
                    </div>
                  </div>
                  <div className="actions" style={{ marginTop: 10 }}>
                    {b.status !== 'approved' && b.status !== 'pending_review' && b.status !== 'expired' && (
                      <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_set_banner_status', { p_id: b.id, p_status: 'approved' }))}>Tayangkan lagi</button>
                    )}
                    {b.status === 'approved' && (
                      <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => supabase.rpc('admin_set_banner_status', { p_id: b.id, p_status: 'paused' }))}>Jeda</button>
                    )}
                    {b.status !== 'rejected' && b.status !== 'expired' && (
                      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => window.confirm('Tolak banner ini?') && run(() => supabase.rpc('admin_set_banner_status', { p_id: b.id, p_status: 'rejected' }))}>Tolak</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">Banner baru disetujui lewat tab Pembayaran (satu persetujuan untuk gambar dan pembayaran).</p>
          </>
        )}

        {tab === 'pengaturan' && (
          <ul className="product-list">
            {settings.map((row) => (
              <li key={row.key} className="product-row">
                <div>
                  <strong>{row.key}</strong>
                  <div className="muted small">{row.description}</div>
                </div>
                {typeof row.value === 'boolean' ? (
                  <button className={`btn btn-sm ${row.value ? 'btn-gold' : 'btn-outline'}`} disabled={busy} onClick={() => toggleSetting(row)}>
                    {row.value ? 'HIDUP' : 'mati'}
                  </button>
                ) : (
                  <div className="setting-edit">
                    <input
                      value={drafts[row.key] ?? String(row.value ?? '')}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      aria-label={row.key}
                    />
                    <button className="btn btn-navy btn-sm" disabled={busy || drafts[row.key] === undefined} onClick={() => saveSetting(row)}>Simpan</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
