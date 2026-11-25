'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabase';
import { rupiah } from '../../../../../lib/media';
import SiteHeader from '../../../../components/SiteHeader';

// Label pengiriman siap cetak (fitur Premium). Ukuran kertas bebas; dirancang untuk setengah A5.
export default function LabelPage() {
  const router = useRouter();
  const { id } = useParams();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/masuk-toko');
        return;
      }
      const { data: store } = await supabase
        .from('stores')
        .select('id, name, phone, address, premium_until')
        .eq('owner_id', user.id)
        .single();
      const premium = Boolean(store?.premium_until && new Date(store.premium_until) > new Date());
      if (!store || !premium) {
        setState({ loading: false, locked: true });
        return;
      }
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_code, status, payment_method, payment_status, buyer_name, buyer_phone, delivery_address, notes, total_amount, created_at, order_items(product_name, quantity)')
        .eq('id', id)
        .eq('store_id', store.id)
        .maybeSingle();
      setState({ loading: false, store, order, error: error?.message });
    }
    init();
  }, [id, router]);

  const { loading, locked, store, order, error } = state;

  return (
    <>
      <SiteHeader />
      <main className="container-narrow">
        <div className="no-print">
          <a className="back-link" href="/dashboard-toko/pesanan">&larr; Kembali ke pesanan</a>
          <h1>Label pengiriman</h1>
        </div>
        {loading && <p>Memuat...</p>}
        {locked && (
          <div className="alert alert-warn no-print">
            Cetak label adalah fitur Premium. <a href="/dashboard-toko/paket">Lihat paket Premium</a>
          </div>
        )}
        {error && <div className="alert alert-error no-print">{error}</div>}
        {!loading && !locked && !order && !error && <div className="empty no-print">Pesanan tidak ditemukan.</div>}

        {order && (
          <>
            <div className="no-print" style={{ marginBottom: 16 }}>
              <button className="btn btn-gold" onClick={() => window.print()}>Cetak label</button>
            </div>
            <section className="label-sheet">
              <div className="label-head">
                <strong>#{order.order_code}</strong>
                <span>{new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="label-block">
                <div className="label-cap">Penerima</div>
                <div className="label-big">{order.buyer_name}</div>
                <div>{order.buyer_phone}</div>
                <div>{order.delivery_address}</div>
                {order.notes && <div className="label-note">Catatan: {order.notes}</div>}
              </div>
              <div className="label-block">
                <div className="label-cap">Pengirim</div>
                <div><strong>{store.name}</strong></div>
                <div>{store.phone}</div>
                {store.address && <div>{store.address}</div>}
              </div>
              <div className="label-block">
                <div className="label-cap">Isi paket</div>
                <ul>
                  {order.order_items.map((it, i) => (<li key={i}>{it.quantity} × {it.product_name}</li>))}
                </ul>
              </div>
              <div className="label-pay">
                {order.payment_method === 'cod' ? (
                  <>TAGIH TUNAI <strong>{rupiah(order.total_amount)}</strong></>
                ) : order.payment_status === 'paid' ? (
                  <>SUDAH DIBAYAR (QRIS)</>
                ) : (
                  <>MENUNGGU PEMBAYARAN QRIS</>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
