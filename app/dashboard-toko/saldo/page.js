'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { rupiah } from '../../../lib/media';
import { loadSettings } from '../../../lib/settings';
import SiteHeader from '../../components/SiteHeader';

const REASON = {
  sale: 'Penjualan',
  commission: 'Komisi aplikasi',
  shipping: 'Ongkos kirim',
  service_fee: 'Biaya layanan',
  gateway_fee: 'Biaya pembayaran',
  cod_collected: 'Uang tunai diterima',
  payout: 'Pencairan dana',
  payout_reversal: 'Pencairan dibatalkan',
  adjustment: 'Penyesuaian',
};
const PAYOUT_STATUS = { pending: 'Menunggu diproses', paid: 'Sudah ditransfer', rejected: 'Ditolak' };
const dateId = (iso) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SaldoPage() {
  const router = useRouter();
  const [store, setStore] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [bank, setBank] = useState({ bank_name: '', account_number: '', account_holder: '' });
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadWallet = useCallback(async (storeId) => {
    const [bal, led, pay, bk] = await Promise.all([
      supabase.rpc('wallet_balance', { p_type: 'store', p_id: storeId }),
      supabase
        .from('ledger_entries')
        .select('id, reason, amount, created_at')
        .eq('account_type', 'store')
        .eq('account_id', storeId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('payout_requests')
        .select('id, amount, status, admin_note, requested_at')
        .eq('account_type', 'store')
        .eq('account_id', storeId)
        .order('requested_at', { ascending: false })
        .limit(10),
      supabase
        .from('store_bank_accounts')
        .select('bank_name, account_number, account_holder')
        .eq('store_id', storeId)
        .maybeSingle(),
    ]);
    setBalance(Number(bal.data || 0));
    setEntries(led.data || []);
    setPayouts(pay.data || []);
    if (bk.data) setBank(bk.data);
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
      const { data: s } = await supabase
        .from('stores')
        .select('id, name')
        .eq('owner_id', user.id)
        .single();
      setStore(s);
      const settings = await loadSettings(supabase);
      setCfg(settings);
      if (s && settings.walletOn) await loadWallet(s.id);
      setLoading(false);
    }
    init();
  }, [router, loadWallet]);

  async function saveBank(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.from('store_bank_accounts').upsert({
      store_id: store.id,
      bank_name: bank.bank_name.trim(),
      account_number: bank.account_number.trim(),
      account_holder: bank.account_holder.trim(),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice('Rekening tersimpan.');
  }

  async function requestPayout(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.rpc('request_payout', {
      p_account_type: 'store',
      p_account_id: store.id,
      p_amount: Number(amount),
      p_bank_name: bank.bank_name,
      p_account_number: bank.account_number,
      p_account_holder: bank.account_holder,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAmount('');
    setNotice('Pengajuan pencairan terkirim. Dana ditransfer manual oleh admin.');
    await loadWallet(store.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/masuk-toko');
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

  return (
    <>
      <SiteHeader>{logoutButton}</SiteHeader>
      <main className="container-narrow">
        <a className="back-link" href="/dashboard-toko">
          &larr; Kembali ke dashboard
        </a>
        <h1>Saldo &amp; pencairan</h1>

        {!cfg?.walletOn && (
          <div className="alert alert-warn">
            Fitur saldo belum diaktifkan. Setelah pembayaran online dan pembukuan dibuka, hasil
            penjualan tokomu akan tercatat di sini dan bisa dicairkan ke rekeningmu.
          </div>
        )}

        {cfg?.walletOn && store && (
          <>
            <section className="panel">
              <div className="muted small">Saldo yang bisa dicairkan</div>
              <div className="wallet-balance">{rupiah(balance)}</div>
              {balance < 0 && (
                <p className="muted small">
                  Saldo negatif berarti tokomu memegang uang tunai yang sebagian menjadi hak aplikasi
                  (komisi dan biaya layanan). Akan terkurangi otomatis dari penjualan berikutnya.
                </p>
              )}
            </section>

            {error && <div className="alert alert-error">{error}</div>}
            {notice && <div className="alert alert-warn">{notice}</div>}

            <form className="panel" onSubmit={saveBank}>
              <h2>Rekening pencairan</h2>
              <div className="field">
                <label htmlFor="b-bank">Nama bank / e-wallet</label>
                <input id="b-bank" required value={bank.bank_name}
                  onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="b-num">Nomor rekening</label>
                <input id="b-num" required inputMode="numeric" value={bank.account_number}
                  onChange={(e) => setBank({ ...bank, account_number: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="b-name">Nama pemilik rekening</label>
                <input id="b-name" required value={bank.account_holder}
                  onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} />
              </div>
              <button className="btn btn-navy" type="submit" disabled={busy}>
                Simpan rekening
              </button>
            </form>

            <form className="panel" onSubmit={requestPayout}>
              <h2>Ajukan pencairan</h2>
              <div className="field">
                <label htmlFor="p-amt">Jumlah (Rp)</label>
                <input id="p-amt" required type="number" min={cfg.payoutMin} step="1" inputMode="numeric"
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="hint muted small">Minimal {rupiah(cfg.payoutMin)}.</span>
              </div>
              <button className="btn btn-gold" type="submit"
                disabled={busy || !bank.account_number || balance < cfg.payoutMin}>
                Ajukan pencairan
              </button>
            </form>

            {payouts.length > 0 && (
              <>
                <h2>Pengajuan terakhir</h2>
                <ul className="product-list" style={{ marginBottom: 24 }}>
                  {payouts.map((p) => (
                    <li key={p.id} className="product-row">
                      <span>
                        {dateId(p.requested_at)} · <strong>{PAYOUT_STATUS[p.status]}</strong>
                        {p.admin_note && <span className="muted small"> ({p.admin_note})</span>}
                      </span>
                      <span className="price">{rupiah(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h2>Riwayat saldo</h2>
            {entries.length === 0 ? (
              <div className="empty">Belum ada transaksi.</div>
            ) : (
              <ul className="product-list">
                {entries.map((en) => (
                  <li key={en.id} className="product-row">
                    <span>
                      {REASON[en.reason] || en.reason}
                      <span className="muted small"> · {dateId(en.created_at)}</span>
                    </span>
                    <span className={Number(en.amount) >= 0 ? 'amount-in' : 'amount-out'}>
                      {Number(en.amount) >= 0 ? '+' : '−'}
                      {rupiah(Math.abs(Number(en.amount)))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
