# Web app pembeli dan rencana peta kiriman

## Web app

Situs ini sudah mempunyai manifest, ikon dan tampilan responsif. Pembeli bisa membuka alamat situs di Chrome Android dan memilih menu **Tambahkan ke layar utama** / **Instal aplikasi**; di Safari iPhone gunakan **Bagikan → Tambah ke Layar Utama**. Nama menu bergantung pada versi perangkat. Saat ini ini adalah web app yang bisa ditambahkan ke layar utama, bukan aplikasi native di Play Store/App Store. Tidak ada service worker atau dukungan offline; katalog dan pesanan memerlukan internet. Uji pada perangkat dan domain HTTPS sebelum diumumkan.

Pada fase awal, pesanan melalui WhatsApp. Checkout, QRIS dan kurir masih di belakang saklar fitur dan belum siap diaktifkan sampai pembayaran, otorisasi, dan settlement diuji menyeluruh.

## Peta dan pelacakan

- Checkout sudah bisa meminta lokasi pembeli atas persetujuan; alamat tetap diperlukan jika GPS gagal. Perhitungan jarak di SQL menggunakan garis lurus, **bukan** jarak jalan atau estimasi waktu tiba.
- Halaman pesanan bisa menampilkan tautan Google Maps jika menerima lokasi kurir. Namun belum ada pengiriman lokasi kurir dari aplikasi: fitur pelacakan langsung **belum berjalan**. Jangan menjanjikan tracking real-time.
- Tahap berikutnya: kurir secara sadar menyalakan berbagi lokasi hanya selama pengantaran aktif, server memverifikasi identitas, penugasan dan status pesanan sebelum menyimpan titik; berhenti saat selesai/dibatalkan atau dibatalkan kurir. Batasi frekuensi, ketelitian dan retensi, tampilkan waktu pembaruan dan indikasi lokasi usang, serta tangani izin GPS ditolak/koneksi putus. Jangan mengandalkan tracking di latar belakang browser; dukungan dan pembatasan perangkat berbeda.
- Lokasi hanya boleh diakses pembeli yang berhak atas pesanan tersebut dan pihak operasional yang berwenang; mekanisme kode pesanan + nomor telepon saat ini perlu audit perlindungan brute force sebelum digunakan untuk lokasi. Uji isolasi antar-pesanan, kebocoran data dan race condition sebelum peluncuran.
- Mulai dengan status pesanan + tautan peta sederhana. Jika butuh ETA/rute jalan, evaluasi penyedia peta untuk cakupan jalan di KSB, batas gratis, biaya, lisensi, privasi dan keandalan jaringan. Geolocation browser sendiri tidak memerlukan API key, sedangkan layanan peta/rute dapat memerlukan akun dan biaya.

## Prioritas kinerja dan navigasi

Ukur Core Web Vitals pada perangkat dan jaringan nyata sebelum menetapkan target. Periksa ukuran gambar dan thumbnail, waktu respons Supabase, serta dampak query katalog dan pagination saat volume bertambah. Beranda sekarang menjalankan beberapa query independen bersamaan; ini belum merupakan hasil benchmark. Tambahkan uji aksesibilitas keyboard, ukuran sentuh, dan pengujian bersama pembeli/toko lokal sebelum mendesain ulang lebih luas.
