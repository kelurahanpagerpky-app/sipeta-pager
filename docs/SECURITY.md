# Keamanan dan pelindungan data

## Prinsip
- **Backend adalah satu-satunya penegak hak akses.** Menyembunyikan tombol di frontend hanya kenyamanan. Setiap aksi dicek role di server.
- **Login**: Google Sign-In → ID token diverifikasi server (`tokeninfo`: audience = Client ID, issuer, kedaluwarsa, email terverifikasi) → cocok dengan PENGGUNA AKTIF → token sesi acak (hash SHA-256 disimpan di cache, maks. 6 jam). Role tidak pernah dipercaya dari browser.
- **Data pribadi**: publik hanya menerima id_bidang, jenis_surat, status, geometri (jika `PETA_PUBLIK_AKTIF=TRUE`). Petugas menerima NIK tersamar dan tanpa alamat pemilik. Hanya administrator melihat data penuh. Ekspor mengikuti aturan yang sama.
- **Bawaan aman**: peta publik nonaktif; batas belum terverifikasi tersembunyi dari publik.
- **Integritas**: LockService untuk ID dan tulis; deteksi konflik (`expected_updated_at`); validasi geometri dan input di server; ekspor CSV menetralkan sel berawalan `= + - @` (CSV injection); tanpa hapus permanen; log aktivitas.
- **Ketahanan**: pembatasan laju (login gagal, tulis, ekspor); batas ukuran badan permintaan; galat internal tidak membocorkan stack trace.
- **Frontend**: seluruh data dari server dirender dengan `textContent` (anti-XSS); CSP pada `index.html` membatasi sumber skrip/koneksi; `referrer: no-referrer`; token sesi di `sessionStorage`.

## Pelindungan data pribadi (UU No. 27 Tahun 2022)
NIK, nama, dan alamat adalah data pribadi. Tetapkan dasar pemrosesan dan penanggung jawab di kelurahan, batasi akun petugas seperlunya, jangan menerbitkan peta publik dengan data pemilik, simpan cadangan dengan aman, dan hapus akses akun yang tidak lagi bertugas. Tinjauan hukum oleh pihak berwenang tetap diperlukan; dokumen ini bukan nasihat hukum.

## Yang perlu Anda ketahui
- **Google Sheets bukan database publik.** Jangan bagikan spreadsheet. Akses langsung ke spreadsheet melewati seluruh kontrol di atas.
- Web App berakses "Anyone" karena menerima pengunjung publik; keamanan bertumpu pada pemeriksaan di kode.
- ID token Google dikirim ke endpoint resmi Google untuk diverifikasi (memakai URL Fetch).
- Token sesi dapat dicabut dengan logout; menonaktifkan pengguna menghentikan akses pada permintaan berikutnya.
- Laporkan kerentanan ke pengelola aplikasi, bukan di isu publik.
