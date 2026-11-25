-- Operasi paket dan produk untuk pengguna masuk. RLS pemilik/admin tetap berlaku.
begin;
grant select (id, kind, store_id, banner_id, months, amount, proof_path, status, admin_note, created_at)
  on public.manual_payments to authenticated;
grant delete on public.products to authenticated;
grant update (value, updated_at) on public.platform_settings to authenticated;
commit;
