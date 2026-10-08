'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { compressImage } from '../../../lib/image';
import { rupiah, productImage, thumbPath, activePromo } from '../../../lib/media';
import { loadSettings } from '../../../lib/settings';
import { storeNetEstimate } from '../../../lib/fees';
import SiteHeader from '../../components/SiteHeader';

const emptyForm = {
  name: '',
  categoryId: '',
  price: '',
  promoMode: 'none', // none | percent | fixed
  promoValue: '',
  promoEnds: '',
  stock: '',
  description: '',
};

async function removeImages(path) {
  if (!path) return;
  try {
    await supabase.storage.from('produk').remove([path, thumbPath(path)]);
  } catch {
    // abaikan: file yatim tidak mengganggu fungsi
  }
}

async function uploadImages(file, storeId) {
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran foto maksimal 20 MB.');

  const main = await compressImage(file, { maxSide: 800, targetBytes: 120 * 1024 });
  const thumb = await compressImage(file, { maxSide: 400, targetBytes: 40 * 1024 });

  const id = crypto.randomUUID();
  const path = `${storeId}/${id}.${main.ext}`;
  const bucket = supabase.storage.from('produk');

  const up1 = await bucket.upload(path, main.blob, {
    contentType: main.blob.type,
    cacheControl: '31536000',
  });
  if (up1.error) throw up1.error;

  const up2 = await bucket.upload(thumbPath(path), thumb.blob, {
    contentType: thumb.blob.type,
    cacheControl: '31536000',
  });
  if (up2.error) {
    await removeImages(path);
    throw up2.error;
  }
  return path;
}

