'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { rupiah } from '../../lib/media';
import { loadSettings } from '../../lib/settings';
import SiteHeader from '../components/SiteHeader';

const CLAIM_MSG = {
  ok: 'Pesanan berhasil diambil.',
  fitur_nonaktif: 'Fitur kurir belum diaktifkan.',
  kurir_belum_terverifikasi: 'Akunmu belum terverifikasi.',
  pesanan_tidak_tersedia: 'Pesanan sudah diambil kurir lain.',
  belum_dibayar: 'Pesanan belum dibayar.',
  melebihi_batas_deposit: 'Nilai pesanan melebihi batas depositmu. Tambah deposit ke admin.',
};
const OTP_MSG = {
  ok: 'Pesanan selesai. Terima kasih!',
  salah: 'Kode salah. Minta pembeli membaca ulang kodenya.',
  terkunci: 'Terlalu banyak salah. Hubungi admin untuk membuka kunci.',
  status_salah: 'Pesanan belum dalam status diantar.',
  tidak_ditemukan: 'Pesanan tidak ditemukan.',
};

export default function KurirPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState(null);
  const [me, setMe] = useState(null);
  const [limit, setLimit] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [mine, setMine] = useState([]);
  const [codes, setCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const reload = useCallback(async (uid) => {
    const [lim, dep, earn, open, active] = await Promise.all([
      supabase.rpc('courier_available_limit', { p_courier: uid }),
      supabase.rpc('wallet_balance', { p_type: 'courier_deposit', p_id: uid }),
      supabase.rpc('wallet_balance', { p_type: 'courier', p_id: uid }),
      supabase.rpc('list_open_jobs'),
      // Kolom disebut satu per satu: kode serah-terima memang tidak boleh terbaca kurir
      supabase
        .from('orders')
        .select('id, order_code, buyer_name, buyer_phone, delivery_address, status, subtotal, service_fee, payment_method')
        .eq('courier_id', uid)
        .in('status', ['diambil_kurir', 'diantar'])
        .order('created_at'),
    ]);
    setLimit(Number(lim.data || 0));
    setDeposit(Number(dep.data || 0));
    setEarnings(Number(earn.data || 0));
    setJobs(open.data || []);
    setMine(active.data || []);
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
      setCfg(await loadSettings(supabase));
      const { data: c } = await supabase
        .from('couriers')
        .select('id, name, verification_status, is_active')
        .eq('id', user.id)
        .maybeSingle();
      setMe(c);
      if (c?.verification_status === 'verified') await reload(user.id);
      setLoading(false);
    }
    init();
  }, [router, reload]);

  async function act(promise, messages) {
    setMessage(null);
    const { data, error } = await promise;
    setMessage(error ? error.message : messages?.[data] || null);
    await reload(me.id);
  }

  const claim = (id) => act(supabase.rpc('claim_order', { p_order_id: id }), CLAIM_MSG);
  const start = (id) => act(supabase.rpc('start_delivery', { p_order_id: id }), { true: 'Selamat mengantar.' });
  const confirm = (id) =>
    act(supabase.rpc('confirm_handover', { p_order_id: id, p_otp: (codes[id] || '').trim() }), OTP_MSG);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
  }

  const header = (
    <button className="btn btn-ghost btn-sm" onClick={logout}>
      Keluar
    </button>
  );

  if (loading) {
    return (
      <>
        <SiteHeader>{header}</SiteHeader>
        <main className="container-narrow">Memuat...</main>
      </>
    );
  }

  if (!me) {
    return (
      <>
        <SiteHeader>{header}</SiteHeader>
        <main className="container-narrow">
          <h1>Kurir</h1>
          <div className="empty">
            Akun ini belum terdaftar sebagai kurir. <a href="/kurir/daftar">Daftar sebagai kurir</a>
          </div>
        </main>
      </>
    );
  }

  if (me.verification_status !== 'verified') {
    return (
      <>
        <SiteHeader>{header}</SiteHeader>
        <main className="container-narrow">
          <h1>Halo, {me.name}</h1>
          <div className="alert alert-warn">
            {me.verification_status === 'rejected'
              ? 'Pendaftaranmu ditolak. Hubungi admin untuk informasi lebih lanjut.'
              : 'Pendaftaranmu sedang diperiksa admin. Kamu akan bisa mengambil pesanan setelah terverifikasi.'}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader>{header}</SiteHeader>
      <main className="container-narrow">
        <h1>Halo, {me.name}</h1>

        {!cfg?.courierOn && (
          <div className="alert alert-warn">Fitur kurir sedang dinonaktifkan sementara.</div>
        )}
        {message && <div className="alert alert-warn">{message}</div>}

        <section className="panel">
          <dl className="dl">
            <dt>Deposit</dt>
            <dd>{rupiah(deposit)}</dd>
            <dt>Batas ambil COD</dt>
            <dd>
              <strong>{rupiah(limit)}</strong>
              <div className="muted small">Pesanan tunai hanya bisa diambil jika nilainya tidak melebihi batas ini.</div>
            </dd>
            <dt>Pendapatan</dt>
            <dd>{rupiah(earnings)}</dd>
          </dl>
        </section>

        <h2>Sedang dikerjakan ({mine.length})</h2>
        {mine.length === 0 && <div className="empty">Belum ada pesanan yang kamu ambil.</div>}
        <ul className="product-list" style={{ marginBottom: 28 }}>
          {mine.map((o) => (
            <li key={o.id} className="product-row">
              <div>
                <strong>#{o.order_code}</strong> · {o.buyer_name}
                <div className="muted small">{o.delivery_address}</div>
                <div className="muted small">{o.buyer_phone}</div>
              </div>
              <span className="price">
                {rupiah(Number(o.subtotal) + Number(o.service_fee))}
                <div className="muted small">{o.payment_method === 'cod' ? 'Tunai' : 'Sudah dibayar'}</div>
              </span>
              <div className="product-actions">
                {o.status === 'diambil_kurir' ? (
                  <button className="btn btn-navy btn-sm" onClick={() => start(o.id)}>
                    Mulai antar
                  </button>
                ) : (
                  <>
                    <input
                      className="code-input"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Kode"
                      value={codes[o.id] || ''}
                      onChange={(e) => setCodes((c) => ({ ...c, [o.id]: e.target.value }))}
                      aria-label="Kode dari pembeli"
                    />
                    <button className="btn btn-gold btn-sm" onClick={() => confirm(o.id)}>
                      Selesaikan
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <h2>Pesanan tersedia ({jobs.length})</h2>
        {jobs.length === 0 && <div className="empty">Belum ada pesanan baru.</div>}
        <ul className="product-list">
          {jobs.map((j) => (
            <li key={j.order_id} className="product-row">
              <div>
                <strong>{j.store_name}</strong>
                <div className="muted small">{j.store_address}</div>
                <div className="muted small">Tujuan: {j.area_hint}…</div>
              </div>
              <span className="price">
                {rupiah(j.goods_total)}
                <div className="muted small">{j.payment_method === 'cod' ? 'Tunai' : 'Sudah dibayar'}</div>
              </span>
              <div className="product-actions">
                <button className="btn btn-gold btn-sm" onClick={() => claim(j.order_id)}>
                  Ambil pesanan
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
