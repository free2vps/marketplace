import { NextResponse } from 'next/server';
import { verifyCallback, parseCallback } from '../../../../../lib/payments/xendit';
import { applyPaymentEvent } from '../../../../../lib/payments/apply';

export const dynamic = 'force-dynamic';

// Daftarkan alamat ini di dashboard Xendit (Settings > Webhooks > Invoices paid/expired):
//   https://DOMAINMU/api/payments/webhook/xendit
// Isi "Callback verification token" di dashboard sama dengan XENDIT_CALLBACK_TOKEN.
export async function POST(request) {
  if (!verifyCallback(request.headers)) {
    return NextResponse.json({ error: 'token tidak valid' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const result = await applyPaymentEvent('xendit', parseCallback(body), body);
  return NextResponse.json(result, { status: 200 });
}
