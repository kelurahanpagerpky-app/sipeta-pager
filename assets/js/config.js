/**
 * SIPETA PAGER - config.js
 * SATU-SATUNYA file yang perlu diubah untuk menghubungkan frontend ke backend.
 * File ini aman dipublikasikan: tidak boleh berisi rahasia.
 *  - API_URL          : URL Web App Google Apps Script (berakhiran /exec). Bukan rahasia.
 *  - GOOGLE_CLIENT_ID : OAuth Client ID (tipe Web application). Bukan rahasia.
 * JANGAN menaruh Spreadsheet ID, password, atau kunci API di sini.
 */
window.SIPETA_CONFIG = {
  // "demo"       = data fiktif lokal, tidak memanggil backend, tidak menulis ke spreadsheet.
  // "production" = membaca/menulis data nyata melalui Google Apps Script.
  MODE: 'demo',

  API_URL: 'https://script.google.com/macros/s/AKfycbzr48qRwS-yu7Emeu3kFc7iCBFtwKzgWzqpddONE7luMqxzFcSR3gF8l1kN_5pZe4hK/exec',
  GOOGLE_CLIENT_ID: '1066788129165-3rh2ptnjter0a8g8mehpu7nkmdcnon1b.apps.googleusercontent.com',

  // Tampilan awal peta jika batas wilayah belum diimpor (BUKAN batas administrasi).
  MAP_DEFAULT_CENTER: [-2.21, 113.92],
  MAP_DEFAULT_ZOOM: 12,

  REQUEST_TIMEOUT_MS: 30000
};
