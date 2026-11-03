# Keterbatasan dan pengembangan lanjut

- **Bukan alat survei/kadastral.** Luas hasil digitasi adalah perkiraan dari gambar/koordinat; akurasi bergantung pada sumber. Bukan pengganti ukuran BPN dan bukan bukti hak.
- **Luas** dihitung dengan model bola (selisih kecil dibanding elipsoid; relevan untuk bidang kecil bisa diabaikan namun tidak setara hasil ukur resmi).
- **Google Sheets** cocok untuk ribuan baris, bukan puluhan ribu. Ada kuota Apps Script, dan kecepatan bergantung pada Google. Satu geometri maks. 48.000 karakter (poligon sangat rinci perlu disederhanakan).
- **Peta publik penuh** memuat hingga 5.000 poligon sekaligus; bila lebih, perlu pemuatan per area.
- **Tile OSM** memiliki kebijakan penggunaan wajar; untuk lalu lintas tinggi gunakan penyedia tile sendiri.
- **Tanpa mode offline** untuk tulis data (hanya pesan galat yang jelas).
- **Tanpa peninjauan 2 tahap**: satu administrator memverifikasi.
- **Tidak ada topologi antar-bidang** (tumpang tindih bidang tidak dideteksi otomatis).
- **Lampiran dokumen/foto** tidak didukung.
- Pengembangan lanjut: deteksi tumpang tindih, lampiran Drive, impor Shapefile/KML, PWA offline-baca, pelaporan terjadwal, multi-kelurahan.
