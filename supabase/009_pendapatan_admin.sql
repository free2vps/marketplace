-- ============================================================
-- 009: Pendapatan platform di panel admin
-- Menambahkan metrik uang ke admin_summary: pemasukan Premium,
-- pemasukan banner, GMV, dan potensi komisi + biaya layanan.
-- Jalankan SEKALI di Supabase > SQL Editor (setelah 008).
-- ============================================================

create or replace function admin_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pending numeric;
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;

  -- Pembayaran manual yang menunggu: total uang yang belum kamu setujui
  select coalesce(sum(amount), 0) into v_pending
  from manual_payments where status = 'pending';

  return jsonb_build_object(
    -- Operasional (sama seperti sebelumnya)
    'stores_total',      (select count(*) from stores),
    'stores_live',       (select count(*) from stores where subscription_status = 'active'),
    'stores_premium',    (select count(*) from stores where premium_until > now()),
    'products_total',    (select count(*) from products),
    'pending_payments',  (select count(*) from manual_payments where status = 'pending'),
    'banners_live',      (select count(*) from banners where status = 'approved'
                          and start_date <= today_wita() and end_date >= today_wita()),
    'orders_total',      (select count(*) from orders),

    -- Uang: pemasukan yang SUDAH diterima (disetujui admin)
    'income_premium',    (select coalesce(sum(amount), 0) from manual_payments
                          where kind = 'premium' and status = 'approved'),
    'income_banner',     (select coalesce(sum(amount), 0) from manual_payments
                          where kind = 'banner' and status = 'approved'),
    'income_pending',    v_pending,

    -- Uang: nilai transaksi yang terjadi (GMV) dan potensi bagian platform
    -- GMV = pesanan selesai: QRIS lunas atau COD (diasumsikan tertagih).
    'gmv_total',         (select coalesce(sum(total_amount), 0) from orders
                          where status = 'selesai'
                            and (payment_method = 'cod' or payment_status = 'paid')),
    'gmv_30d',           (select coalesce(sum(total_amount), 0) from orders
                          where created_at > now() - interval '30 days'
                            and status = 'selesai'
                            and (payment_method = 'cod' or payment_status = 'paid')),
    -- Potensi komisi + biaya layanan dari pesanan 30 hari terakhir
    -- (baru benar-benar masuk saat feature.commission hidup dan pesanan selesai)
    'fees_30d',          (select coalesce(sum(coalesce(commission_amount, 0) + coalesce(service_fee, 0)), 0) from orders
                          where created_at > now() - interval '30 days'
                            and status = 'selesai'
                            and (payment_method = 'cod' or payment_status = 'paid'))
  );
end;
$$;

grant execute on function admin_summary() to authenticated;
