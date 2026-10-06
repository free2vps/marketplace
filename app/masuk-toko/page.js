'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import SiteHeader from '../components/SiteHeader';

export default function MasukTokoPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (loginError) {
      setError(loginError.message);
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
          <h2>Kelola tokomu dari satu tempat</h2>
          <p>
            Masuk untuk melihat status toko dan mengatur produk yang tampil ke
            pembeli.
          </p>
        </aside>

        <main className="auth-main">
          <div className="auth-card">
            <h1>Masuk</h1>
            <p className="muted">Gunakan email dan kata sandi akun tokomu.</p>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Kata sandi</label>
                <input
                  id="password"
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <button className="btn btn-navy btn-block" type="submit" disabled={loading}>
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <p className="muted" style={{ marginTop: 20 }}>
              Belum punya akun? <a href="/daftar-toko">Daftarkan toko</a>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
