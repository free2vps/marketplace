import { NextResponse } from 'next/server';
import { verifyNotification, parseNotification } from '../../../../../lib/payments/midtrans';
import { applyPaymentEvent } from '../../../../../lib/payments/apply';

export const dynamic = 'force-dynamic';

// Daftarkan alamat ini di dashboard Midtrans sebagai Payment Notification URL:
//   https://DOMAINMU/api/payments/webhook/midtrans
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!verifyNotification(body)) {
    return NextResponse.json({ error: 'tanda tangan tidak valid' }, { status: 401 });
  }
  const result = await applyPaymentEvent('midtrans', parseNotification(body), body);
  // Balas 200 agar gateway tidak mengulang terus untuk kasus yang memang tidak bisa diproses
  return NextResponse.json(result, { status: 200 });
}
