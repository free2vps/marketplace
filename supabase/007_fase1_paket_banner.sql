-- ============================================================
-- 007: FASE 1 - Direktori freemium + sewa banner
--   - Paket Gratis (10 produk) dan Premium (lencana, prioritas, statistik)
--   - Sewa banner di aplikasi
--   - Pembayaran manual (transfer + bukti) yang diverifikasi admin
--   - Area/kecamatan (siap ekspansi)
-- Jalankan SEKALI di Supabase > SQL Editor (setelah 006).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Pembantu
-- ------------------------------------------------------------
create or replace function today_wita() returns date
language sql stable as $$ select (now() at time zone 'Asia/Makassar')::date $$;

create or replace function setting_text(p_key text, p_default text default '') returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from platform_settings where key = p_key), p_default);
$$;

-- ------------------------------------------------------------
-- 1. Pengaturan baru (semua bisa diubah admin tanpa mengubah kode)
-- ------------------------------------------------------------
insert into platform_settings (key, value, is_public, description) values
  ('feature.web_orders',       'false', true,  'Pesan lewat keranjang & checkout di aplikasi (Fase 2). Mati = pesan lewat WhatsApp'),
  ('plan.free_product_limit',  '10',    true,  'Batas jumlah produk paket Gratis'),
  ('plan.premium_price_month', '25000', true,  'Harga Premium per bulan (Rp). Rencana: Rp25.000-Rp50.000'),
  ('store.auto_activate',      'true',  false, 'true = toko baru langsung tayang; false = menunggu persetujuan admin'),
  ('payment.bank_name',        '""',    true,  'Bank / e-wallet tujuan transfer manual (isi sebelum membuka Premium & banner)'),
  ('payment.account_number',   '""',    true,  'Nomor rekening tujuan transfer manual'),
  ('payment.account_holder',   '""',    true,  'Nama pemilik rekening tujuan transfer manual')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. Area / kecamatan (siap ekspansi; baru Taliwang yang aktif)
-- ------------------------------------------------------------
create table if not exists areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  is_active  boolean not null default false,
  sort_order integer not null default 0
);
alter table areas enable row level security;
drop policy if exists "areas_public_read" on areas;
create policy "areas_public_read" on areas for select using (true);
drop policy if exists "areas_admin_all" on areas;
create policy "areas_admin_all" on areas for all using (is_admin()) with check (is_admin());

insert into areas (name, slug, is_active, sort_order) values
  ('Taliwang',   'taliwang',   true,  1),
  ('Brang Rea',  'brang-rea',  false, 2),
  ('Jereweh',    'jereweh',    false, 3),
  ('Seteluk',    'seteluk',    false, 4),
  ('Poto Tano',  'poto-tano',  false, 5),
  ('Maluk',      'maluk',      false, 6),
  ('Sekongkang', 'sekongkang', false, 7),
  ('Brang Ene',  'brang-ene',  false, 8)
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 3. Paket toko (Gratis / Premium)
-- ------------------------------------------------------------
alter table stores
  add column if not exists area_id       uuid references areas(id),
  add column if not exists plan          text not null default 'free' check (plan in ('free', 'premium')),
  add column if not exists premium_until timestamptz,
  add column if not exists is_premium    boolean not null default false,
  add column if not exists verified_at   timestamptz;

update stores set area_id = (select id from areas where slug = 'taliwang') where area_id is null;

grant insert (area_id) on stores to authenticated;
grant update (area_id) on stores to authenticated;

drop policy if exists "stores_admin_read" on stores;
create policy "stores_admin_read" on stores for select using (is_admin());

-- Toko baru: tayang otomatis (paket Gratis) atau menunggu admin, sesuai pengaturan
create or replace function stores_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.subscription_status := case when setting_bool('store.auto_activate') then 'active' else 'inactive' end;
  if new.area_id is null then
    select id into new.area_id from areas where is_active order by sort_order limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stores_before_insert on stores;
create trigger trg_stores_before_insert before insert on stores
  for each row execute function stores_before_insert();

-- ------------------------------------------------------------
-- 4. Batas produk paket Gratis
-- ------------------------------------------------------------
alter table products
  add column if not exists locked   boolean  not null default false,
  add column if not exists priority smallint not null default 0;

create index if not exists idx_products_priority on products (priority desc);

create or replace function product_limit(p_store uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from stores where id = p_store and premium_until > now()) then 2147483647
    else setting_num('plan.free_product_limit', 10)::int
  end;
$$;

