# Pengujian

## Hasil terakhir (dijalankan di lingkungan pengembangan)
| Suite | Cakupan | Hasil |
|---|---|---|
| `tests/backend.test.js` | 108 uji backend (.gs asli) pada simulasi Apps Script: auth, role, pemisahan data publik, CRUD, duplikat, konflik, arsip, geometri, impor/ekspor, rate limit, galat | 108 lulus |
| `tests/shim.test.js` | Simulasi spreadsheet/cache/lock | 6 lulus |
| `tests/demo.test.js` | Mode demo (browser tiruan) | 10 lulus |
| `tests/maplogic.test.js` | Logika peta murni (warna, filter, metrik, validasi geometri) | 13 lulus |
| `tests/ui.test.js` | Chromium + Playwright: dashboard, login per role, inventarisasi, laporan, admin, mobile 390px, CSP | 22 lulus |
| `tests/ui-forms.test.js` | Formulir, validasi, duplikat, impor CSV/GeoJSON, galat API/konfigurasi | 14 lulus |

## Yang BELUM diuji (jujur)
1. **Apps Script sungguhan.** Backend diuji pada simulasi. Perilaku Google (kuota, `UrlFetchApp`, `LockService`, `CacheService`, otorisasi) belum terverifikasi. Lakukan *Smoke test* di bawah.
2. **Leaflet, Leaflet Draw, Turf.js, Chart.js asli.** Lingkungan pengembangan tidak dapat mengunduh pustaka CDN. UI diuji dengan pustaka diblokir (jalur cadangan) dan Leaflet digantikan *stub* hanya untuk memastikan `map.js` tidak melempar galat. **Rendering peta, popup, klik poligon, digitasi, dan grafik belum pernah dilihat dengan pustaka asli.** Versi pustaka dipatok (leaflet 1.9.4, leaflet-draw 1.0.4, turf 6.5.0, chart.js 4.4.1).
3. **Google Sign-In** dengan Client ID nyata.
4. Perangkat mobile nyata (hanya emulasi lebar 390px, tanpa peta).
5. Beban banyak pengguna serentak, dan data skala ribuan bidang.

## Smoke test manual setelah deploy
1. `…/exec?action=healthCheck` → JSON `success:true`.
2. Situs terbuka, Dashboard tampil (angka 0 pada DB kosong).
3. Masuk dengan `ADMIN_EMAIL` → nama dan role tampil; akun lain yang tidak terdaftar ditolak.
4. Tambah petugas, masuk sebagai petugas, tambah 1 bidang → ID `PGR-000001`; baris muncul di sheet.
5. Ubah bidang yang sama dari dua tab → tab kedua mendapat pesan konflik.
6. Peta: batas (setelah impor) tampil, zoom, ganti basemap tidak diperlukan; gambar poligon → luas/keliling tampil → simpan → poligon berwarna muncul; klik → popup lengkap; hover → tooltip.
7. Filter dan pencarian mengubah poligon tampil; tombol kembali ke wilayah.
8. Impor GeoJSON contoh (`data/sample-land.geojson`, sesuaikan id) dan CSV (`data/sample-land.csv`) pada spreadsheet **uji**, bukan produksi.
9. Keluar → buka peta sebagai publik: tanpa nama/NIK/alamat; dengan `PETA_PUBLIK_AKTIF=FALSE` poligon tidak tampil.
10. Periksa response jaringan sebagai publik/petugas: tidak ada NIK penuh/alamat pemilik di luar admin.
11. Matikan jaringan → pesan offline dan tombol *Coba lagi*.
12. Cetak Laporan → tata letak rapi tanpa menu.
13. Cek di Android (Chrome): panel cari/filter, panel detail bawah, legenda, digitasi dengan sentuhan.

## Menjalankan uji otomatis
```bash
node tests/backend.test.js && node tests/shim.test.js && node tests/demo.test.js && node tests/maplogic.test.js
node tools/build-demo-backend.js --check
npm i playwright && npx playwright install chromium   # sekali
node tests/ui.test.js && node tests/ui-forms.test.js
```
