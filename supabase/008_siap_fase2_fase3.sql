-- ============================================================
-- 008: Infrastruktur untuk FASE 2 dan FASE 3 (semua MATI secara bawaan)
--   Fase 2: pesan lewat aplikasi, pembayaran Xendit (split), kurir, ongkir jarak
--   Fase 3: notifikasi WhatsApp otomatis, laporan penjualan, ekspansi area
-- Jalankan SEKALI di Supabase > SQL Editor (setelah 007).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pengaturan
-- ------------------------------------------------------------
insert into platform_settings (key, value, is_public, description) values
  ('payments.mode',            '"split"', false, 'split = gateway (Xendit) membagi dana langsung ke toko & platform, platform TIDAK menampung dana (disarankan). wallet = platform menampung saldo (berisiko izin BI)'),
  ('shipping.mode',            '"flat"',  true,  'flat = ongkir tetap per toko; distance = berdasarkan jarak toko-pembeli'),
  ('shipping.base_fee',        '5000',    true,  'Mode jarak: ongkir dasar (Rp)'),
  ('shipping.per_km',          '2000',    true,  'Mode jarak: tambahan per km setelah jarak gratis (Rp)'),
  ('shipping.free_km',         '1',       true,  'Mode jarak: jarak yang sudah termasuk ongkir dasar (km)'),
  ('shipping.max_km',          '15',      true,  'Mode jarak: batas jangkauan pengantaran (km)'),
  ('shipping.digital_discount','0',       true,  'Potongan ongkir bila bayar QRIS/VA (Rp). Rencana: 2000'),
  ('courier.admin_margin',     '0',       false, 'Margin admin per pengiriman kurir (Rp), diambil dari ongkir. Rencana: 1000-2000'),
  ('feature.notifications',    'false',   false, 'Notifikasi WhatsApp otomatis lewat antrean (butuh gateway pesan)')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. Kolom & batasan baru
-- ------------------------------------------------------------
alter table payments drop constraint if exists payments_provider_check;
alter table payments add constraint payments_provider_check
  check (provider in ('midtrans', 'tripay', 'xendit', 'manual'));
alter table payments add column if not exists pay_url text;

-- ID sub-akun Xendit (xenPlatform) milik toko; diisi admin setelah toko dibuatkan sub-akun
alter table stores add column if not exists xendit_account_id text;

alter table orders add column if not exists shipping_discount numeric(12,2) not null default 0
  check (shipping_discount >= 0);
grant select (shipping_discount) on orders to authenticated;

create or replace function orders_set_total() returns trigger language plpgsql as $$
begin
  new.total_amount := coalesce(new.subtotal, 0) + coalesce(new.shipping_fee, 0)
                    + coalesce(new.service_fee, 0) - coalesce(new.shipping_discount, 0);
  return new;
end;
$$;
drop trigger if exists trg_orders_set_total on orders;
create trigger trg_orders_set_total
  before insert or update of subtotal, shipping_fee, service_fee, shipping_discount on orders
  for each row execute function orders_set_total();

alter table ledger_entries drop constraint if exists ledger_entries_reason_check;
alter table ledger_entries add constraint ledger_entries_reason_check check (reason in (
  'sale', 'commission', 'shipping', 'service_fee', 'cod_collected', 'gateway_fee',
  'deposit_in', 'deposit_out', 'payout', 'payout_reversal', 'adjustment',
  'courier_margin', 'shipping_subsidy'));

