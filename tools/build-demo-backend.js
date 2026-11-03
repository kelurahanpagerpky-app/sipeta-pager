#!/usr/bin/env node
'use strict';
/**
 * Menghasilkan assets/js/demo-backend.js dari apps-script/*.gs.
 * Mode demo menjalankan kode backend ASLI di browser (dengan layanan simulasi gas-shim.js),
 * sehingga perilaku demo sama dengan produksi. File hasil BUKAN untuk disunting manual.
 *
 * Pemakaian:  node tools/build-demo-backend.js          (tulis file)
 *             node tools/build-demo-backend.js --check  (gagal jika file tidak sinkron)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'apps-script');
const out = path.join(root, 'assets', 'js', 'demo-backend.js');

function build() {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
  const parts = files.map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(dir, f), 'utf8'));
  return [
    '/* DIHASILKAN OTOMATIS oleh tools/build-demo-backend.js dari apps-script/*.gs - JANGAN DISUNTING. */',
    '/* Hanya dimuat pada MODE DEMO. Tidak ada koneksi ke Google. */',
    '(function (global) {',
    "  'use strict';",
    '  var shim = global.SIPETA_GAS_SHIM_ENV;',
    '  if (!shim) throw new Error("SIPETA_GAS_SHIM_ENV belum dibuat");',
    '  var s = shim.services;',
    '  var Logger = s.Logger, PropertiesService = s.PropertiesService, CacheService = s.CacheService, LockService = s.LockService,',
    '      Utilities = s.Utilities, Session = s.Session, SpreadsheetApp = s.SpreadsheetApp, UrlFetchApp = s.UrlFetchApp, ContentService = s.ContentService;',
    parts.join('\n'),
    '  global.SIPETA_DEMO_BACKEND = { handle: handle_, initDatabase: initDatabase, doPost: doPost, doGet: doGet };',
    '})(window);',
    ''
  ].join('\n');
}

const content = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== content) {
    console.error('assets/js/demo-backend.js tidak sinkron dengan apps-script/*.gs. Jalankan: node tools/build-demo-backend.js');
    process.exit(1);
  }
  console.log('demo-backend.js sinkron dengan apps-script/*.gs');
} else {
  fs.writeFileSync(out, content);
  console.log('Ditulis: ' + path.relative(root, out) + ' (' + content.length + ' karakter)');
}
