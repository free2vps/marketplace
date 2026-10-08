import { NextResponse } from 'next/server';
import { verifyCallback, parseCallback } from '../../../../../lib/payments/tripay';
import { applyPaymentEvent } from '../../../../../lib/payments/apply';

export const dynamic = 'force-dynamic';

// Daftarkan alamat ini di dashboard TriPay sebagai URL Callback:
//   https://DOMAINMU/api/payments/webhook/tripay
export async function POST(request) {
  const raw = await request.text(); // tanda tangan dihitung dari isi mentah
  if (!verifyCallback(raw, request.headers.get('x-callback-signature'))) {
    return NextResponse.json({ success: false, message: 'tanda tangan tidak valid' }, { status: 401 });
  }
  if (request.headers.get('x-callback-event') !== 'payment_status') {
    return NextResponse.json({ success: true }); // event lain diabaikan
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
  const result = await applyPaymentEvent('tripay', parseCallback(body), body);
  // TriPay hanya perlu {success: true}; detail kegagalan kita simpan di sisi sendiri
  return NextResponse.json({ success: true, detail: result.reason || 'ok' });
}
