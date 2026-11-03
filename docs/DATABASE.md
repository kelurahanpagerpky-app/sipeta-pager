# Struktur database (Google Sheets)

Dibuat otomatis oleh `initDatabase()`. Baris 1 = header (dicek setiap pembacaan; header yang berubah memunculkan galat jelas). Jangan ubah urutan/nama kolom, dan jangan menyisipkan kolom di tengah.

## BIDANG_TANAH
id_bidang, nomor_surat, jenis_surat, nama_pemilik, nik, alamat_pemilik, alamat_objek, kelurahan, kecamatan, kota, rt, rw, panjang_meter, lebar_meter, luas_dokumen_m2, luas_peta_m2, tanggal_surat, tanggal_pendataan, penggunaan_tanah, status_inventarisasi, status_verifikasi, status_pemetaan, nomor_persil, nomor_peta_bidang, keterangan, sumber_data, petugas_pendata, created_at, updated_at, **status_arsip** (tambahan: AKTIF/ARSIP).
- `id_bidang` = `PGR-000001`, dibuat server dengan LockService (tanpa duplikat saat akses bersamaan).
- `luas_peta_m2` dihitung dari poligon (rumus bola R=6378137, sama dengan Turf.js); `luas_dokumen_m2` input manual. Keduanya ditampilkan terpisah.
- `status_inventarisasi` LENGKAP/BELUM_LENGKAP dihitung server: LENGKAP bila nomor_surat, jenis_surat, nama_pemilik, nik, alamat_objek, rt, rw, luas_dokumen_m2 (>0), dan tanggal_surat terisi. `status_pemetaan` mengikuti ada/tidaknya poligon. `status_verifikasi` hanya diubah administrator; perubahan data oleh petugas mengembalikannya ke BELUM_DIVERIFIKASI.
- Hapus = arsip (`status_arsip=ARSIP`); data tidak hilang dan dapat dipulihkan.

## GEOMETRI_BIDANG
id_bidang, geojson, sumber_geometri, tanggal_pemetaan, petugas_pemetaan, status_verifikasi_geometri, keterangan_geometri, updated_at. Satu geometri per bidang; GeoJSON Polygon/MultiPolygon WGS84 [bujur, lintang], maks. 48.000 karakter per sel.

## BATAS_WILAYAH
id_batas, nama_wilayah, tingkat_administrasi, geojson, sumber_data, tanggal_data, status_verifikasi, keterangan. Batas **BELUM_DIVERIFIKASI** tidak ditampilkan ke publik.

## PENGGUNA
user_id, nama_pengguna, email, role (ADMINISTRATOR/PETUGAS), status_akun (AKTIF/NONAKTIF), created_at, last_login. Role **hanya** dari sheet ini. Pengunjung publik tidak perlu terdaftar.

## LOG_AKTIVITAS
id_log, timestamp, user_id, aksi, entitas, id_referensi, keterangan, status. Hanya-tambah; tidak mencatat NIK atau isi data pribadi.

## KONFIGURASI
kunci, nilai, keterangan. Kunci: PETA_PUBLIK_AKTIF (bawaan FALSE), JENIS_SURAT, WARNA_LENGKAP, WARNA_BELUM_LENGKAP, WARNA_SHM, WARNA_SPT, WARNA_LAINNYA, WARNA_BELUM_VERIFIKASI, SESSION_JAM. Diubah lewat menu Administrasi (divalidasi server).

## Batas praktis Google Sheets
Maks. 10 juta sel per spreadsheet; sel teks 50.000 karakter. Untuk beberapa ribu bidang, sistem ini memadai. Batas kebijakan di kode: peta 5.000 poligon, ekspor 5.000 baris, impor CSV 500 baris, impor GeoJSON 100 fitur per permintaan.
