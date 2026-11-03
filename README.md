# SIPETA PAGER
Sistem Informasi Inventarisasi dan Pemetaan Tanah Masyarakat — **Kelurahan Pager, Kecamatan Rakumpit, Kota Palangka Raya**.

Aplikasi web GIS statis (GitHub Pages) dengan backend Google Apps Script dan database Google Sheets. Tanpa server berbayar, tanpa Node/PHP/MySQL/Firebase pada produksi.

## Fitur
- **Dashboard**: statistik dari backend + 3 grafik (jenis surat, status inventarisasi, RT/RW).
- **Peta** (Leaflet + OpenStreetMap): batas wilayah, poligon bidang berwarna menurut kategori, popup/tooltip, legenda, pencarian, filter, digitasi (Leaflet Draw, luas m²/ha, keliling, koordinat), impor/ekspor GeoJSON.
- **Inventarisasi**: tabel server-side (sort, paginasi, filter), tambah/ubah, arsip/pulihkan (tidak ada hapus permanen), riwayat, ekspor CSV, impor CSV.
- **Laporan**: rekap per jenis dan RT/RW, ekspor CSV, cetak.
- **Administrasi**: pengguna, konfigurasi (peta publik, warna, jenis dokumen), batas wilayah, impor, log aktivitas.
- **Role**: Administrator, Petugas, Publik — diperiksa di **backend** pada setiap permintaan.
- **Mode demo** dan **mode produksi** (`assets/js/config.js`).

## Mulai cepat (demo, tanpa instalasi)
```bash
python3 -m http.server 8080     # dari folder ini
# buka http://localhost:8080
```
Mode demo menjalankan backend asli di browser dengan spreadsheet simulasi. Semua data **fiktif**; batas "AREA DEMO" **bukan** batas Kelurahan Pager. Data hilang saat halaman dimuat ulang.

## Produksi
Ikuti [docs/INSTALLATION.md](docs/INSTALLATION.md) lalu [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Dokumentasi
| Berkas | Isi |
|---|---|
| [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) | Arsitektur, alur data, desain autentikasi |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Pemasangan langkah demi langkah |
| [docs/DATABASE.md](docs/DATABASE.md) | Struktur 6 sheet |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy, pembaruan, pencadangan, pemeliharaan |
| [docs/SECURITY.md](docs/SECURITY.md) | Keamanan dan pelindungan data pribadi |
| [docs/USAGE.md](docs/USAGE.md) | Panduan penggunaan |
| [docs/TESTING.md](docs/TESTING.md) | Daftar pengujian, **apa yang sudah dan belum diuji** |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Keterbatasan dan pengembangan lanjut |

## Struktur folder
```
index.html
assets/css/style.css
assets/js/    config, utils, api, demo*, auth, maplogic, detail, inventory, map, dashboard, reports, admin, app
apps-script/  Config, Util, Database, Auth, GeometryService, LandService, AdminService, Code (.gs) + appsscript.json
data/         contoh GeoJSON/CSV FIKTIF
tools/        build-demo-backend.js, make-demo-data.js
tests/        uji otomatis
docs/
```
`assets/js/demo-backend.js` dihasilkan dari `apps-script/*.gs` — jalankan `node tools/build-demo-backend.js` setelah mengubah backend (`--check` untuk verifikasi).

## Pengujian
```bash
node tests/backend.test.js && node tests/shim.test.js && node tests/demo.test.js && node tests/maplogic.test.js
node tools/build-demo-backend.js --check
node tests/ui.test.js && node tests/ui-forms.test.js   # perlu playwright + chromium
```
Baca [docs/TESTING.md](docs/TESTING.md): backend diuji pada **simulasi** Apps Script, bukan layanan Google sungguhan.

## Catatan penting
- Tidak ada batas wilayah, koordinat bidang, nomor surat, atau nama pemilik asli yang disertakan. Impor data resmi dari sumber yang sah.
- Status verifikasi bersifat administratif, **bukan** kepastian hukum hak atas tanah.
- Tile OpenStreetMap tunduk pada [kebijakan penggunaan tile OSM](https://operations.osmfoundation.org/policies/tiles/); untuk lalu lintas tinggi gunakan penyedia tile sendiri.
