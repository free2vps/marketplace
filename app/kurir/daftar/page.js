'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { compressImage } from '../../../lib/image';
import { loadSettings } from '../../../lib/settings';
import SiteHeader from '../../components/SiteHeader';

const DOCS = [
  { key: 'ktp', label: 'Foto KTP', required: true },
  { key: 'sim', label: 'Foto SIM', required: true },
  { key: 'stnk', label: 'Foto STNK kendaraan', required: true },
];

export default function DaftarKurirPage() {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '',
    emergencyName: '', emergencyPhone: '', emergencyRelation: '', consent: false,
  });
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings(supabase).then((s) => setOpen(s.courierOn));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError('Kamu perlu menyetujui penggunaan datamu untuk verifikasi.');
      return;
    }
    if (DOCS.some((d) => !files[d.key])) {
      setError('Lengkapi foto KTP, SIM, dan STNK.');
      return;
    }
    setLoading(true);

    const { data: auth, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });
    if (authError || !auth.user || !auth.session) {
      setError(
        authError?.message ||
          'Akun dibuat tapi sesi belum aktif (konfirmasi email masih diwajibkan di Supabase).'
      );
      setLoading(false);
      return;
    }
    const uid = auth.user.id;

    const { error: cErr } = await supabase
      .from('couriers')
      .insert({ id: uid, name: form.name.trim(), phone: form.phone.trim() });
    if (cErr) {
      setError(cErr.message);
      setLoading(false);
      return;
    }

    try {
      const paths = {};
      for (const d of DOCS) {
        const { blob, ext } = await compressImage(files[d.key], {
          maxSide: 1600,
          targetBytes: 400 * 1024,
          limitBytes: 900 * 1024,
        });
        const path = `${uid}/${d.key}.${ext}`;
        const up = await supabase.storage.from('kyc').upload(path, blob, { contentType: blob.type });
        if (up.error) throw up.error;
        paths[d.key] = path;
      }
      const { error: kErr } = await supabase.from('courier_kyc').insert({
        courier_id: uid,
        ktp_path: paths.ktp,
        sim_path: paths.sim,
        stnk_path: paths.stnk,
        emergency_name: form.emergencyName.trim(),
        emergency_phone: form.emergencyPhone.trim(),
        emergency_relation: form.emergencyRelation.trim(),
        consent_at: new Date().toISOString(),
      });
      if (kErr) throw kErr;
    } catch (err) {
      setError(err.message || 'Dokumen gagal diunggah.');
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push('/kurir');
  }

  return (
    <>
      <SiteHeader />
      <main className="container-narrow">
        <h1>Daftar sebagai kurir</h1>

        {open === false && (
          <div className="alert alert-warn">Pendaftaran kurir belum dibuka. Silakan kembali lagi nanti.</div>
        )}

        {open && (
          <form className="panel" onSubmit={handleSubmit}>
            <p className="muted">
              Datamu dipakai hanya untuk verifikasi oleh admin dan disimpan terpisah, tidak tampil
              ke publik.
            </p>

            <div className="field">
              <label htmlFor="k-name">Nama lengkap</label>
              <input id="k-name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-phone">Nomor HP / WhatsApp</label>
              <input id="k-phone" required type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-email">Email</label>
              <input id="k-email" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-pass">Kata sandi</label>
              <input id="k-pass" required type="password" minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} />
            </div>

            <h2>Dokumen</h2>
            {DOCS.map((d) => (
              <div className="field" key={d.key}>
                <label htmlFor={`k-${d.key}`}>{d.label}</label>
                <input id={`k-${d.key}`} type="file" accept="image/*" required
                  onChange={(e) => setFiles((f) => ({ ...f, [d.key]: e.target.files?.[0] || null }))} />
              </div>
            ))}

            <h2>Kontak darurat (keluarga di Taliwang)</h2>
            <div className="field">
              <label htmlFor="k-en">Nama</label>
              <input id="k-en" required value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-ep">Nomor HP</label>
              <input id="k-ep" required type="tel" value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k-er">Hubungan</label>
              <input id="k-er" required placeholder="mis. ibu, kakak" value={form.emergencyRelation} onChange={(e) => set('emergencyRelation', e.target.value)} />
            </div>

            <label className="check">
              <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>Saya setuju datanya dipakai untuk verifikasi pendaftaran kurir.</span>
            </label>

            {error && <div className="alert alert-error">{error}</div>}

            <button className="btn btn-navy btn-block" type="submit" disabled={loading}>
              {loading ? 'Mengirim...' : 'Kirim pendaftaran'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
