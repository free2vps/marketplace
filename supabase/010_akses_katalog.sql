-- Akses katalog yang hilang. RLS tetap berlaku; tidak memberi akses ke pesanan,
-- pembayaran, lokasi kurir, atau ID akun gateway toko.
-- Memerlukan skema dasar serta migrasi 007 dan 008.
begin;
-- Kebijakan pemilik hanya untuk pengguna masuk, agar pembaca anonim tidak
-- membutuhkan hak baca kolom owner_id di subquery kebijakan tersebut.
alter policy products_owner_write on public.products to authenticated;
alter policy banners_owner_read on public.banners to authenticated;

grant select (id, category_id, store_id, name, description, price, promo_price,
  promo_ends_at, image_path, image_url, stock, is_available, locked, priority,
  sold_count, view_count, rating_avg, rating_count, created_at, updated_at)
  on public.products to anon, authenticated;
grant select (id, name, slug, logo_url, description, address, phone, is_boosted,
  is_open, verified_at, rating_avg, rating_count, subscription_status, visit_count,
  created_at, plan, premium_until, is_premium, flat_shipping_fee, delivery_mode_default)
  on public.stores to anon, authenticated;
grant select (owner_id) on public.stores to authenticated;
grant select on public.categories, public.search_terms, public.banner_slots to anon, authenticated;
grant select (id, store_id, slot, title, image_path, link_type, link_value,
  start_date, end_date, status, price, impressions, clicks, created_at)
  on public.banners to anon, authenticated;
grant select (key, value, is_public, description) on public.platform_settings to anon, authenticated;
grant select (id, product_id, reviewer_name, rating, comment, created_at)
  on public.product_reviews to anon, authenticated;
grant select (id, store_id, rating, comment, reviewer_name, created_at)
  on public.reviews to anon, authenticated;
commit;
