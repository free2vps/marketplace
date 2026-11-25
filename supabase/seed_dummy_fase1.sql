-- ============================================================
-- DATA CONTOH FASE 1: toko Premium, banner tayang, statistik pengunjung
-- Prasyarat: 007 dan seed_dummy.sql sudah dijalankan. Aman dijalankan ulang.
-- Dihapus bersama toko dummy oleh hapus_dummy.sql (cascade).
-- Foto banner memakai placeholder (placehold.co).
-- ============================================================
begin;

-- Dua toko dummy menjadi Premium (lencana + prioritas + statistik)
update stores
set premium_until = now() + interval '60 days', verified_at = coalesce(verified_at, now())
where slug in ('dapur-ayam-taliwang-bu-ratna', 'madu-susu-sumbawa-berkah');
select sync_store_plan(id) from stores;

-- Banner yang sedang tayang
insert into banners (id, store_id, slot, title, image_path, link_type, link_value, start_date, end_date, status, price, impressions, clicks)
values
  ('402ce059-6930-5052-a1c1-3a5c86517e01', (select id from stores where slug = 'dapur-ayam-taliwang-bu-ratna'), 'home_top', 'Ayam Taliwang bakar, selalu hangat', 'https://placehold.co/1200x400/17274a/e3cb8e.png?text=Ayam+Taliwang+bakar%2C+selalu+hangat', 'store', 'dapur-ayam-taliwang-bu-ratna', today_wita() - 1, today_wita() + 29, 'approved', 0, 120, 6),
  ('d43d30c5-19fd-5806-85ec-d5e0baf7c93d', (select id from stores where slug = 'madu-susu-sumbawa-berkah'), 'home_top', 'Madu dan susu kuda liar Sumbawa', 'https://placehold.co/1200x400/b8923a/0a1428.png?text=Madu+dan+susu+kuda+liar+Sumbawa', 'store', 'madu-susu-sumbawa-berkah', today_wita() - 1, today_wita() + 29, 'approved', 0, 157, 9),
  ('33ba2ca1-ef6e-591f-8e85-4b2a3d8776c5', (select id from stores where slug = 'butik-tenun-samawa'), 'home_middle', 'Tenun Samawa: kain buatan tangan', 'https://placehold.co/1200x300/0f1b33/cfae5e.png?text=Tenun+Samawa%3A+kain+buatan+tangan', 'store', 'butik-tenun-samawa', today_wita() - 1, today_wita() + 29, 'approved', 0, 194, 12)
on conflict (id) do nothing;

-- Statistik 30 hari untuk toko Premium (angka acak, hanya untuk contoh tampilan)
insert into store_daily_stats (store_id, day, visits, product_views, wa_clicks)
select s.id, d::date, v, (v * 1.6)::int, (v * 0.18)::int
from stores s
cross join generate_series(today_wita() - 29, today_wita(), interval '1 day') d
cross join lateral (select 8 + (abs(hashtext(s.slug || d::text)) % 40) as v) x
where s.slug in ('dapur-ayam-taliwang-bu-ratna', 'madu-susu-sumbawa-berkah')
on conflict (store_id, day) do nothing;

commit;
