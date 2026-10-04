# Marketplace UMKM Taliwang

## Menjalankan di lokal

1. `npm install`
2. Salin `.env.local.example` jadi `.env.local`, isi dengan URL & anon key dari Supabase.
3. **Penting untuk uji coba daftar toko**: di Supabase Dashboard, buka
   Authentication > Providers > Email, lalu matikan opsi **"Confirm email"**.
   Tanpa ini, akun baru tidak langsung punya sesi login aktif dan proses
   pendaftaran toko akan gagal menyimpan profil toko.
4. `npm run dev`
5. Buka http://localhost:3000

## Halaman yang tersedia

- `/` — daftar toko aktif
- `/daftar-toko` — form pendaftaran toko baru (auto buat akun + profil toko)
- `/masuk-toko` — login toko
- `/dashboard-toko` — dashboard toko (terproteksi, redirect ke /masuk-toko kalau belum login)

## Deploy

Project ini dideploy otomatis ke Vercel setiap kali ada push ke branch `main` di GitHub.
