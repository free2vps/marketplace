import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { activeProvider, createQris } from '../../../../lib/payments';

export const dynamic = 'force-dynamic';

// Membuat kode QRIS untuk pesanan. Body: { orderCode, phone }
// Tidak bisa dipakai sebelum: fitur 'feature.online_payment' dihidupkan DAN kunci gateway diisi.
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
      .select('id, order_code, buyer_name, buyer_phone, total_amount, payment_method, payment_status, status')
      .eq('order_code', String(orderCode || ''))
      .eq('buyer_phone', String(phone || ''))
      .maybeSingle();

    if (!order || order.payment_method !== 'qris' || order.payment_status !== 'unpaid'
        || ['dibatalkan', 'selesai'].includes(order.status)) {
      return NextResponse.json({ error: 'Pesanan tidak bisa dibayar' }, { status: 400 });
    }

    // Pakai kode yang masih berlaku kalau sudah pernah dibuat
    const { data: existing } = await db
      .from('payments')
      .select('qr_string, qr_url, expires_at, amount')
      .eq('order_id', order.id).eq('provider', provider).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
      return NextResponse.json({
        qrString: existing.qr_string, qrUrl: existing.qr_url,
        expiresAt: existing.expires_at, amount: existing.amount,
      });
    }

    const { data: items } = await db
      .from('order_items').select('product_name, price, quantity').eq('order_id', order.id);

    const qr = await createQris(provider, {
      orderCode: order.order_code,
      amount: Number(order.total_amount),
      customerName: order.buyer_name,
      customerPhone: order.buyer_phone,
      items: [
        ...(items || []).map((i) => ({ name: i.product_name, price: Number(i.price), quantity: i.quantity })),
      ],
    });

    await db.from('payments').insert({
      order_id: order.id, provider, provider_ref: qr.providerRef, method: 'qris',
      amount: order.total_amount, qr_string: qr.qrString, qr_url: qr.qrUrl,
      expires_at: qr.expiresAt ? qr.expiresAt.toISOString() : null, raw_payload: qr.raw,
    });

    return NextResponse.json({
      qrString: qr.qrString, qrUrl: qr.qrUrl,
      expiresAt: qr.expiresAt, amount: Number(order.total_amount),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal membuat pembayaran' }, { status: 500 });
  }
}
