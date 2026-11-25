import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isAuthorizedCron } from '../../../../lib/cronAuth';
import { renderMessage, toInternational, sendWhatsapp, senderEnabled } from '../../../../lib/notify';

export const dynamic = 'force-dynamic';

// Mengirim antrean notifikasi WhatsApp (maksimal 20 per panggilan, 3 kali percobaan).
// Panggil tiap menit dari penjadwal luar (mis. cron-job.org) karena cron gratis Vercel hanya harian.
export async function GET(request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'tidak diizinkan' }, { status: 401 });
  if (!senderEnabled()) return NextResponse.json({ ok: true, skipped: 'NOTIFY_WEBHOOK_URL belum diisi' });

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('notification_outbox')
    .select('id, to_phone, template, payload, attempts')
    .eq('status', 'pending')
    .order('id')
    .limit(20);

  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    const message = renderMessage(row.template, row.payload);
    const to = toInternational(row.to_phone);
    try {
      if (!message || !to) throw new Error('Isi pesan atau nomor tidak valid');
      await sendWhatsapp(to, message);
      await db.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('id', row.id);
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      await db.from('notification_outbox')
        .update({ attempts, last_error: String(err.message).slice(0, 300), status: attempts >= 3 ? 'failed' : 'pending' })
        .eq('id', row.id);
      failed += 1;
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
