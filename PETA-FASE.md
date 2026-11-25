# Peta Fase: dari dokumen strategi ke sistem

Sistem sekarang berada di **Fase 1**. Semua kemampuan Fase 2 dan 3 sudah terpasang tetapi **mati**, dan dihidupkan lewat saklar di panel admin (`/admin` > Pengaturan), tanpa mengubah kode.

## 1. Status tiap item dokumen strategi

| Item | Status |
|---|---|
| Direktori toko dan katalog produk | Aktif |
| Pesan langsung lewat WhatsApp (Fase 1 di dokumen) | Aktif. Tombol di halaman produk dan toko, dengan pesan siap kirim |
| PWA (bisa dipasang di layar HP) | Aktif: manifest dan ikon. Belum ada mode offline |
| Paket Gratis (maks. 10 produk) | Aktif. Batas dijaga di database, bukan hanya di layar |
| Premium: lencana terverifikasi, prioritas pencarian, statistik pengunjung, label pengiriman | Aktif |
| Sewa banner (tambahan darimu, tidak ada di dokumen) | Aktif |
| Pembayaran Premium dan banner: transfer + bukti, diverifikasi admin | Aktif |
| Pesan lewat keranjang/checkout/pelacakan | Siap, mati (`feature.web_orders`) |
| Komisi dan biaya layanan | Siap, mati (`feature.commission`) |
| Xendit split payment | Kerangka siap, mati. Belum diuji ke Xendit |
| Kurir: KYC, deposit, margin, kode serah-terima | Siap, mati (`feature.courier`) |
| Potongan ongkir bayar digital | Siap (`shipping.digital_discount`, bawaan 0) |
| Ongkir berdasarkan jarak | Siap (`shipping.mode` = distance). Memakai rumus haversine, bukan PostGIS |
| Notifikasi WhatsApp otomatis | Antrean dan pengirim siap, mati (`feature.notifications`) |
| Laporan penjualan UMKM | Fungsi database siap. Halamannya belum dibuat |
| Ekspansi kecamatan | Tabel area siap (8 kecamatan, baru Taliwang aktif). Filter di layar belum dibuat |

Dokumen menaruh paket Premium di Fase 2. Di sini dimajukan ke Fase 1 sesuai keputusanmu.

## 2. Checklist membuka Fase 1

Lakukan berurutan:

1. Jalankan `supabase/007_fase1_paket_banner.sql`, lalu `008_siap_fase2_fase3.sql` di SQL Editor.
2. Jadikan akunmu admin (ganti UUID dengan id akunmu di Authentication > Users):
   ```sql
   insert into admins (id, name) values ('UUID-AKUNMU', 'Nama Kamu') on conflict do nothing;
   ```
3. Buka `/admin` > Pengaturan, lalu isi `payment.bank_name`, `payment.account_number`, `payment.account_holder`. **Selama kosong, Premium dan sewa banner terkunci.** Jangan pernah mengisinya dengan rekening contoh.
4. Tetapkan harga: `plan.premium_price_month` (bawaan Rp25.000, rentang di dokumen Rp25.000-50.000). Harga banner ada di tabel `banner_slots` (Table Editor). **Angka bawaannya hanya contoh buatan saya**, sesuaikan.
5. Pilih `store.auto_activate`: `true` = toko baru langsung tayang, `false` = menunggu persetujuanmu. **Konfirmasi email Supabase harus tetap MATI**: halaman pendaftaran toko membuat toko seketika setelah akun dibuat, jadi dengan konfirmasi email menyala pendaftaran gagal. Karena itu kendali utama terhadap toko palsu adalah `store.auto_activate = false` (kamu menyetujui tiap toko di `/admin` > Toko) dan tombol Tangguhkan.
6. Isi `CRON_SECRET` di Vercel (teks acak minimal 16 karakter), lalu Redeploy. Ini menjalankan perawatan harian (`vercel.json`): menurunkan Premium yang habis dan mengakhiri banner.
7. Sebelum membuka untuk umum, jalankan `hapus_dummy.sql` untuk menghapus data contoh.

Data contoh Fase 1 (dua toko Premium, tiga banner, statistik): jalankan `supabase/seed_dummy_fase1.sql` setelah seed dummy sebelumnya.

## 3. Pekerjaan admin harian (Fase 1)

Semuanya di `/admin`:

- **Pembayaran:** cocokkan jumlah dan nama pengirim dengan mutasi rekening, lihat bukti transfer, lalu Setujui atau Tolak (beri alasan). Persetujuan Premium otomatis mengaktifkan lencana dan memperpanjang masa aktif. Persetujuan banner menayangkannya pada tanggal mulai.
- **Toko:** tangguhkan/tayangkan, tandai Pilihan, beri atau cabut lencana, beri Premium gratis 30 hari (mis. untuk promo).
- **Banner:** jeda atau tolak banner yang bermasalah.
- **Pengaturan:** semua saklar dan tarif.

