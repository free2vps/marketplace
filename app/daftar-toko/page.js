'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

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
        'Authentication > Providers > Email untuk tahap pengembangan ini.'
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
    <main style={{ maxWidth: 420, margin: '40px auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Daftar Toko</h1>
      <p>Buat akun untuk mulai jualan di Marketplace UMKM Taliwang.</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          required
          type="text"
          placeholder="Nama toko"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <input
          required
          type="tel"
          placeholder="Nomor HP/WhatsApp"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
        />
        <input
          type="text"
          placeholder="Alamat toko"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <input
          required
          type="password"
          placeholder="Password (min. 6 karakter)"
          minLength={6}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
        />

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Memproses...' : 'Daftar'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Sudah punya akun? <a href="/masuk-toko">Masuk di sini</a>
      </p>
    </main>
  );
}
