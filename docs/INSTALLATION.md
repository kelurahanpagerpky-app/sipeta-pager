# Instalasi (produksi)

Perlu: akun Google (pemilik data), akun GitHub, browser. Tidak perlu instal apa pun di komputer.

## 1. Spreadsheet
1. Buat Google Spreadsheet kosong, mis. "SIPETA PAGER DB". Catat **ID** (bagian URL antara `/d/` dan `/edit`).
2. Jangan bagikan spreadsheet ke publik. Hanya akun pemilik yang perlu mengaksesnya (backend berjalan sebagai pemilik).

## 2. Google Cloud: OAuth Client ID (untuk Google Sign-In)
1. console.cloud.google.com → buat proyek → *APIs & Services* → *OAuth consent screen* (External; isi nama aplikasi dan email).
2. *Credentials* → *Create credentials* → *OAuth client ID* → tipe **Web application**.
3. *Authorized JavaScript origins*: `https://<akun>.github.io` (dan `http://localhost:8080` untuk uji lokal). Tanpa path.
4. Salin **Client ID**. 1066788129165-3rh2ptnjter0a8g8mehpu7nkmdcnon1b.apps.googleusercontent.com

## 3. Apps Script
1. Di spreadsheet: *Extensions → Apps Script*. Hapus kode bawaan.
2. Buat file sesuai folder `apps-script/` (Config, Util, Database, Auth, GeometryService, LandService, AdminService, Code — nama bebas, urutan tidak penting) dan tempel isinya. *Project Settings → Show appsscript.json* lalu samakan isinya dengan `apps-script/appsscript.json`.
3. *Project Settings → Script properties*, tambahkan:
   | Kunci | Nilai |
   |---|---|
   | `SPREADSHEET_ID` | ID spreadsheet |
   | `GOOGLE_CLIENT_ID` | Client ID langkah 2 |
   | `ADMIN_EMAIL` | email Google administrator pertama (huruf kecil) |
4. Jalankan fungsi `initDatabase` (pilih di editor → Run) dan setujui izin. Ini membuat 6 sheet dan akun administrator awal. Aman dijalankan ulang.
5. Jalankan `testKoneksi` dan baca *Execution log*; semua baris harus berstatus baik.

## 4. Deploy Web App
*Deploy → New deployment → Web app*: Execute as **Me**, Who has access **Anyone**. Salin URL `/exec`. (Setiap perubahan kode butuh *New version* pada deployment yang sama; URL tetap.)

## 5. Frontend
Ubah `assets/js/config.js`:
```js
MODE: 'production',
API_URL: 'https://script.google.com/macros/s/XXXX/exec',
GOOGLE_CLIENT_ID: 'xxxx.apps.googleusercontent.com',
```
File ini tidak berisi rahasia. Lanjut ke [DEPLOYMENT.md](DEPLOYMENT.md) untuk GitHub Pages.

## 6. Verifikasi
Buka situs → Dashboard menampilkan nol (DB kosong) tanpa galat → *Masuk* dengan akun `ADMIN_EMAIL` → Administrasi → tambahkan petugas → impor batas wilayah resmi → tambahkan data.
Jika galat, lihat bagian "Pemecahan masalah" di [DEPLOYMENT.md](DEPLOYMENT.md).