Aturan yang berjalan otomatis: produk ke-11 ditolak di paket Gratis. Saat Premium habis, 10 produk tertua tetap tampil dan sisanya disembunyikan dari pembeli (pemilik masih melihatnya dan akan diingatkan). Premium aktif kembali, semua produk tampil lagi.

## 4. Fase 2: urutan membukanya

Jangan dibuka sekaligus. Urutan yang aman:

1. **Pesan lewat aplikasi** (`feature.web_orders`) dengan COD dan antar toko sendiri. Tidak butuh gateway.
2. **Ongkir tetap atau jarak** (`shipping.mode`).
3. **Komisi** (`feature.commission`). Dokumen menyebut take rate 2,5%, jadi ubah `fee.commission_percent` ke 2.5 (bawaan sistem 3).
4. **Xendit** (lihat di bawah), lalu `feature.online_payment`.
5. **Kurir** (`feature.courier`) paling akhir.

### Persiapan Xendit

1. Daftar Xendit dan aktifkan xenPlatform. Syarat dokumen dan biaya ditentukan Xendit, jadi baca di situs mereka.
2. Buat sub-akun untuk setiap toko yang akan menerima pembayaran online (lewat dashboard xenPlatform atau API Xendit). Simpan ID-nya:
   ```sql
   update stores set xendit_account_id = 'ID-SUB-AKUN' where slug = 'nama-toko';
   ```
3. Isi di Vercel: `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`, `XENDIT_MASTER_ACCOUNT_ID` (ID akun induk/platform), `SUPABASE_SERVICE_ROLE_KEY`. Redeploy.
4. Di dashboard Xendit, daftarkan webhook invoice ke `https://DOMAINMU/api/payments/webhook/xendit` dengan token yang sama seperti `XENDIT_CALLBACK_TOKEN`.
5. Uji di mode sandbox sampai satu pembayaran percobaan tercatat lunas, baru hidupkan `feature.online_payment`.

Cara kerja: untuk tiap pesanan QRIS, sistem membuat aturan pembagian dengan jumlah tetap (komisi + biaya layanan, minus subsidi ongkir) ke akun induk, lalu membuat tagihan atas nama sub-akun toko. Pembeli membayar di halaman Xendit. Mode ini (`payments.mode` = split) membuat platform **tidak menampung saldo**, sesuai dokumen. Mode `wallet` (saldo internal) masih ada, tetapi tidak disarankan.

### Yang perlu kamu putuskan atau pastikan sebelum Fase 2

- **Dana ditahan sampai barang diterima.** Dokumen menggambarkan dana dibagi setelah pembeli mengonfirmasi. Adapter ini membagi dana **saat pembayaran**, sesuai dokumentasi split Xendit yang saya baca. Tanyakan ke Xendit apakah ada fitur menahan dana sampai konfirmasi sebelum membangunnya.
- **Ongkir kurir** di mode split ikut dialirkan ke akun induk supaya bisa dibayarkan ke kurir. Itu berarti platform memegang uang ongkir sementara. Konsultasikan dulu, atau batasi kurir pada transaksi tunai.
- **Kode serah-terima** saat ini berupa PIN 4 digit, bukan pindai QR seperti di dokumen.
- Adapter Xendit belum pernah diuji ke Xendit. Nama field callback harus dicocokkan saat uji sandbox.

## 5. Fase 3

- **Notifikasi WhatsApp:** isi `NOTIFY_WEBHOOK_URL` (dan token) dengan gateway pesan pilihanmu, hidupkan `feature.notifications`, lalu panggil `https://DOMAINMU/api/cron/notify?key=CRON_SECRET` tiap menit dari penjadwal luar seperti cron-job.org (cron gratis Vercel hanya harian). Format kiriman generik `{to, message}`; sesuaikan dengan penyedia yang dipilih.
- **Laporan penjualan:** fungsi `store_sales_report` sudah siap. Halamannya belum ada.
- **Ekspansi:** aktifkan kecamatan di tabel `areas` (`is_active`). Filter per kecamatan di layar belum dibuat.

## 6. Bagian dokumen yang di luar sistem

Dokumen juga membahas badan usaha, status kepegawaian, dan kepatuhan hukum. Itu tidak bisa dibangun atau saya nilai di dalam aplikasi. Yang berkaitan langsung dengan sistem: menampung dana pengguna dan memegang deposit kurir bisa tergolong kegiatan yang diatur, jadi pastikan sebelum Fase 2. Saya bukan penasihat hukum.

## 7. Yang sudah dan belum diuji

Seluruh SQL dijalankan pada Postgres sungguhan (pemasangan dari nol, 161 pemeriksaan perilaku lulus). Build Next.js berhasil untuk 31 halaman dan rute. Nama kolom dan fungsi yang dipakai kode dicocokkan dengan database, dan hak akses query dicoba sebagai peran sebenarnya. **Belum teruji:** tampilan dan interaksi di browser, penyimpanan file Supabase asli, dan semua panggilan ke Xendit/Midtrans/TriPay.
