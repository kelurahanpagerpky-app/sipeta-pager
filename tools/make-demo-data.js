#!/usr/bin/env node
'use strict';
/**
 * Menghasilkan data DEMONSTRASI (fiktif) untuk SIPETA PAGER:
 *   data/sample-boundary.geojson  - area contoh, BUKAN batas administrasi Kelurahan Pager
 *   data/sample-land.geojson      - poligon contoh, BUKAN lokasi bidang tanah nyata
 *   data/sample-land.csv          - data inventarisasi contoh (nama, nomor surat, NIK fiktif)
 *   assets/js/demo-data.js        - paket yang sama untuk mode demo di browser
 * Semua nama, nomor surat, NIK, dan koordinat adalah karangan.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const NOTE = 'DATA DEMONSTRASI FIKTIF - bukan data tanah, bukan lokasi, dan bukan batas administrasi yang sebenarnya.';

function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]; }
function r7(n) { return Math.round(n * 1e7) / 1e7; }
function fix(ring) { return ring.map(p => [r7(p[0]), r7(p[1])]); }

const X0 = 113.9200, Y0 = -2.2100, DX = 0.0006, DY = 0.0005;
function cell(c, r) { return [X0 + c * DX, Y0 - r * DY]; }

const polys = {};
(function () {
  let [x, y] = cell(0, 0); polys['PGR-000001'] = [fix(rect(x, y - 0.0003, 0.0004, 0.0003))];
  [x, y] = cell(1, 0);     polys['PGR-000002'] = [fix(rect(x, y - 0.00032, 0.00042, 0.00032))];
  [x, y] = cell(2, 0);     polys['PGR-000003'] = [fix([[x, y - 0.0003], [x + 0.00045, y - 0.00028], [x + 0.0004, y], [x + 0.00005, y - 0.00002], [x, y - 0.0003]])];
  [x, y] = cell(3, 0);     polys['PGR-000004'] = [fix(rect(x, y - 0.00028, 0.0004, 0.00028))];
  [x, y] = cell(0, 1);     polys['PGR-000005'] = [fix([[x, y - 0.0003], [x + 0.0004, y - 0.0003], [x + 0.0004, y - 0.00015], [x + 0.00022, y - 0.00015], [x + 0.00022, y], [x, y], [x, y - 0.0003]])];
  [x, y] = cell(1, 1);     polys['PGR-000006'] = [fix(rect(x, y - 0.00027, 0.00038, 0.00027))];
})();

const lands = [
  // [nomor_surat, jenis, nama, nik, alamat_pemilik, alamat_objek, rt, rw, panjang, lebar, luas, tgl_surat, penggunaan, ket, verifikasi]
  ['CONTOH-SPT-001/2025', 'SPT', 'Warga Contoh 1 (DEMO)', '9999000000000001', 'Alamat fiktif A (DEMO)', 'Jalan Contoh Satu, RT 01 (DEMO)', 1, 1, 30, 15, 450, '2025-01-15', 'Pekarangan / rumah tinggal', 'Data contoh. Luas dokumen sengaja berbeda dari luas peta.', true],
  ['CONTOH-SHM-002/2025', 'SHM', 'Warga Contoh 2 (DEMO)', '9999000000000002', 'Alamat fiktif B (DEMO)', 'Jalan Contoh Dua, RT 01 (DEMO)', 1, 1, 42, 30, 1260, '2025-02-03', 'Kebun', 'Data contoh.', true],
  ['CONTOH-SPT-003/2025', 'SPT', 'Warga Contoh 3 (DEMO)', '9999000000000003', 'Alamat fiktif C (DEMO)', 'Jalan Contoh Tiga, RT 02 (DEMO)', 2, 1, '', '', 1500, '2025-02-20', 'Kebun', 'Data contoh: bentuk bidang tidak persegi panjang.', false],
  ['CONTOH-SHM-004/2025', 'SHM', 'Warga Contoh 4 (DEMO)', '', 'Alamat fiktif D (DEMO)', 'Jalan Contoh Empat, RT 02 (DEMO)', 2, 1, '', '', '', '', '', 'Data contoh: belum lengkap (tanpa NIK, luas, dan tanggal surat).', false],
  ['CONTOH-SPT-005/2025', 'SPT', 'Warga Contoh 5 (DEMO)', '9999000000000005', 'Alamat fiktif E (DEMO)', 'Jalan Contoh Lima, RT 03 (DEMO)', 3, 2, '', '', 1900, '2025-03-11', 'Pekarangan', 'Data contoh: bentuk L.', false],
  ['CONTOH-LNY-006/2025', 'LAINNYA', 'Warga Contoh 6 (DEMO)', '9999000000000006', 'Alamat fiktif F (DEMO)', 'Jalan Contoh Enam, RT 03 (DEMO)', 3, 2, 35, 28, 980, '2025-03-30', 'Lahan usaha', 'Data contoh: dokumen jenis lain.', true],
  ['CONTOH-SPT-007/2025', 'SPT', 'Warga Contoh 7 (DEMO)', '9999000000000007', 'Alamat fiktif G (DEMO)', 'Jalan Contoh Tujuh, RT 04 (DEMO)', 4, 2, '', '', '', '2025-04-02', '', 'Data contoh: belum memiliki poligon dan belum lengkap.', false],
  ['CONTOH-SHM-008/2025', 'SHM', 'Warga Contoh 8 (DEMO)', '9999000000000008', 'Alamat fiktif H (DEMO)', 'Jalan Contoh Delapan, RT 04 (DEMO)', 4, 2, 50, 20, 1000, '2025-04-18', 'Pekarangan', 'Data contoh: lengkap, belum memiliki poligon.', true]
];

const header = ['nomor_surat', 'jenis_surat', 'nama_pemilik', 'nik', 'alamat_pemilik', 'alamat_objek', 'rt', 'rw', 'panjang_meter', 'lebar_meter', 'luas_dokumen_m2', 'tanggal_surat', 'penggunaan_tanah', 'keterangan', 'sumber_data'];
function csvCell(v) { v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
const csvRows = [header.join(',')];
const verifiedIds = [];
lands.forEach((l, i) => {
  csvRows.push(l.slice(0, 14).concat(['Data demonstrasi fiktif']).map(csvCell).join(','));
  if (l[14]) verifiedIds.push('PGR-' + String(i + 1).padStart(6, '0'));
});
const csv = csvRows.join('\n') + '\n';

const parcels = {
  type: 'FeatureCollection',
  name: 'sample-land (DEMO)',
  _catatan: NOTE + ' Poligon ini hanya contoh bentuk dan tidak menunjukkan lokasi bidang tanah nyata. Setiap Feature wajib memiliki properties.id_bidang yang sudah ada di database.',
  features: Object.keys(polys).map(id => ({
    type: 'Feature',
    properties: { id_bidang: id, catatan: 'DEMO - bukan lokasi nyata' },
    geometry: { type: 'Polygon', coordinates: polys[id] }
  }))
};

const boundary = {
  type: 'FeatureCollection',
  name: 'sample-boundary (DEMO)',
  _catatan: NOTE + ' Area ini hanyalah persegi panjang contoh. Untuk penggunaan nyata, impor batas resmi Kelurahan Pager dari sumber yang sah (mis. instansi pertanahan/pemerintah daerah).',
  features: [{
    type: 'Feature',
    properties: { nama_wilayah: 'AREA DEMO - BUKAN BATAS KELURAHAN PAGER', sumber_data: 'DATA DEMO - BUKAN BATAS RESMI', status: 'DEMO' },
    geometry: { type: 'Polygon', coordinates: [fix(rect(113.9190, -2.2118, 0.0066, 0.0026))] }
  }]
};

fs.writeFileSync(path.join(root, 'data', 'sample-boundary.geojson'), JSON.stringify(boundary, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data', 'sample-land.geojson'), JSON.stringify(parcels, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data', 'sample-land.csv'), '﻿' + csv);

const pack = { catatan: NOTE, csv: csv, parcels: parcels, boundary: boundary, verifiedIds: verifiedIds };
fs.writeFileSync(path.join(root, 'assets', 'js', 'demo-data.js'),
  '/* DIHASILKAN OTOMATIS oleh tools/make-demo-data.js. ' + NOTE + ' */\nwindow.SIPETA_DEMO_DATA = ' + JSON.stringify(pack) + ';\n');
console.log('Data demo dibuat: ' + lands.length + ' bidang, ' + parcels.features.length + ' poligon, verifikasi: ' + verifiedIds.join(', '));
