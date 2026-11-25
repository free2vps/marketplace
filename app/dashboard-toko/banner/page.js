'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { compressImage } from '../../../lib/image';
import { rupiah, bannerImage } from '../../../lib/media';
import { loadSettings } from '../../../lib/settings';
import SiteHeader from '../../components/SiteHeader';

const STATUS = {
  pending_review: 'Menunggu verifikasi',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  paused: 'Dijeda',
  expired: 'Selesai',
};
const dateId = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mengukur rasio gambar di browser supaya banner tidak gepeng/terpotong
function readRatio(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.width / img.height);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar tidak bisa dibaca.'));
    };
    img.src = url;
  });
}

export default function SewaBannerPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [store, setStore] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [slots, setSlots] = useState([]);
  const [products, setProducts] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [avail, setAvail] = useState(null);

  const [slot, setSlot] = useState('');
  const [start, setStart] = useState(todayStr());
  const [days, setDays] = useState(7);
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState('store');
  const [productId, setProductId] = useState('');
  const [url, setUrl] = useState('https://');
  const [image, setImage] = useState(null);
  const [proof, setProof] = useState(null);

  const reload = useCallback(async (storeId) => {
    const { data } = await supabase
      .from('banners')
      .select('id, slot, title, image_path, start_date, end_date, status, price, impressions, clicks')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    setMine(data || []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      setUid(user.id);
      const { data: s } = await supabase.from('stores').select('id, name, slug, subscription_status').eq('owner_id', user.id).single();
      setStore(s);
      setCfg(await loadSettings(supabase));
      const { data: sl } = await supabase.from('banner_slots').select('*').eq('is_active', true).order('sort_order');
      setSlots(sl || []);
      if (sl?.length) setSlot(sl[0].key);
      if (s) {
        const { data: pr } = await supabase.from('products').select('id, name').eq('store_id', s.id).order('name');
        setProducts(pr || []);
        await reload(s.id);
      }
      setLoading(false);
    }
    init();
  }, [router, reload]);

  const slotInfo = useMemo(() => slots.find((x) => x.key === slot), [slots, slot]);
  const price = slotInfo ? Number(slotInfo[`price_${days}`]) : 0;
  const end = addDays(start, days - 1);

  useEffect(() => {
    setAvail(null);
    if (!slot || !start) return;
    let live = true;
    supabase.rpc('banner_availability', { p_slot: slot, p_start: start, p_end: end }).then(({ data }) => live && setAvail(data));
    return () => {
      live = false;
    };
  }, [slot, start, end]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!image || !proof) {
      setError('Unggah gambar banner dan bukti transfer.');
      return;
    }
    setBusy(true);
    const uploaded = [];
    try {
      const target = slotInfo.width / slotInfo.height;
      const ratio = await readRatio(image);
      if (Math.abs(ratio - target) / target > 0.15) {
        throw new Error(`Rasio gambar harus mendekati ${slotInfo.width}×${slotInfo.height} (lebar : tinggi = ${target.toFixed(1)} : 1).`);
      }
      const img = await compressImage(image, { maxSide: slotInfo.width, targetBytes: 150 * 1024, limitBytes: 400 * 1024 });
      const imgPath = `${store.id}/${crypto.randomUUID()}.${img.ext}`;
      const up1 = await supabase.storage.from('banner').upload(imgPath, img.blob, { contentType: img.blob.type });
      if (up1.error) throw up1.error;
      uploaded.push(['banner', imgPath]);

      const prf = await compressImage(proof, { maxSide: 1600, targetBytes: 300 * 1024, limitBytes: 900 * 1024 });
      const prfPath = `${uid}/${crypto.randomUUID()}.${prf.ext}`;
      const up2 = await supabase.storage.from('bukti').upload(prfPath, prf.blob, { contentType: prf.blob.type });
      if (up2.error) throw up2.error;
      uploaded.push(['bukti', prfPath]);

      const { error: rpcError } = await supabase.rpc('book_banner', {
        p_store: store.id,
        p_slot: slot,
        p_start: start,
        p_days: days,
        p_title: title.trim(),
        p_link_type: linkType,
        p_link_value: linkType === 'store' ? store.slug : linkType === 'product' ? productId : url.trim(),
        p_image_path: imgPath,
        p_proof_path: prfPath,
      });
      if (rpcError) throw rpcError;
    } catch (err) {
      for (const [bucket, path] of uploaded) await supabase.storage.from(bucket).remove([path]);
      setError(err.message || 'Pemesanan banner gagal.');
      setBusy(false);
      return;
    }
    setNotice('Banner dikirim. Admin akan memeriksa gambar dan pembayaran, lalu banner tayang pada tanggal mulai.');
    setTitle('');
    setImage(null);
    setProof(null);
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

  const bank = cfg?.bank;
  const bankReady = bank?.name && bank?.number && bank?.holder;
  const canBook = store.subscription_status === 'active' && bankReady && slots.length > 0;

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">&larr; Kembali ke dashboard</a>
        <h1>Sewa banner</h1>
        <p className="muted">Pasang banner di beranda UMKM Taliwang supaya tokomu dilihat lebih banyak pembeli.</p>

        {!bankReady && <div className="alert alert-warn">Rekening pembayaran belum diatur admin, jadi pemesanan banner belum dibuka.</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-warn">{notice}</div>}

        <form className="panel" onSubmit={submit}>
          <h2>Pesan banner</h2>

          <div className="field">
            <label htmlFor="b-slot">Posisi</label>
            <select id="b-slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
              {slots.map((sl) => (<option key={sl.key} value={sl.key}>{sl.name}</option>))}
            </select>
            {slotInfo && (
              <span className="hint muted small">
                {slotInfo.description}. Ukuran gambar {slotInfo.width}×{slotInfo.height} px.
              </span>
            )}
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="b-start">Mulai tayang</label>
              <input id="b-start" type="date" required min={todayStr()} max={addDays(todayStr(), 60)} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="b-days">Durasi</label>
              <select id="b-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 14, 30].map((d) => (<option key={d} value={d}>{d} hari</option>))}
              </select>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: -6 }}>
            Tayang {dateId(start)} sampai {dateId(end)}.{' '}
            {avail != null && (avail > 0 ? <strong>Posisi tersedia.</strong> : <strong style={{ color: 'var(--danger)' }}>Posisi penuh pada tanggal ini.</strong>)}
          </p>

          <div className="field">
            <label htmlFor="b-title">Judul banner</label>
            <input id="b-title" required minLength={3} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Diskon akhir pekan" />
          </div>

          <div className="field">
            <label htmlFor="b-link">Saat banner diklik, buka</label>
            <select id="b-link" value={linkType} onChange={(e) => setLinkType(e.target.value)}>
              <option value="store">Halaman tokoku</option>
              <option value="product">Salah satu produkku</option>
              <option value="url">Tautan luar (https://)</option>
            </select>
          </div>
          {linkType === 'product' && (
            <div className="field">
              <label htmlFor="b-prod">Produk</label>
              <select id="b-prod" required value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Pilih produk</option>
                {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
          )}
          {linkType === 'url' && (
            <div className="field">
              <label htmlFor="b-url">Tautan</label>
              <input id="b-url" type="url" required pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          )}

          <div className="field">
            <label htmlFor="b-img">Gambar banner</label>
            <input id="b-img" type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} />
            <span className="hint muted small">Otomatis dikompres. Pastikan teks terbaca dan tidak terpotong di tepi.</span>
          </div>

          <div className="transfer-box">
            <div className="muted small">Biaya sewa</div>
            <div className="transfer-amount">{rupiah(price)}</div>
            {bankReady && (
              <div>
                Transfer ke <strong>{bank.name}</strong> · {bank.number}
                <div className="muted small">a.n. {bank.holder}</div>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="b-proof">Foto bukti transfer</label>
            <input id="b-proof" type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0] || null)} />
          </div>

          <button className="btn btn-gold" type="submit" disabled={busy || !canBook || avail === 0 || avail === null}>
            {busy ? 'Mengirim...' : 'Kirim pesanan banner'}
          </button>
        </form>

        <h2>Banner saya</h2>
        {mine.length === 0 ? (
          <div className="empty">Belum ada banner.</div>
        ) : (
          <ul className="product-list">
            {mine.map((b) => (
              <li key={b.id} className="product-row">
                <div className="product-main">
                  <img className="thumb banner-thumb" src={bannerImage(b.image_path)} alt="" />
                  <div>
                    <span className="product-name">{b.title}</span>
                    <div className="muted small">{dateId(b.start_date)} – {dateId(b.end_date)} · {STATUS[b.status]}</div>
                    <div className="muted small">{b.impressions} tayangan · {b.clicks} klik</div>
                  </div>
                </div>
                <span className="price">{rupiah(b.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
