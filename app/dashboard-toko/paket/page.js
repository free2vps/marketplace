'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { compressImage } from '../../../lib/image';
import { rupiah } from '../../../lib/media';
import { loadSettings } from '../../../lib/settings';
import SiteHeader from '../../components/SiteHeader';

const dateId = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const STATUS = { pending: 'Menunggu verifikasi', approved: 'Disetujui', rejected: 'Ditolak' };

export default function PaketPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [store, setStore] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [months, setMonths] = useState(1);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async (storeId) => {
    const [c, h] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
      supabase
        .from('manual_payments')
        .select('id, months, amount, status, admin_note, created_at')
        .eq('store_id', storeId)
        .eq('kind', 'premium')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    setCount(c.count || 0);
    setHistory(h.data || []);
    const { data: s } = await supabase
      .from('stores')
      .select('id, name, plan, premium_until, is_premium, verified_at')
      .eq('id', storeId)
      .single();
    setStore(s);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      setUid(user.id);
      const { data: s } = await supabase
        .from('stores')
        .select('id, name, plan, premium_until, is_premium, verified_at')
        .eq('owner_id', user.id)
        .single();
      setStore(s);
      setCfg(await loadSettings(supabase));
      if (s) await reload(s.id);
      setLoading(false);
    }
    init();
  }, [router, reload]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!file) {
      setError('Unggah foto bukti transfer dulu.');
      return;
    }
    setBusy(true);
    let path = null;
    try {
      const { blob, ext } = await compressImage(file, { maxSide: 1600, targetBytes: 300 * 1024, limitBytes: 900 * 1024 });
      path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('bukti').upload(path, blob, { contentType: blob.type });
      if (up.error) throw up.error;
      const { error: rpcError } = await supabase.rpc('submit_premium_payment', {
        p_store: store.id, p_months: months, p_proof_path: path,
      });
      if (rpcError) throw rpcError;
    } catch (err) {
      if (path) await supabase.storage.from('bukti').remove([path]);
      setError(err.message || 'Bukti gagal dikirim.');
      setBusy(false);
      return;
    }
    setFile(null);
    setNotice('Bukti transfer terkirim. Admin akan memeriksa dan mengaktifkan Premium setelah dana diterima.');
    setBusy(false);
    await reload(store.id);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }
  const logoutButton = <button className="btn btn-ghost btn-sm" onClick={logout}>Keluar</button>;

  if (loading) return (<><SiteHeader>{logoutButton}</SiteHeader><main className="container-narrow">Memuat...</main></>);
  if (!store) return (<><SiteHeader>{logoutButton}</SiteHeader><main className="container-narrow"><div className="empty">Profil toko tidak ditemukan.</div></main></>);

  const premium = store.premium_until && new Date(store.premium_until) > new Date();
  const limit = cfg?.freeProductLimit ?? 10;
  const price = (cfg?.premiumPriceMonth ?? 25000) * months;
  const bank = cfg?.bank;
  const bankReady = bank?.name && bank?.number && bank?.holder;
  const pending = history.some((h) => h.status === 'pending');

  const rows = [
    ['Etalase toko di direktori', true, true],
    ['Tombol pesan lewat WhatsApp', true, true],
    ['Jumlah produk', `Maksimal ${limit}`, 'Tanpa batas'],
    ['Lencana "Terverifikasi"', false, true],
    ['Prioritas di hasil pencarian dan kategori', false, true],
    ['Statistik pengunjung', false, true],
    ['Cetak label pengiriman', false, true],
  ];
  const cell = (v) => (v === true ? <span className="amount-in">✓</span> : v === false ? <span className="muted">—</span> : v);

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">&larr; Kembali ke dashboard</a>
        <h1>Paket toko</h1>

        <section className="panel">
          {premium ? (
            <>
              <span className="badge badge-ok">Premium</span>
              <h2 style={{ marginTop: 8 }}>Aktif sampai {dateId(store.premium_until)}</h2>
              <p className="muted" style={{ margin: 0 }}>Terima kasih sudah mendukung UMKM Taliwang. Kamu bisa memperpanjang kapan saja di bawah.</p>
            </>
          ) : (
            <>
              <span className="badge badge-warn">Gratis</span>
              <h2 style={{ marginTop: 8 }}>{count} dari {limit} produk terpakai</h2>
              <div className="meter" aria-hidden="true"><div style={{ width: `${Math.min(100, (count / limit) * 100)}%` }} /></div>
              {count >= limit && (
                <p className="muted small" style={{ margin: '8px 0 0' }}>
                  Batas produk tercapai. Tingkatkan ke Premium untuk menambah produk.
                </p>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Gratis dan Premium</h2>
          <table className="plan-table">
            <thead><tr><th></th><th>Gratis</th><th>Premium</th></tr></thead>
            <tbody>
              {rows.map(([label, free, prem]) => (
                <tr key={label}><td>{label}</td><td>{cell(free)}</td><td>{cell(prem)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Harga Premium: {rupiah(cfg?.premiumPriceMonth ?? 25000)} per bulan.</p>
        </section>

        <form className="panel" onSubmit={submit}>
          <h2>{premium ? 'Perpanjang Premium' : 'Tingkatkan ke Premium'}</h2>
          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-warn">{notice}</div>}
          {pending && <div className="alert alert-warn">Ada pembayaran yang sedang diverifikasi admin.</div>}

          <div className="field">
            <label htmlFor="months">Lama langganan</label>
            <select id="months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 3, 6, 12].map((m) => (<option key={m} value={m}>{m} bulan</option>))}
            </select>
          </div>

          <div className="transfer-box">
            <div className="muted small">Transfer tepat sebesar</div>
            <div className="transfer-amount">{rupiah(price)}</div>
            {bankReady ? (
              <div>
                <strong>{bank.name}</strong> · {bank.number}
                <div className="muted small">a.n. {bank.holder}</div>
              </div>
            ) : (
              <div className="muted small">Rekening tujuan belum diatur admin. Hubungi admin untuk berlangganan.</div>
            )}
          </div>

          <div className="field">
            <label htmlFor="proof">Foto bukti transfer</label>
            <input id="proof" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <button className="btn btn-gold" type="submit" disabled={busy || pending || !bankReady}>
            {busy ? 'Mengirim...' : 'Kirim bukti transfer'}
          </button>
        </form>

        {history.length > 0 && (
          <>
            <h2>Riwayat pembayaran</h2>
            <ul className="product-list">
              {history.map((h) => (
                <li key={h.id} className="product-row">
                  <span>
                    {h.months} bulan · {dateId(h.created_at)}
                    <div className="muted small">{STATUS[h.status]}{h.admin_note ? ` — ${h.admin_note}` : ''}</div>
                  </span>
                  <span className="price">{rupiah(h.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
