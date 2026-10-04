# Marketplace UMKM Taliwang

## Menjalankan di lokal

1. `npm install`
2. Salin `.env.local.example` jadi `.env.local`, isi dengan URL & anon key dari Supabase.
3. `npm run dev`
4. Buka http://localhost:3000 — kalau koneksi berhasil, halaman akan menampilkan daftar toko aktif (atau pesan "belum ada toko" kalau database masih kosong).

## Deploy

Project ini dideploy otomatis ke Vercel setiap kali ada push ke branch `main` di GitHub.
