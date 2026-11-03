# SIPETA PAGER — Tahap 1: Perancangan Arsitektur dan Struktur Database

Sistem Informasi Pemetaan dan Inventarisasi Tanah Kelurahan Pager, Kecamatan Rakumpit, Kota Palangka Raya.

> Sistem ini adalah alat inventarisasi dan pemetaan **administrasi**. Bukan alat penetapan atau pembuktian hak atas tanah, dan luas hasil pemetaan bukan hasil pengukuran kadastral resmi.

---

## 1. Ringkasan Arsitektur

```
┌──────────────────────┐      HTTPS (fetch)      ┌────────────────────────────┐
│  Frontend statis     │ ──────────────────────► │ Google Apps Script Web App │
│  GitHub Pages        │ ◄────────────────────── │ (satu endpoint, ?action=)  │
│  HTML/CSS/JS         │       JSON              │                            │
│  Leaflet, Turf,      │                         │  Auth → Role → Validasi    │
│  Chart.js            │                         │  → Service → Database      │
└──────────────────────┘                         └──────────────┬─────────────┘
                                                                │ SpreadsheetApp
                                                 ┌──────────────▼─────────────┐
                                                 │ Google Sheets (privat)     │
                                                 │ + CacheService/LockService │
                                                 └────────────────────────────┘
```

Prinsip:

1. Frontend **tidak pernah** menyentuh Google Sheets. Semua baca/tulis lewat Apps Script.
2. Spreadsheet **privat** (hanya pemilik/administrator). Spreadsheet ID disimpan di *Script Properties*, tidak ada di repository.
3. Endpoint dipisah menjadi **publik** (data minimum) dan **terautentikasi** (data pemilik, CRUD, ekspor).
4. Role ditentukan backend dari tabel `PENGGUNA` berdasarkan identitas terverifikasi, tidak pernah dari parameter browser.

## 2. Alur Data

**Peta publik**
1. Browser memuat `index.html` dari GitHub Pages.
2. `api.js` memanggil `getPublicMapData` (tanpa token).
3. Apps Script membaca `GEOMETRI_BIDANG` + kolom aman dari `BIDANG_TANAH` (id, jenis_surat, status), lalu menyimpannya di CacheService.
4. Frontend menggambar poligon dengan Leaflet. Popup publik hanya berisi ID, jenis dokumen, status.

**Detail bidang (terautentikasi)**
1. Pengguna login → mendapat token sesi (lihat bagian 3).
2. Klik poligon → `getLandDetail` dengan token.
3. Backend memverifikasi token → mencari role → menyaring field sesuai role → mengembalikan JSON.

**Tulis data**
1. `createLand` / `updateLand` / `saveGeometry` dengan token.
2. Backend: cek role → validasi → `LockService` → tulis batch → catat `LOG_AKTIVITAS` → hapus cache → balas JSON.

## 3. Desain Autentikasi dan Hak Akses

### Keterbatasan yang harus diakui
- Apps Script Web App yang dipanggil dari domain lain (GitHub Pages) **tidak bisa** menerima header `Authorization` khusus, dan tidak mengatur header CORS sendiri. Maka permintaan dikirim sebagai `GET`/`POST` sederhana (`text/plain`) tanpa preflight.
- Mode deployment "Execute as: me, Access: Anyone" membuat `Session.getActiveUser()` **kosong** untuk pengunjung anonim. Identitas Google tidak otomatis terverifikasi di mode ini.
- Pemeriksaan `Origin` mudah dipalsukan di luar browser, jadi **bukan** pengganti autentikasi.

### Pilihan yang dipakai: Google Sign-In + verifikasi ID token di server
1. Frontend memakai Google Identity Services untuk mendapatkan **ID token** (JWT) pengguna.
2. Frontend mengirim ID token ke `action=login`.
3. Backend memverifikasi token ke endpoint `tokeninfo` Google melalui `UrlFetchApp`: cek `aud` = Client ID milik aplikasi, `exp`, dan `email_verified`.
4. Jika email ada di sheet `PENGGUNA` dengan `status_akun = AKTIF`, backend membuat **token sesi acak** (UUID panjang), menyimpannya di `CacheService` dengan masa berlaku (mis. 6 jam), dan mengembalikannya.
5. Permintaan berikutnya mengirim token sesi di parameter body. Role selalu dibaca ulang dari `PENGGUNA`.

Tidak ada password di JavaScript, tidak ada role dari browser, dan Client ID Google bukan rahasia (aman di frontend). Tidak ada secret di repository.

### Role

| Kemampuan | Publik | Petugas | Administrator |
|---|:-:|:-:|:-:|
| Peta umum, statistik agregat | ✔ | ✔ | ✔ |
| Nama pemilik, detail, pencarian pemilik | ✘ | ✔ | ✔ |
| NIK, alamat pemilik | ✘ | ✘* | ✔ |
| Tambah/ubah data, digitasi | ✘ | ✔ | ✔ |
| Arsipkan | ✘ | ✘ | ✔ |
| Pulihkan, impor/ekspor, ubah verifikasi | ✘ | terbatas | ✔ |
| Kelola pengguna, konfigurasi, lihat log | ✘ | ✘ | ✔ |

