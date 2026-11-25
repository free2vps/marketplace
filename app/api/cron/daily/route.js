import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isAuthorizedCron } from '../../../../lib/cronAuth';

export const dynamic = 'force-dynamic';

// Perawatan harian: menurunkan toko yang Premium-nya habis, mengakhiri banner kedaluwarsa,
// dan menandai pesanan QRIS yang tidak dibayar. Dijadwalkan di vercel.json.
export async function GET(request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'tidak diizinkan' }, { status: 401 });
  const { data, error } = await supabaseAdmin().rpc('refresh_expired_plans');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