-- ------------------------------------------------------------
-- 3. Pembukuan: mode split (tanpa menampung dana) + margin kurir + subsidi ongkir
-- ------------------------------------------------------------
create or replace function settle_order(p_order_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_courier boolean;
  v_gw numeric := 0;
  v_margin numeric := 0;
begin
  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.status <> 'selesai' or o.settled_at is not null then
    return false;
  end if;
  if o.payment_method = 'qris' and o.payment_status <> 'paid' then
    return false;
  end if;

  -- Mode split: gateway yang membagi dana ke toko dan platform. Platform tidak
  -- menampung uang, jadi tidak ada saldo yang dibukukan di sini.
  if o.payment_method = 'qris' and setting_text('payments.mode', 'split') = 'split' then
    update orders set settled_at = now() where id = o.id;
    return true;
  end if;

  v_courier := o.delivery_mode = 'courier_pool' and o.courier_id is not null;
  if v_courier then
    v_margin := least(setting_num('courier.admin_margin', 0), o.shipping_fee);
  end if;

  if o.payment_method = 'qris' then
    select fee_amount into v_gw from payments
      where order_id = o.id and status = 'paid' order by paid_at desc nulls last limit 1;
    if coalesce(v_gw, 0) = 0 then
      v_gw := round(o.total_amount * setting_num('fee.qris_percent', 0.7) / 100
                    + setting_num('fee.qris_flat', 0), 2);
    end if;

    perform _ledger(o.id, 'store', o.store_id, 'sale', o.subtotal);
    perform _ledger(o.id, 'store', o.store_id, 'commission', -o.commission_amount);
    if v_courier then
      perform _ledger(o.id, 'courier', o.courier_id, 'shipping', o.shipping_fee - v_margin);
    else
      perform _ledger(o.id, 'store', o.store_id, 'shipping', o.shipping_fee);
    end if;
    perform _ledger(o.id, 'platform', null, 'commission', o.commission_amount);
    perform _ledger(o.id, 'platform', null, 'service_fee', o.service_fee);
    perform _ledger(o.id, 'platform', null, 'courier_margin', v_margin);
    perform _ledger(o.id, 'platform', null, 'shipping_subsidy', -o.shipping_discount);
    perform _ledger(o.id, 'platform', null, 'gateway_fee', -v_gw);

  elsif v_courier then
    perform _ledger(o.id, 'store', o.store_id, 'sale', o.subtotal);
    perform _ledger(o.id, 'store', o.store_id, 'commission', -o.commission_amount);
    perform _ledger(o.id, 'platform', null, 'commission', o.commission_amount);
    perform _ledger(o.id, 'platform', null, 'service_fee', o.service_fee);
    perform _ledger(o.id, 'platform', null, 'courier_margin', v_margin);
    perform _ledger(o.id, 'courier_deposit', o.courier_id, 'cod_collected',
                    -(o.subtotal + o.service_fee + v_margin));

  else
    perform _ledger(o.id, 'store', o.store_id, 'commission', -o.commission_amount);
    perform _ledger(o.id, 'store', o.store_id, 'service_fee', -o.service_fee);
    perform _ledger(o.id, 'platform', null, 'commission', o.commission_amount);
    perform _ledger(o.id, 'platform', null, 'service_fee', o.service_fee);
  end if;

  update orders set settled_at = now() where id = o.id;
  return true;
end;
$$;
revoke all on function settle_order(uuid) from public, anon, authenticated;

create or replace function _courier_limit(p_courier uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select _wallet_balance('courier_deposit', p_courier)
       - coalesce((select sum(subtotal + service_fee + least(setting_num('courier.admin_margin', 0), shipping_fee))
                   from orders
                   where courier_id = p_courier and payment_method = 'cod'
                     and status in ('diambil_kurir', 'diantar')), 0);
$$;
revoke all on function _courier_limit(uuid) from public, anon, authenticated;

create or replace function claim_order(p_order_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_otp text;
begin
  if not setting_bool('feature.courier') then return 'fitur_nonaktif'; end if;
  if not exists (select 1 from couriers where id = auth.uid() and verification_status = 'verified' and is_active) then
    return 'kurir_belum_terverifikasi';
  end if;

  select * into o from orders where id = p_order_id for update;
  if o.id is null or o.delivery_mode <> 'courier_pool' or o.status <> 'siap_diantar' or o.courier_id is not null then
    return 'pesanan_tidak_tersedia';
  end if;
  if o.payment_method = 'qris' and o.payment_status <> 'paid' then
    return 'belum_dibayar';
  end if;
  if o.payment_method = 'cod' then
    perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
    if o.subtotal + o.service_fee + least(setting_num('courier.admin_margin', 0), o.shipping_fee)
       > _courier_limit(auth.uid()) then
      return 'melebihi_batas_deposit';
    end if;
  end if;

  v_otp := lpad((floor(random() * 10000))::int::text, 4, '0');
  perform set_config('app.bypass_status_guard', 'on', true);
  update orders
  set courier_id = auth.uid(), status = 'diambil_kurir', handover_otp = v_otp,
      otp_attempts = 0, updated_at = now()
  where id = o.id;
  return 'ok';
end;
$$;

-- ------------------------------------------------------------
-- 4. Ongkos kirim berdasarkan jarak (tanpa PostGIS; rumus haversine cukup untuk kota)
-- ------------------------------------------------------------
create or replace function haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))::numeric;
$$;

create or replace function _shipping_amount(p_store uuid, p_lat numeric, p_lng numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  km numeric;
  fee numeric;
begin
  select flat_shipping_fee, latitude, longitude into s from stores where id = p_store;
  if setting_text('shipping.mode', 'flat') <> 'distance' or s.latitude is null or s.longitude is null then
    return s.flat_shipping_fee;
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Titik lokasi diperlukan untuk menghitung ongkos kirim';
  end if;
  km := haversine_km(s.latitude, s.longitude, p_lat, p_lng);
  if km > setting_num('shipping.max_km', 15) then
    raise exception 'Alamat di luar jangkauan pengantaran (maksimal % km)', setting_num('shipping.max_km', 15);
  end if;
  fee := setting_num('shipping.base_fee', 5000)
       + ceil(greatest(km - setting_num('shipping.free_km', 1), 0)) * setting_num('shipping.per_km', 2000);
  return ceil(fee / 500) * 500;
end;
$$;
revoke all on function _shipping_amount(uuid, numeric, numeric) from public, anon, authenticated;

-- Dipakai halaman checkout untuk menampilkan ongkir sebelum memesan
create or replace function shipping_quote(p_store uuid, p_lat numeric default null, p_lng numeric default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_mode text := setting_text('shipping.mode', 'flat');
begin
  select latitude, longitude into s from stores where id = p_store and subscription_status = 'active';
  return jsonb_build_object(
    'mode', v_mode,
    'fee', _shipping_amount(p_store, p_lat, p_lng),
    'distance_km', case when v_mode = 'distance' and s.latitude is not null and p_lat is not null
                        then round(haversine_km(s.latitude, s.longitude, p_lat, p_lng), 1) end,
    'digital_discount', setting_num('shipping.digital_discount', 0));
end;
$$;

-- ------------------------------------------------------------
-- 5. Antrean notifikasi WhatsApp (dikirim oleh /api/cron/notify)
-- ------------------------------------------------------------
create table if not exists notification_outbox (
  id         bigint generated always as identity primary key,
  channel    text not null default 'whatsapp',
  to_phone   text not null,
  template   text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists idx_outbox_pending on notification_outbox (status, created_at);
alter table notification_outbox enable row level security;
revoke all on notification_outbox from anon, authenticated;

create or replace function _enqueue_notification(p_phone text, p_template text, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notification_outbox (to_phone, template, payload)
  select p_phone, p_template, p_payload
  where setting_bool('feature.notifications') and coalesce(p_phone, '') <> '';
$$;
revoke all on function _enqueue_notification(text, text, jsonb) from public, anon, authenticated;

create or replace function orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_template text;
  v_store text;
begin
  if not setting_bool('feature.notifications') then return null; end if;
  v_template := case new.status
    when 'disiapkan' then 'order_accepted'
    when 'diantar'   then 'order_delivering'
    when 'selesai'   then 'order_done'
    when 'dibatalkan' then 'order_cancelled' end;
  if v_template is null then return null; end if;
  select name into v_store from stores where id = new.store_id;
  perform _enqueue_notification(new.buyer_phone, v_template,
    jsonb_build_object('order_code', new.order_code, 'store', v_store, 'total', new.total_amount));
  return null;
end;
$$;
drop trigger if exists trg_orders_notify on orders;
create trigger trg_orders_notify after update of status on orders
  for each row when (new.status is distinct from old.status) execute function orders_notify();

-- ------------------------------------------------------------
-- 6. Pesanan: sekarang bergantung pada saklar feature.web_orders
-- ------------------------------------------------------------
create or replace function create_guest_order(
  p_store_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_delivery_address text,
  p_delivery_latitude numeric,
  p_delivery_longitude numeric,
  p_delivery_mode text,
  p_items jsonb,
  p_payment_method text default 'cod',
  p_notes text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_store record;
  v_item record;
  v_prod record;
  v_unit numeric;
  v_subtotal numeric := 0;
  v_commission numeric := 0;
  v_service numeric := 0;
  v_ship numeric := 0;
  v_disc numeric := 0;
  v_order_id uuid;
  v_code text;
begin
  if not setting_bool('feature.web_orders') then
    raise exception 'Pemesanan lewat aplikasi belum dibuka. Hubungi penjual lewat WhatsApp';
  end if;

  select id, name, phone, subscription_status, is_open into v_store from stores where id = p_store_id;
  if v_store.id is null or v_store.subscription_status <> 'active' then
    raise exception 'Toko tidak tersedia';
  end if;
  if not v_store.is_open then
    raise exception 'Toko sedang tutup, coba lagi nanti';
  end if;
  if p_delivery_mode not in ('self', 'courier_pool') then
    raise exception 'Cara pengantaran tidak valid';
  end if;
  if p_delivery_mode = 'courier_pool' and not setting_bool('feature.courier') then
    raise exception 'Pengantaran oleh kurir belum tersedia';
  end if;
  if p_payment_method not in ('cod', 'qris') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  if p_payment_method = 'qris' and not setting_bool('feature.online_payment') then
    raise exception 'Pembayaran online belum tersedia';
  end if;
  if length(btrim(coalesce(p_buyer_name, ''))) < 2 or length(p_buyer_name) > 80 then
    raise exception 'Nama pembeli tidak valid';
  end if;
  if coalesce(p_buyer_phone, '') !~ '^[0-9+]{8,15}$' then
    raise exception 'Nomor HP tidak valid';
  end if;
  if length(btrim(coalesce(p_delivery_address, ''))) < 5 or length(p_delivery_address) > 300 then
    raise exception 'Alamat pengantaran tidak valid';
  end if;
  if length(coalesce(p_notes, '')) > 300 then
    raise exception 'Catatan terlalu panjang (maksimal 300 huruf)';
  end if;
  if p_delivery_latitude is not null
     and (p_delivery_latitude not between -90 and 90 or p_delivery_longitude not between -180 and 180
          or p_delivery_longitude is null) then
    raise exception 'Titik lokasi tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Daftar belanja tidak valid';
  end if;

  if (select count(*) from orders
      where buyer_phone = p_buyer_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Terlalu banyak pesanan dari nomor ini dalam satu jam. Coba lagi nanti';
  end if;
  if (select count(*) from orders
      where buyer_phone = p_buyer_phone and store_id = p_store_id
        and status = 'menunggu_konfirmasi') >= 2 then
    raise exception 'Kamu masih punya 2 pesanan yang belum dikonfirmasi toko ini';
  end if;

  v_ship := _shipping_amount(p_store_id, p_delivery_latitude, p_delivery_longitude);
  if p_payment_method = 'qris' then
    v_disc := least(setting_num('shipping.digital_discount', 0), v_ship);
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from orders where order_code = v_code);
  end loop;

  insert into orders (order_code, store_id, buyer_name, buyer_phone, delivery_address,
                      delivery_latitude, delivery_longitude, delivery_mode, payment_method, subtotal)
  values (v_code, p_store_id, btrim(p_buyer_name), p_buyer_phone, btrim(p_delivery_address),
          p_delivery_latitude, p_delivery_longitude, p_delivery_mode, p_payment_method, 0)
  returning id into v_order_id;

  for v_item in
    select (i->>'product_id')::uuid as product_id, sum((i->>'quantity')::int) as qty
    from jsonb_array_elements(p_items) i
    group by 1
  loop
    if v_item.qty < 1 or v_item.qty > 99 then
      raise exception 'Jumlah barang tidak valid';
    end if;

    select id, name, price, promo_price, promo_ends_at, stock, is_available into v_prod
    from products where id = v_item.product_id and store_id = p_store_id and not locked for update;

    if v_prod.id is null or not v_prod.is_available then
      raise exception 'Ada produk yang tidak tersedia';
    end if;
    if v_prod.stock is not null and v_prod.stock < v_item.qty then
      raise exception 'Stok % tidak cukup', v_prod.name;
    end if;
    if v_prod.stock is not null then
      update products set stock = stock - v_item.qty where id = v_prod.id;
    end if;

    v_unit := case
      when v_prod.promo_price is not null and (v_prod.promo_ends_at is null or v_prod.promo_ends_at > now())
        then v_prod.promo_price else v_prod.price end;

    insert into order_items (order_id, product_id, product_name, price, quantity, subtotal)
    values (v_order_id, v_prod.id, v_prod.name, v_unit, v_item.qty, v_unit * v_item.qty);

    v_subtotal := v_subtotal + v_unit * v_item.qty;
  end loop;

  if setting_bool('feature.commission') then
    v_commission := round(v_subtotal * setting_num('fee.commission_percent', 0) / 100);
    v_service := setting_num('fee.service_fee', 0);
  end if;

  update orders
  set subtotal = v_subtotal,
      commission_amount = v_commission,
      service_fee = v_service,
      shipping_fee = v_ship,
      shipping_discount = v_disc,
      notes = nullif(btrim(p_notes), '')
  where id = v_order_id;

  -- Kabari toko dan pembeli (hanya bila notifikasi dihidupkan)
  perform _enqueue_notification(v_store.phone, 'new_order',
    jsonb_build_object('order_code', v_code, 'buyer_name', btrim(p_buyer_name),
                       'total', v_subtotal + v_ship + v_service - v_disc));
  perform _enqueue_notification(p_buyer_phone, 'order_received',
    jsonb_build_object('order_code', v_code, 'store', v_store.name,
                       'total', v_subtotal + v_ship + v_service - v_disc));

  return v_code;
end;
$$;

create or replace function get_order_detail(p_order_code text, p_buyer_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o record;
begin
  select ord.* into o from orders ord
  where ord.order_code = upper(btrim(p_order_code)) and ord.buyer_phone = p_buyer_phone;
  if o.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'order_code', o.order_code,
    'status', o.status,
    'delivery_mode', o.delivery_mode,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'subtotal', o.subtotal,
    'shipping_fee', o.shipping_fee,
    'shipping_discount', o.shipping_discount,
    'service_fee', o.service_fee,
    'total_amount', o.total_amount,
    'buyer_name', o.buyer_name,
    'delivery_address', o.delivery_address,
    'delivery_latitude', o.delivery_latitude,
    'delivery_longitude', o.delivery_longitude,
    'notes', o.notes,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'store', (select jsonb_build_object('name', s.name, 'slug', s.slug, 'logo_url', s.logo_url,
                                         'phone', s.phone, 'address', s.address)
              from stores s where s.id = o.store_id),
    'courier', case when o.courier_id is null then null else
                (select jsonb_build_object('name', c.name, 'phone', c.phone)
                 from couriers c where c.id = o.courier_id) end,
    'courier_location', case when o.courier_id is not null and o.status in ('diambil_kurir', 'diantar') then
                (select jsonb_build_object('lat', cl.latitude, 'lng', cl.longitude, 'updated_at', cl.updated_at)
                 from courier_locations cl where cl.courier_id = o.courier_id) end,
    'handover_otp', case when o.courier_id is not null and o.status in ('diambil_kurir', 'diantar')
                         then o.handover_otp end,
    'store_reviewed', exists (select 1 from reviews r where r.order_id = o.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', oi.product_id,
               'name', oi.product_name,
               'price', oi.price,
               'quantity', oi.quantity,
               'subtotal', oi.subtotal,
               'image_path', p.image_path,
               'reviewed', exists (select 1 from product_reviews pr
                                    where pr.order_id = o.id and pr.product_id = oi.product_id))
             order by oi.product_name)
      from order_items oi left join products p on p.id = oi.product_id
      where oi.order_id = o.id), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- 7. Laporan penjualan toko (Fase 3: otomatisasi laporan UMKM)
-- ------------------------------------------------------------
create or replace function store_sales_report(p_store uuid, p_from date, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_to date := coalesce(p_to, today_wita());
  v_from date := coalesce(p_from, today_wita() - 29);
begin
  if not (is_admin() or exists (select 1 from stores where id = p_store and owner_id = auth.uid())) then
    raise exception 'Bukan tokomu';
  end if;
  if v_to < v_from or v_to - v_from > 366 then
    raise exception 'Rentang tanggal tidak valid (maksimal 1 tahun)';
  end if;

  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'totals', (
      select jsonb_build_object('orders', count(*), 'goods', coalesce(sum(subtotal), 0),
                                'shipping', coalesce(sum(shipping_fee), 0),
                                'commission', coalesce(sum(commission_amount), 0))
      from orders where store_id = p_store and status = 'selesai'
        and (created_at at time zone 'Asia/Makassar')::date between v_from and v_to),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', c, 'goods', g) order by d), '[]'::jsonb)
      from (select (created_at at time zone 'Asia/Makassar')::date as d, count(*) as c, sum(subtotal) as g
            from orders where store_id = p_store and status = 'selesai'
              and (created_at at time zone 'Asia/Makassar')::date between v_from and v_to
            group by 1) x),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', rev)), '[]'::jsonb)
      from (select oi.product_name as name, sum(oi.quantity) as qty, sum(oi.subtotal) as rev
            from order_items oi join orders o on o.id = oi.order_id
            where o.store_id = p_store and o.status = 'selesai'
              and (o.created_at at time zone 'Asia/Makassar')::date between v_from and v_to
            group by 1 order by qty desc, rev desc limit 5) y)
  );
end;
$$;
