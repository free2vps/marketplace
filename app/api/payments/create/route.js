import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { activeProvider, createPayment } from '../../../../lib/payments';
import { createSplitRule } from '../../../../lib/payments/xendit';

export const dynamic = 'force-dynamic';

// Membuat tagihan online untuk pesanan. Body: { orderCode, phone }
// Tidak bisa dipakai sebelum: saklar 'feature.online_payment' hidup DAN kunci gateway diisi.
export async function POST(request) {
  try {
    const { orderCode, phone } = await request.json();
    const db = supabaseAdmin();

    const { data: flag } = await db
      .from('platform_settings').select('value').eq('key', 'feature.online_payment').maybeSingle();
    const provider = activeProvider();
    if (flag?.value !== true || !provider) {
      return NextResponse.json({ error: 'Pembayaran online belum tersedia' }, { status: 503 });
    }

    const { data: order } = await db
      .from('orders')
      .select('id, order_code, buyer_name, buyer_phone, total_amount, payment_method, payment_status, status, delivery_mode, shipping_fee, shipping_discount, commission_amount, service_fee, stores(name, xendit_account_id)')
      .eq('order_code', String(orderCode || ''))
      .eq('buyer_phone', String(phone || ''))
      .maybeSingle();

    if (!order || order.payment_method !== 'qris' || order.payment_status !== 'unpaid'
        || ['dibatalkan', 'selesai'].includes(order.status)) {
      return NextResponse.json({ error: 'Pesanan tidak bisa dibayar' }, { status: 400 });
    }

    // Pakai tagihan yang masih berlaku kalau sudah pernah dibuat
    const { data: existing } = await db
      .from('payments')
      .select('qr_string, qr_url, pay_url, expires_at, amount')
      .eq('order_id', order.id).eq('provider', provider).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
      return NextResponse.json({
        qrString: existing.qr_string, qrUrl: existing.qr_url, payUrl: existing.pay_url,
        expiresAt: existing.expires_at, amount: existing.amount,
      });
    }

    // Mode split (Xendit): tagihan dibuat atas nama sub-akun toko, dan bagian platform
    // (komisi + biaya layanan, minus subsidi ongkir) dialirkan ke akun induk lewat aturan pembagian.
    let storeAccountId = null;
    let splitRuleId = null;
    if (provider === 'xendit') {
      const { data: mode } = await db
        .from('platform_settings').select('value').eq('key', 'payments.mode').maybeSingle();
      if (mode?.value === 'split') {
        storeAccountId = order.stores?.xendit_account_id || null;
        if (!storeAccountId) {
          return NextResponse.json({ error: 'Toko ini belum terhubung ke pembayaran online' }, { status: 400 });
        }
        if (!process.env.XENDIT_MASTER_ACCOUNT_ID) {
          return NextResponse.json({ error: 'Akun induk Xendit belum diatur' }, { status: 503 });
        }
        // Ongkir kurir ikut ke akun induk agar bisa dibayarkan ke kurir (lihat PETA-FASE.md)
        const platformAmount = Math.max(
          0,
          Number(order.commission_amount) + Number(order.service_fee) - Number(order.shipping_discount)
            + (order.delivery_mode === 'courier_pool' ? Number(order.shipping_fee) : 0)
        );
        if (platformAmount > 0) {
          splitRuleId = await createSplitRule({
            orderCode: order.order_code,
            masterAccountId: process.env.XENDIT_MASTER_ACCOUNT_ID,
            amount: platformAmount,
          });
        }
      }
    }

    const { data: items } = await db
      .from('order_items').select('product_name, price, quantity').eq('order_id', order.id);
    const origin = new URL(request.url).origin;

    const pay = await createPayment(provider, {
      orderCode: order.order_code,
      amount: Number(order.total_amount),
      customerName: order.buyer_name,
      customerPhone: order.buyer_phone,
      description: `Pesanan #${order.order_code} di ${order.stores?.name || 'UMKM Taliwang'}`,
      items: (items || []).map((i) => ({ name: i.product_name, price: Number(i.price), quantity: i.quantity })),
      storeAccountId,
      splitRuleId,
      successUrl: `${origin}/pesanan/${order.order_code}`,
      failureUrl: `${origin}/pesanan/${order.order_code}`,
    });

    await db.from('payments').insert({
      order_id: order.id, provider, provider_ref: pay.providerRef, method: 'qris',
      amount: order.total_amount, qr_string: pay.qrString || null, qr_url: pay.qrUrl || null,
      pay_url: pay.payUrl || null,
      expires_at: pay.expiresAt ? pay.expiresAt.toISOString() : null, raw_payload: pay.raw,
    });

    return NextResponse.json({
      qrString: pay.qrString || null, qrUrl: pay.qrUrl || null, payUrl: pay.payUrl || null,
      expiresAt: pay.expiresAt, amount: Number(order.total_amount),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membuat pembayaran' }, { status: 500 });
  }
}
