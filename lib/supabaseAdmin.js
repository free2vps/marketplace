// Klien Supabase dengan hak penuh (service role). HANYA untuk kode server
// (app/api/...). Jangan pernah mengimpornya dari halaman/komponen browser.
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