-- Hitung ulang status Premium toko, produk terkunci (di luar batas paket), dan prioritas
create or replace function sync_store_plan(p_store uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prem boolean;
  v_lim  int;
  v_pri  smallint;
begin
  select (premium_until is not null and premium_until > now()) into v_prem
  from stores where id = p_store;
  if v_prem is null then return; end if;

  v_lim := product_limit(p_store);
  v_pri := case when v_prem then 1 else 0 end;

  update stores set is_premium = v_prem, plan = case when v_prem then 'premium' else 'free' end
  where id = p_store
    and (is_premium is distinct from v_prem or plan is distinct from case when v_prem then 'premium' else 'free' end);

  -- Produk tertua tetap tampil; sisanya terkunci sampai toko kembali Premium
  update products p set locked = (r.rn > v_lim), priority = v_pri
  from (select id, row_number() over (order by created_at, id) as rn
        from products where store_id = p_store) r
  where p.id = r.id and (p.locked is distinct from (r.rn > v_lim) or p.priority is distinct from v_pri);
end;
$$;

create or replace function products_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from products where store_id = new.store_id) >= product_limit(new.store_id) then
    raise exception 'Paket Gratis dibatasi % produk. Tingkatkan ke Premium untuk produk tanpa batas',
      setting_num('plan.free_product_limit', 10)::int;
  end if;
  new.priority := case when exists (select 1 from stores where id = new.store_id and premium_until > now()) then 1 else 0 end;
  return new;
end;
$$;
drop trigger if exists trg_products_before_insert on products;
create trigger trg_products_before_insert before insert on products
  for each row execute function products_before_insert();

create or replace function products_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_store_plan(coalesce(new.store_id, old.store_id));
  return null;
end;
$$;
drop trigger if exists trg_products_after_change on products;
create trigger trg_products_after_change after insert or delete on products
  for each row execute function products_after_change();

create or replace function stores_after_plan_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sync_store_plan(new.id);
  return null;
end;
$$;
drop trigger if exists trg_stores_after_plan_change on stores;
create trigger trg_stores_after_plan_change after update of premium_until on stores
  for each row execute function stores_after_plan_change();

-- Produk terkunci tidak tampil ke publik (pemilik tetap melihatnya)
drop policy if exists "products_public_read" on products;
create policy "products_public_read" on products for select using (
  not locked and exists (select 1 from stores s where s.id = products.store_id and s.subscription_status = 'active')
);

-- ------------------------------------------------------------
-- 5. Statistik pengunjung (fitur Premium)
-- ------------------------------------------------------------
create table if not exists store_daily_stats (
  store_id      uuid not null references stores(id) on delete cascade,
  day           date not null,
  visits        integer not null default 0,
  product_views integer not null default 0,
  wa_clicks     integer not null default 0,
  primary key (store_id, day)
);
alter table store_daily_stats enable row level security;
revoke all on store_daily_stats from anon, authenticated;
-- Tanpa policy: data hanya terbaca lewat store_stats() yang memeriksa paket Premium.

create or replace function _bump_stat(p_store uuid, p_col text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into store_daily_stats (store_id, day, visits, product_views, wa_clicks)
  values (p_store, today_wita(), (p_col = 'visits')::int, (p_col = 'product_views')::int, (p_col = 'wa_clicks')::int)
  on conflict (store_id, day) do update set
    visits = store_daily_stats.visits + (p_col = 'visits')::int,
    product_views = store_daily_stats.product_views + (p_col = 'product_views')::int,
    wa_clicks = store_daily_stats.wa_clicks + (p_col = 'wa_clicks')::int;
end;
$$;
revoke all on function _bump_stat(uuid, text) from public, anon, authenticated;

create or replace function track_store_visit(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update stores set visit_count = visit_count + 1
  where slug = p_slug and subscription_status = 'active' returning id into v_id;
  if v_id is not null then perform _bump_stat(v_id, 'visits'); end if;
end;
$$;

create or replace function track_product_view(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  update products set view_count = view_count + 1
  where id = p_id and is_available = true and not locked returning store_id into v_store;
  if v_store is not null then perform _bump_stat(v_store, 'product_views'); end if;
end;
$$;

create or replace function track_whatsapp_click(p_product uuid default null, p_slug text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  if p_product is not null then
    select store_id into v_store from products where id = p_product;
  elsif p_slug is not null then
    select id into v_store from stores where slug = p_slug and subscription_status = 'active';
  end if;
  if v_store is not null then perform _bump_stat(v_store, 'wa_clicks'); end if;
end;
$$;

create or replace function store_stats(p_store uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not (is_admin() or exists (select 1 from stores where id = p_store and owner_id = auth.uid())) then
    raise exception 'Bukan tokomu';
  end if;
  if not (is_admin() or exists (select 1 from stores where id = p_store and premium_until > now())) then
    raise exception 'Statistik tersedia untuk paket Premium';
  end if;

  return jsonb_build_object(
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d::date, 'visits', coalesce(s.visits, 0),
               'product_views', coalesce(s.product_views, 0), 'wa_clicks', coalesce(s.wa_clicks, 0))
             order by d), '[]'::jsonb)
      from generate_series(today_wita() - (v_days - 1), today_wita(), interval '1 day') d
      left join store_daily_stats s on s.store_id = p_store and s.day = d::date),
    'totals', (
      select jsonb_build_object('visits', coalesce(sum(visits), 0), 'product_views', coalesce(sum(product_views), 0),
                                'wa_clicks', coalesce(sum(wa_clicks), 0))
      from store_daily_stats where store_id = p_store and day > today_wita() - v_days),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'views', view_count, 'sold', sold_count)), '[]'::jsonb)
      from (select id, name, view_count, sold_count from products
            where store_id = p_store order by view_count desc, name limit 5) t)
  );
