# Deployment, pembaruan, pemeliharaan

## GitHub Pages
1. Buat repositori (publik, atau privat jika paket mendukung Pages privat). Unggah isi folder ini (termasuk `.nojekyll`).
2. *Settings → Pages* → Source: *Deploy from a branch* → `main` / root.
3. Situs: `https://<akun>.github.io/<repo>/`. Tambahkan origin ini di OAuth Client ID (INSTALLATION langkah 2).
4. Jangan unggah spreadsheet, ekspor CSV berisi NIK, atau file rahasia ke repositori publik.

## Memperbarui backend
Ubah kode di editor Apps Script → *Deploy → Manage deployments → Edit → New version → Deploy*. URL tidak berubah. Setelah mengubah `apps-script/*.gs` di repositori, jalankan `node tools/build-demo-backend.js` agar mode demo tetap sama.

## Pencadangan (disarankan keras)
- Mingguan: spreadsheet → *File → Buat salinan*, atau tab Administrasi → *Impor & cadangan* → Ekspor CSV lengkap (simpan terenkripsi/di tempat aman; berisi NIK).
- Riwayat versi Google Sheets (*File → Riwayat versi*) membantu pemulihan, tetapi bukan pengganti cadangan terpisah.
- Uji pemulihan sesekali.

## Pemeliharaan
- Tinjau LOG_AKTIVITAS berkala; nonaktifkan akun petugas yang tidak bertugas lagi (Administrasi → Pengguna).
- Pantau kuota Apps Script (eksekusi harian, URL Fetch untuk verifikasi token). Batas ada di dokumentasi Google dan dapat berubah.
- Hindari mengedit sheet manual saat banyak petugas aktif; bila perlu, edit baris data saja dan jangan ubah header.

## Pemecahan masalah
| Gejala | Penyebab/solusi |
|---|---|
| Banner "Alamat API belum diatur" | `API_URL` kosong di config.js |
| "Tidak dapat menghubungi server" | URL salah, deployment tidak "Anyone", atau offline. Buka URL `/exec?action=healthCheck` di browser |
| Login: "Client ID belum diatur" | Isi `GOOGLE_CLIENT_ID` di config.js dan Script Properties |
| Tombol Google tidak muncul / error origin | Origin situs belum ada di OAuth Client ID; pemblokir konten memblokir accounts.google.com |
| "Akun tidak terdaftar" | Email belum ada di PENGGUNA berstatus AKTIF |
| "Spreadsheet belum dikonfigurasi" | `SPREADSHEET_ID` belum diisi / akun pemilik tidak berhak |
| "Struktur sheet tidak sesuai" | Header diubah; kembalikan atau jalankan `initDatabase` pada sheet baru |
| Perubahan kode tak berlaku | Belum membuat *New version* pada deployment |
| Peta kosong | Pustaka Leaflet/tile tak termuat (cek koneksi/CSP) atau belum ada poligon/`PETA_PUBLIK_AKTIF` FALSE untuk publik |
