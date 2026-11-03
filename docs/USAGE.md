# Panduan penggunaan

## Pengunjung (tanpa masuk)
Dashboard (statistik ringkas), Peta (jika administrator mengaktifkan peta publik), Inventarisasi (hanya ID, jenis dokumen, status). Tidak ada data pribadi.

## Masuk
Tombol **Masuk** (kanan atas) → akun Google terdaftar. Mode demo: pilih Petugas atau Administrator.

## Petugas
**Tambah data**: Inventarisasi → *Tambah bidang*. Wajib disimpan: jenis surat dan nama pemilik. Status **Lengkap** baru berlaku bila nomor surat, jenis surat, nama pemilik, NIK, alamat objek, RT, RW, luas dokumen (>0), dan tanggal surat semua terisi; selain itu "Belum lengkap". Peringatan muncul bila nomor surat sudah ada.
**Ubah/arsip**: tombol di baris atau panel detail. Jika orang lain mengubah data yang sama, muncul pesan konflik: muat ulang lalu ulangi.
**Menggambar poligon**: panel detail → *Gambar poligon* (membuka Peta mode digitasi) → gambar → periksa luas, keliling, koordinat, panjang sisi → *Simpan*. Luas hasil pemetaan dihitung otomatis dan **tidak menimpa** luas dokumen.
**Cari/filter**: kolom pencarian di Peta dan Inventarisasi; filter jenis, status, RT/RW.
**Laporan**: menu Laporan → Ekspor CSV atau Cetak (hasil cetak memakai tata letak khusus).

## Administrator
Menu **Administrasi**:
- *Pengguna*: tambah/ubah/nonaktifkan; tidak bisa menurunkan diri sendiri; minimal satu administrator aktif.
- *Konfigurasi*: peta publik (konfirmasi saat diaktifkan), jenis dokumen, warna, masa sesi.
- *Batas wilayah*: impor GeoJSON dari sumber resmi (sumber data wajib dicatat), ubah status verifikasi.
- *Impor & cadangan*: impor CSV (pratinjau → simpan; baris tak valid ditolak dengan nomor baris), impor GeoJSON poligon (cocok dengan `properties.id_bidang`), ekspor lengkap.
- *Log aktivitas*: riwayat perubahan.
Verifikasi administratif: ubah *Status verifikasi* pada formulir bidang. Ini bersifat administratif, bukan kepastian hukum hak atas tanah.

## Format impor
**CSV** (UTF-8): header minimal `jenis_surat,nama_pemilik`; kolom lain sesuai DATABASE.md; templat tersedia di dialog impor. Maks. 500 baris.
**GeoJSON poligon**: FeatureCollection; tiap fitur Polygon/MultiPolygon WGS84 `[bujur, lintang]`, `properties.id_bidang` sudah ada. Ring harus tertutup, ≥ 3 titik berbeda, tidak berpotongan sendiri.
**GeoJSON batas**: satu Polygon/MultiPolygon.

## Kategori warna peta
Bawaan: SHM terverifikasi (biru), SPT terverifikasi (oranye), dokumen lain terverifikasi (ungu), belum diverifikasi (abu-abu); mode alternatif: data lengkap (hijau)/belum lengkap (kuning). Dapat diubah di Konfigurasi. Warna menunjukkan status administrasi, bukan keabsahan hukum.