end;
$$;

-- ------------------------------------------------------------
-- 6. Pembayaran manual (transfer + bukti) untuk Premium dan banner
-- ------------------------------------------------------------
create table if not exists manual_payments (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('premium', 'banner')),
  store_id    uuid not null references stores(id) on delete cascade,
  banner_id   uuid,
  months      integer,
  amount      numeric(12,2) not null check (amount > 0),
  proof_path  text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note  text,
  reviewed_by uuid references admins(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_manual_payments_status on manual_payments (status, created_at);
alter table manual_payments enable row level security;
revoke insert, update, delete on manual_payments from anon, authenticated;

drop policy if exists "mp_owner_read" on manual_payments;
create policy "mp_owner_read" on manual_payments for select using (
  exists (select 1 from stores s where s.id = manual_payments.store_id and s.owner_id = auth.uid()));
drop policy if exists "mp_admin_read" on manual_payments;
create policy "mp_admin_read" on manual_payments for select using (is_admin());

-- Bukti transfer: bucket PRIVAT; pemilik dan admin yang bisa membaca
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "bukti_insert" on storage.objects;
drop policy if exists "bukti_read"   on storage.objects;
drop policy if exists "bukti_delete" on storage.objects;
create policy "bukti_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bukti_read" on storage.objects for select to authenticated
  using (bucket_id = 'bukti' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "bukti_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bukti' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function submit_premium_payment(p_store uuid, p_months int, p_proof_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from stores where id = p_store and owner_id = auth.uid()) then
    raise exception 'Ini bukan tokomu';
  end if;
  if p_months not in (1, 3, 6, 12) then
    raise exception 'Lama langganan tidak valid';
  end if;
  if p_proof_path is null or left(p_proof_path, length(auth.uid()::text) + 1) <> auth.uid()::text || '/' then
    raise exception 'Bukti transfer tidak valid';
  end if;
  if exists (select 1 from manual_payments where store_id = p_store and kind = 'premium' and status = 'pending') then
    raise exception 'Masih ada pembayaran Premium yang menunggu diverifikasi';
  end if;

  insert into manual_payments (kind, store_id, months, amount, proof_path)
  values ('premium', p_store, p_months, p_months * setting_num('plan.premium_price_month', 25000), p_proof_path)
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 7. Sewa banner
-- ------------------------------------------------------------
create table if not exists banner_slots (
  key         text primary key,
  name        text not null,
  description text,
  width       integer not null,
  height      integer not null,
  capacity    integer not null default 3 check (capacity > 0),
  price_7     numeric(12,2) not null,
  price_14    numeric(12,2) not null,
  price_30    numeric(12,2) not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);
alter table banner_slots enable row level security;
drop policy if exists "slots_public_read" on banner_slots;
create policy "slots_public_read" on banner_slots for select using (true);
drop policy if exists "slots_admin_all" on banner_slots;
create policy "slots_admin_all" on banner_slots for all using (is_admin()) with check (is_admin());

-- HARGA CONTOH: sesuaikan di Table Editor (banner_slots) atau lewat panel admin
insert into banner_slots (key, name, description, width, height, capacity, price_7, price_14, price_30, sort_order) values
  ('home_top',    'Banner utama beranda', 'Bergulir di bagian atas beranda, paling mudah terlihat', 1200, 400, 4, 150000, 275000, 500000, 1),
  ('home_middle', 'Banner tengah beranda', 'Di antara daftar produk dan toko terbaik',              1200, 300, 2, 100000, 180000, 320000, 2)
on conflict (key) do nothing;

create table if not exists banners (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  slot        text not null references banner_slots(key),
  title       text not null check (length(title) between 3 and 60),
  image_path  text not null,
  link_type   text not null check (link_type in ('store', 'product', 'url')),
  link_value  text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'pending_review'
              check (status in ('pending_review', 'approved', 'rejected', 'paused', 'expired')),
  price       numeric(12,2) not null,
  impressions integer not null default 0,
  clicks      integer not null default 0,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date),
  check (link_type <> 'url' or link_value ~* '^https://[^[:space:]]+$')
);
create index if not exists idx_banners_active on banners (slot, status, start_date, end_date);
alter table banners enable row level security;
revoke insert, update, delete on banners from anon, authenticated;

drop policy if exists "banners_public_read" on banners;
create policy "banners_public_read" on banners for select using (
  status = 'approved' and start_date <= today_wita() and end_date >= today_wita());
drop policy if exists "banners_owner_read" on banners;
create policy "banners_owner_read" on banners for select using (
  exists (select 1 from stores s where s.id = banners.store_id and s.owner_id = auth.uid()));
drop policy if exists "banners_admin_read" on banners;
create policy "banners_admin_read" on banners for select using (is_admin());

alter table manual_payments drop constraint if exists manual_payments_banner_fk;
alter table manual_payments add constraint manual_payments_banner_fk
  foreign key (banner_id) references banners(id) on delete cascade;

-- Gambar banner: bucket publik, maksimal 400 KB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banner', 'banner', true, 409600, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 409600,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "banner_read"   on storage.objects;
drop policy if exists "banner_insert" on storage.objects;
drop policy if exists "banner_delete" on storage.objects;
create policy "banner_read" on storage.objects for select using (bucket_id = 'banner');
create policy "banner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banner' and exists (
    select 1 from stores s where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()));