export default function ProdukPage() {
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cfg, setCfg] = useState({ commissionOn: false, commissionPercent: 0 });
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);

  const loadProducts = useCallback(async (storeId) => {
    const { data, error: loadError } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (loadError) setError(loadError.message);
    else setProducts(data || []);
  }, []);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/masuk-toko');
        return;
      }

      const { data: storeData } = await supabase
        .from('stores')
        .select('id, name, subscription_status')
        .eq('owner_id', user.id)
        .single();

      setStore(storeData);
      setCfg(await loadSettings(supabase));

      if (storeData?.subscription_status === 'active') {
        const { data: cats } = await supabase.from('categories').select('id, name').order('name');
        setCategories(cats || []);
        await loadProducts(storeData.id);
      }
      setLoading(false);
    }
    init();
  }, [router, loadProducts]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(p) {
    setEditing(p);
    setFile(null);
    setForm({
      name: p.name,
      categoryId: p.category_id || '',
      price: String(p.price),
      promoMode: p.promo_price != null ? 'fixed' : 'none',
      promoValue: p.promo_price != null ? String(p.promo_price) : '',
      promoEnds: p.promo_ends_at ? new Date(p.promo_ends_at).toISOString().slice(0, 10) : '',
      stock: p.stock != null ? String(p.stock) : '',
      description: p.description || '',
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditing(null);
    setFile(null);
    setForm(emptyForm);
    setError(null);
    setStatus('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Harga harus berupa angka lebih dari 0.');
      return;
    }

    let promoPrice = null;
    if (form.promoMode === 'percent') {
      const pct = Number(form.promoValue);
      if (!(pct >= 1 && pct <= 90)) {
        setError('Potongan harga harus antara 1% dan 90%.');
        return;
      }
      promoPrice = Math.round((price * (100 - pct)) / 100);
    } else if (form.promoMode === 'fixed') {
      const value = Number(form.promoValue);
      if (!(value > 0 && value < price)) {
        setError('Harga promo harus lebih kecil dari harga normal.');
        return;
      }
      promoPrice = value;
    }

    let stock = null;
    if (form.stock !== '') {
      stock = Number.parseInt(form.stock, 10);
      if (!Number.isInteger(stock) || stock < 0) {
        setError('Stok harus berupa angka bulat, atau kosongkan jika tidak dibatasi.');
        return;
      }
    }

    const promoEndsAt =
      promoPrice !== null && form.promoEnds
        ? new Date(`${form.promoEnds}T23:59:59`).toISOString()
        : null;

    setSaving(true);
    let newPath = null;

    try {
      if (file) {
        setStatus('Memproses dan mengunggah foto...');
        newPath = await uploadImages(file, store.id);
      }

      setStatus('Menyimpan produk...');
      const payload = {
        name: form.name.trim(),
        category_id: form.categoryId || null,
        description: form.description.trim() || null,
        price,
        stock,
        promo_price: promoPrice,
        promo_ends_at: promoEndsAt,
        ...(newPath ? { image_path: newPath } : {}),
      };

      const { error: saveError } = editing
        ? await supabase.from('products').update(payload).eq('id', editing.id)
        : await supabase.from('products').insert({ ...payload, store_id: store.id });

      if (saveError) throw saveError;

      if (newPath && editing?.image_path) await removeImages(editing.image_path);
    } catch (err) {
      if (newPath) await removeImages(newPath);
      setError(err.message || 'Produk gagal disimpan.');
      setSaving(false);
      setStatus('');
      return;
    }

    setSaving(false);
    resetForm();
    await loadProducts(store.id);
  }

  async function toggleAvailable(p) {
    setError(null);
    const { error: toggleError } = await supabase
      .from('products')
      .update({ is_available: !p.is_available })
      .eq('id', p.id);

    if (toggleError) {
      setError(toggleError.message);
      return;
    }
    await loadProducts(store.id);
  }

  async function handleDelete(p) {
    if (!window.confirm(`Hapus produk "${p.name}"?`)) return;
    setError(null);

    const { error: deleteError } = await supabase.from('products').delete().eq('id', p.id);

    if (deleteError) {
      if (deleteError.code === '23503') {
        setError(
          'Produk ini sudah pernah dipesan sehingga tidak bisa dihapus. ' +
            'Gunakan tombol "Sembunyikan" supaya tidak tampil ke pembeli.'
        );
      } else {
        setError(deleteError.message);
      }
      return;
    }
    await removeImages(p.image_path);
    await loadProducts(store.id);
  }

  const logoutButton = (
    <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
      Keluar
    </button>
  );

  if (loading) {
    return (
      <>
        <SiteHeader>{logoutButton}</SiteHeader>
        <main className="container-narrow">Memuat...</main>
      </>
    );
  }

  if (!store) {
    return (
      <>
        <SiteHeader>{logoutButton}</SiteHeader>
        <main className="container-narrow">
          <div className="empty">Profil toko tidak ditemukan.</div>
          <p style={{ marginTop: 16 }}>
            <a href="/dashboard-toko">Kembali ke dashboard</a>
          </p>
        </main>
      </>
    );
  }

  if (store.subscription_status !== 'active') {
    return (
      <>
        <SiteHeader>{logoutButton}</SiteHeader>
        <main className="container-narrow">
          <a className="back-link" href="/dashboard-toko">
            &larr; Kembali ke dashboard
          </a>
          <h1>Kelola produk</h1>
          <div className="alert alert-warn">
            Toko kamu belum aktif. Produk bisa dikelola setelah langganan diverifikasi.
          </div>
        </main>
      </>
    );
  }

  const currentImage = editing?.image_path ? productImage(editing.image_path, true) : null;

  // Harga yang benar-benar dibayar pembeli (promo kalau ada) untuk perhitungan estimasi
  const basePrice = Number(form.price);
  let effPrice = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 0;
  if (effPrice > 0 && form.promoMode === 'percent') {
    const pct = Number(form.promoValue);
    if (pct >= 1 && pct <= 90) effPrice = Math.round((effPrice * (100 - pct)) / 100);
  } else if (effPrice > 0 && form.promoMode === 'fixed') {
    const v = Number(form.promoValue);
    if (v > 0 && v < effPrice) effPrice = v;
  }
  const estimate = cfg.commissionOn && effPrice > 0
    ? storeNetEstimate(effPrice, cfg.commissionPercent)
    : null;

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">
          &larr; Kembali ke dashboard
        </a>
        <h1>Produk {store.name}</h1>

        <form className="panel" onSubmit={handleSubmit}>
          <h2>{editing ? 'Edit produk' : 'Tambah produk'}</h2>

          <div className="field">
            <label htmlFor="p-foto">Foto produk</label>
            {(preview || currentImage) && (
              <img className="upload-preview" src={preview || currentImage} alt="Pratinjau foto" />
            )}
            <input
              id="p-foto"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="hint muted small">
              Foto otomatis dikecilkan dan dikompres sebelum diunggah (sekitar 100 KB), jadi foto
              dari kamera HP boleh langsung dipakai.
            </span>
          </div>

          <div className="field">
            <label htmlFor="p-name">Nama produk</label>
            <input
              id="p-name"
              required
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="p-cat">Kategori</label>
            <select
              id="p-cat"
              value={form.categoryId}
              onChange={(e) => update('categoryId', e.target.value)}
            >
              <option value="">Tanpa kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="p-price">Harga normal (Rp)</label>
            <input
              id="p-price"
              required
              type="number"
              min="1"
              step="any"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
            />
            {estimate && (
              <div className="net-estimate">
                Komisi aplikasi {cfg.commissionPercent}%: {rupiah(estimate.commission)} per item.{' '}
                <strong>Estimasi diterima toko: {rupiah(estimate.net)}</strong>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="p-promo">Promo</label>
            <select
              id="p-promo"
              value={form.promoMode}
              onChange={(e) => update('promoMode', e.target.value)}
            >
              <option value="none">Tanpa promo</option>
              <option value="percent">Potongan persen</option>
              <option value="fixed">Harga promo</option>
            </select>
          </div>

          {form.promoMode !== 'none' && (
            <div className="row-2">
              <div className="field">
                <label htmlFor="p-promo-val">
                  {form.promoMode === 'percent' ? 'Potongan (%)' : 'Harga promo (Rp)'}
                </label>
                <input
                  id="p-promo-val"
                  required
                  type="number"
                  min="1"
                  step="any"
                  inputMode="numeric"
                  value={form.promoValue}
                  onChange={(e) => update('promoValue', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="p-promo-end">Berlaku sampai</label>
                <input
                  id="p-promo-end"
                  type="date"
                  value={form.promoEnds}
                  onChange={(e) => update('promoEnds', e.target.value)}
                />
                <span className="hint muted small">Kosongkan jika tanpa batas waktu.</span>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="p-stock">Stok</label>
            <input
              id="p-stock"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => update('stock', e.target.value)}
            />
            <span className="hint muted small">Kosongkan jika stok tidak dibatasi.</span>
          </div>

          <div className="field">
            <label htmlFor="p-desc">Deskripsi</label>
            <textarea
              id="p-desc"
              rows={3}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
            <span className="hint muted small">Opsional.</span>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {status && !error && <p className="muted small">{status}</p>}

          <div className="actions">
            <button className="btn btn-navy" type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Tambah produk'}
            </button>
            {editing && (
              <button className="btn btn-outline" type="button" onClick={resetForm} disabled={saving}>
                Batal
              </button>
            )}
          </div>
        </form>

        <h2>Daftar produk ({products.length})</h2>

        {products.length === 0 && (
          <div className="empty">
            Belum ada produk. Isi formulir di atas untuk menambahkan produk pertamamu.
          </div>
        )}

        {products.length > 0 && (
          <ul className="product-list">
            {products.map((p) => {
              const promo = activePromo(p);
              const thumbUrl = productImage(p.image_path, true);
              return (
                <li key={p.id} className={`product-row${p.is_available ? '' : ' is-hidden'}`}>
                  <div className="product-main">
                    {thumbUrl ? (
                      <img className="thumb" src={thumbUrl} alt="" />
                    ) : (
                      <span className="thumb" aria-hidden="true" />
                    )}
                    <div>
                      <span className="product-name">{p.name}</span>
                      {!p.is_available && <span className="muted small"> (disembunyikan)</span>}
                      <div className="muted small">
                        {p.categories?.name || 'Tanpa kategori'}
                        {p.stock != null ? ` · stok ${p.stock}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="price">
                    {rupiah(promo ? p.promo_price : p.price)}
                    {promo && <span className="price-old">{rupiah(p.price)}</span>}
                  </span>
                  {p.description && <p className="product-desc">{p.description}</p>}
                  <div className="product-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => startEdit(p)}>
                      Edit
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleAvailable(p)}>
                      {p.is_available ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                      Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