\* NIK minimal disamarkan untuk Petugas (mis. 6171••••••••0001); keputusan akhir ada di administrator kelurahan.

## 4. Batas Data Publik

**Boleh publik:** id_bidang, jenis_surat, status_pemetaan, status_inventarisasi (kategori), geometri poligon, batas wilayah yang sudah diverifikasi, statistik agregat.

**Hanya login:** nama pemilik, nomor surat, alamat objek, RT/RW terkait pemilik, panjang/lebar, luas, tanggal, keterangan.

**Hanya administrator:** NIK, alamat pemilik, log aktivitas, konfigurasi, daftar pengguna.

> Catatan kebijakan: poligon bidang tanah yang ditampilkan ke publik bersama ID sudah menunjukkan lokasi bidang. Kelurahan perlu memutuskan apakah poligon boleh publik sepenuhnya atau hanya setelah login. Aplikasi menyediakan konfigurasi `PETA_PUBLIK_AKTIF` di sheet `KONFIGURASI` untuk mengatur ini. Pertimbangkan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## 5. Struktur Database Google Sheets

Satu spreadsheet, enam sheet. Baris 1 = header, ID bukan nomor baris.

**BIDANG_TANAH** (29 kolom):
id_bidang, nomor_surat, jenis_surat, nama_pemilik, nik, alamat_pemilik, alamat_objek, kelurahan, kecamatan, kota, rt, rw, panjang_meter, lebar_meter, luas_dokumen_m2, luas_peta_m2, tanggal_surat, tanggal_pendataan, penggunaan_tanah, status_inventarisasi, status_verifikasi, status_pemetaan, nomor_persil, nomor_peta_bidang, keterangan, sumber_data, petugas_pendata, created_at, updated_at

Tambahan yang saya usulkan: kolom `status_arsip` (AKTIF/ARSIP) karena penghapusan default adalah pengarsipan.

**GEOMETRI_BIDANG**: id_bidang, geojson, sumber_geometri, tanggal_pemetaan, petugas_pemetaan, status_verifikasi_geometri, keterangan_geometri, updated_at (satu geometri aktif per id_bidang; update = timpa baris yang sama, riwayat di log).

**BATAS_WILAYAH**: id_batas, nama_wilayah, tingkat_administrasi, geojson, sumber_data, tanggal_data, status_verifikasi, keterangan. Dibiarkan **kosong** sampai GeoJSON resmi diimpor.

**PENGGUNA**: user_id, nama_pengguna, email, role, status_akun, created_at, last_login.

**LOG_AKTIVITAS**: id_log, timestamp, user_id, aksi, entitas, id_referensi, keterangan, status. Tanpa password/token.

**KONFIGURASI**: kunci, nilai, keterangan. Hanya data non-rahasia (warna kategori, `PETA_PUBLIK_AKTIF`, dll.). Secret (Spreadsheet ID, Google Client ID server) ada di Script Properties.

**ID bidang:** format `PGR-000001`, dibuat backend dengan counter di Script Properties di dalam `LockService`, plus cek duplikasi.

## 6. Keterbatasan Teknis

- GitHub Pages hanya statis; semua logika data ada di Apps Script.
- Kuota Apps Script (waktu eksekusi ±6 menit, jumlah panggilan harian) dan latensi 1–3 detik per panggilan → gunakan cache dan endpoint peta ringan.
- Cache punya batas 100 KB per kunci → data peta dipecah per halaman/chunk.
- Google Sheets cocok sampai kira-kira ribuan bidang; jika melebihi, perlu database sungguhan.
- Respons Web App melewati redirect; `fetch` harus memakai `redirect: "follow"` dan tanpa header khusus.
- Spreadsheet dan data harus dicadangkan rutin (salinan mingguan ke Drive + ekspor CSV).

## 7. Mode Demo vs Produksi

- **Demo:** `CONFIG.MODE = "demo"`, data dari `data/sample-*.geojson` lokal, tidak memanggil backend. Semua data fiktif dan diberi label.
- **Produksi:** `CONFIG.MODE = "production"`, `CONFIG.API_URL` diisi URL Web App. Data dummy tidak pernah dikirim ke spreadsheet.

## 8. Struktur Folder

Mengikuti struktur yang diminta (`index.html`, `assets/css`, `assets/js/{app,map,api,auth,dashboard,inventory,reports,utils}.js`, `data/`, `apps-script/{Code,Config,Database,Auth,LandService,GeometryService}.gs`, `docs/`, `README.md`).

## 9. Rencana Tahap Berikutnya

Tahap 2: backend Apps Script. Urutan file: `Config.gs` → `Database.gs` → `Auth.gs` → `GeometryService.gs` → `LandService.gs` → `Code.gs`. Lalu Tahap 3 frontend.

Belum ada kode yang diuji atau dideploy pada tahap ini.