create policy "banner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'banner' and exists (
    select 1 from stores s where s.id::text = (storage.foldername(name))[1] and s.owner_id = auth.uid()));

-- Sisa slot pada rentang tanggal (hitungan konservatif: semua banner yang bertumpuk)
create or replace function banner_availability(p_slot text, p_start date, p_end date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select capacity from banner_slots where key = p_slot and is_active), 0)
       - (select count(*)::int from banners
          where slot = p_slot and status in ('pending_review', 'approved')
            and start_date <= p_end and end_date >= p_start);
$$;

create or replace function book_banner(
  p_store uuid, p_slot text, p_start date, p_days int, p_title text,
  p_link_type text, p_link_value text, p_image_path text, p_proof_path text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_slot banner_slots%rowtype;
  v_price numeric;
  v_end date;
  v_id uuid;
  v_store stores%rowtype;
begin
  select * into v_store from stores where id = p_store and owner_id = auth.uid();
  if v_store.id is null then raise exception 'Ini bukan tokomu'; end if;
  if v_store.subscription_status <> 'active' then raise exception 'Toko belum aktif'; end if;

  select * into v_slot from banner_slots where key = p_slot and is_active;
  if v_slot.key is null then raise exception 'Posisi banner tidak tersedia'; end if;
  if p_days not in (7, 14, 30) then raise exception 'Durasi harus 7, 14, atau 30 hari'; end if;
  if p_start is null or p_start < today_wita() or p_start > today_wita() + 60 then
    raise exception 'Tanggal mulai harus dalam 60 hari ke depan';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 3 or length(p_title) > 60 then
    raise exception 'Judul banner 3-60 huruf';
  end if;
  if p_link_type not in ('store', 'product', 'url') then raise exception 'Jenis tautan tidak valid'; end if;
  if p_link_type = 'url' and coalesce(p_link_value, '') !~* '^https://[^[:space:]]+$' then
    raise exception 'Tautan luar harus diawali https://';
  end if;
  if p_link_type = 'store' and not exists (select 1 from stores where slug = p_link_value) then
    raise exception 'Toko tujuan tidak ditemukan';
  end if;
  if p_link_type = 'product' and not exists (
    select 1 from products where id::text = p_link_value and store_id = p_store) then
    raise exception 'Produk tujuan harus produk tokomu';
  end if;
  if left(coalesce(p_image_path, ''), length(p_store::text) + 1) <> p_store::text || '/' then
    raise exception 'Gambar banner tidak valid';
  end if;
  if left(coalesce(p_proof_path, ''), length(auth.uid()::text) + 1) <> auth.uid()::text || '/' then
    raise exception 'Bukti transfer tidak valid';
  end if;

  v_end := p_start + (p_days - 1);
  perform pg_advisory_xact_lock(hashtext('banner:' || p_slot));
  if banner_availability(p_slot, p_start, v_end) <= 0 then
    raise exception 'Posisi ini penuh pada tanggal tersebut. Coba tanggal lain';
  end if;

  v_price := case p_days when 7 then v_slot.price_7 when 14 then v_slot.price_14 else v_slot.price_30 end;

  insert into banners (store_id, slot, title, image_path, link_type, link_value, start_date, end_date, price)
  values (p_store, p_slot, btrim(p_title), p_image_path, p_link_type, p_link_value, p_start, v_end, v_price)
  returning id into v_id;

  insert into manual_payments (kind, store_id, banner_id, amount, proof_path)
  values ('banner', p_store, v_id, v_price, p_proof_path);

  return v_id;
end;
$$;

create or replace function track_banner(p_id uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'impression' then
    update banners set impressions = impressions + 1 where id = p_id and status = 'approved';
  elsif p_kind = 'click' then
    update banners set clicks = clicks + 1 where id = p_id and status = 'approved';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 8. Fungsi admin (hanya admin yang terdaftar di tabel admins)
-- ------------------------------------------------------------
create or replace function admin_review_manual_payment(p_id uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r manual_payments%rowtype;
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  select * into r from manual_payments where id = p_id and status = 'pending' for update;
  if r.id is null then return false; end if;

  if p_approve then
    if r.kind = 'premium' then
      update stores
      set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(months => r.months),
          verified_at = coalesce(verified_at, now())
      where id = r.store_id;
    else
      update banners set status = 'approved' where id = r.banner_id and status = 'pending_review';
    end if;
  elsif r.kind = 'banner' then
    update banners set status = 'rejected' where id = r.banner_id and status = 'pending_review';
  end if;

  update manual_payments
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;
  return true;
end;
$$;

create or replace function admin_set_banner_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  if p_status not in ('approved', 'paused', 'rejected') then raise exception 'Status tidak valid'; end if;
  update banners set status = p_status where id = p_id;
  return found;
end;
$$;

create or replace function admin_set_store(
  p_id uuid, p_active boolean default null, p_boosted boolean default null, p_verified boolean default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  update stores set
    subscription_status = case when p_active is null then subscription_status
                               when p_active then 'active' else 'inactive' end,
    is_boosted = coalesce(p_boosted, is_boosted),
    verified_at = case when p_verified is null then verified_at
                       when p_verified then coalesce(verified_at, now()) else null end
  where id = p_id;
  return found;
end;
$$;

create or replace function admin_grant_premium(p_id uuid, p_days int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'Jumlah hari tidak valid'; end if;
  update stores
  set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days),
      verified_at = coalesce(verified_at, now())
  where id = p_id;
  return found;
end;
$$;

create or replace function admin_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  return jsonb_build_object(
    'stores_total',      (select count(*) from stores),
    'stores_live',       (select count(*) from stores where subscription_status = 'active'),
    'stores_premium',    (select count(*) from stores where premium_until > now()),
    'products_total',    (select count(*) from products),
    'pending_payments',  (select count(*) from manual_payments where status = 'pending'),
    'banners_live',      (select count(*) from banners where status = 'approved'
                          and start_date <= today_wita() and end_date >= today_wita()),
    'orders_total',      (select count(*) from orders));
end;
$$;

-- ------------------------------------------------------------
-- 9. Perawatan harian (dipanggil terjadwal; lihat /api/cron/daily)
-- ------------------------------------------------------------
create or replace function refresh_expired_plans() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_stores int := 0;
  v_banners int := 0;
  v_qris int := 0;
begin
  for s in select id from stores
           where (is_premium or plan = 'premium') and (premium_until is null or premium_until <= now()) loop
    perform sync_store_plan(s.id);
    v_stores := v_stores + 1;
  end loop;

  update banners set status = 'expired' where status = 'approved' and end_date < today_wita();
  get diagnostics v_banners = row_count;

  -- Pesanan QRIS yang tidak dibayar dalam 2 jam dianggap kedaluwarsa
  update orders set payment_status = 'expired'
  where payment_method = 'qris' and payment_status = 'unpaid' and created_at < now() - interval '2 hours';
  get diagnostics v_qris = row_count;

  return jsonb_build_object('stores_downgraded', v_stores, 'banners_expired', v_banners, 'qris_expired', v_qris);
end;
$$;
revoke all on function refresh_expired_plans() from public, anon, authenticated;
revoke all on function sync_store_plan(uuid) from public, anon, authenticated;

-- Terapkan batas paket pada data yang sudah ada
select sync_store_plan(id) from stores;
