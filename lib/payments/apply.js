import { supabaseAdmin } from '../supabaseAdmin';

// Menerapkan kabar pembayaran dari gateway. Aman dipanggil berulang (idempoten).
export async function applyPaymentEvent(provider, ev, rawPayload) {
  const db = supabaseAdmin();

  const { data: order } = await db
    .from('orders')
    .select('id, total_amount, payment_method, payment_status')
    .eq('order_code', ev.orderCode)
    .maybeSingle();

  if (!order || order.payment_method !== 'qris') return { ok: false, reason: 'pesanan_tidak_ditemukan' };

  // Jumlah harus sama persis dengan tagihan, supaya tidak bisa lunas dengan nominal lain
  if (ev.status === 'paid' && Math.round(ev.amount) !== Math.round(Number(order.total_amount))) {
    return { ok: false, reason: 'jumlah_tidak_cocok' };
  }

  await db
    .from('payments')
    .update({
      status: ev.status,
      fee_amount: ev.fee || 0,
      paid_at: ev.status === 'paid' ? (ev.paidAt || new Date()).toISOString() : null,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', order.id)
    .eq('provider', provider);

  if (ev.status === 'paid' && order.payment_status === 'unpaid') {
    await db.from('orders').update({ payment_status: 'paid' }).eq('id', order.id);
  } else if ((ev.status === 'expired' || ev.status === 'failed') && order.payment_status === 'unpaid') {
    await db.from('orders').update({ payment_status: 'expired' }).eq('id', order.id);
  }
  return { ok: true };
}
