'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import SiteHeader from '../components/SiteHeader';

export default function DaftarTokoPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;

    if (!userId || !authData.session) {
      setError(
        'Akun dibuat, tapi sesi login belum aktif (biasanya karena konfirmasi ' +
          'email masih diwajibkan). Matikan "Confirm email" di Supabase > ' +
          'Authentication > Sign In / Providers > Email untuk tahap pengembangan ini.'
      );
      setLoading(false);
      return;
    }

    const slugBase = form.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const { error: storeError } = await supabase.from('stores').insert({
      owner_id: userId,
      name: form.name,
      slug: `${slugBase}-${userId.slice(0, 6)}`,
      phone: form.phone,
      address: form.address,
    });

    if (storeError) {
      setError(storeError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push('/dashboard-toko');
  }

  return (
    <>
      <SiteHeader />
      <div className="auth">
        <aside className="auth-aside">
          <h2>Buka tokomu di depan pembeli Taliwang</h2>
          <p>
            Daftar, aktifkan langganan, lalu atur sendiri produk dan harga
            tokomu.
          </p>
        </aside>

        <main className="auth-main">
          <div className="auth-card">
            <h1>Daftar toko</h1>
            <p className="muted">Isi data tokomu untuk membuat akun penjual.</p>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="name">Nama toko</label>
                <input
                  id="name"
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Nomor HP / WhatsApp</label>
                <input
                  id="phone"
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="address">Alamat toko</label>
                <input
                  id="address"
                  type="text"
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Kata sandi</label>
                <input
                  id="password"
                  required
                  type="password"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                />
                <span className="hint muted small">Minimal 6 karakter.</span>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <button className="btn btn-navy btn-block" type="submit" disabled={loading}>
                {loading ? 'Memproses...' : 'Daftar toko'}
              </button>
            </form>

            <p className="muted" style={{ marginTop: 20 }}>
              Sudah punya akun? <a href="/masuk-toko">Masuk</a>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
