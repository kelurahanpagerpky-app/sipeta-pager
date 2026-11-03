'use strict';
/** Uji logika peta murni. Jalankan: node tests/maplogic.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv } = require('./gas-mock');

const win = {};
const ctx = vm.createContext(Object.assign(win, { Math, JSON, Object, Array, String, Number, Error, isFinite }));
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'maplogic.js'), 'utf8'), ctx);
const ml = ctx.SIPETA.ml;
const J = (x) => JSON.parse(JSON.stringify(x));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✔ ' + name); } catch (e) { failed++; console.log('  ✘ ' + name + '\n      ' + e.message.split('\n')[0]); } }
const SQ = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });

console.log('Logika peta');
test('warna mode kategori: terverifikasi per jenis, selain itu abu-abu', () => {
  const c = ml.DEFAULT_COLORS;
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'SUDAH_DIVERIFIKASI', jenis_surat: 'SHM' }, 'kategori'), c.SHM);
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'SUDAH_DIVERIFIKASI', jenis_surat: 'SPT' }, 'kategori'), c.SPT);
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'SUDAH_DIVERIFIKASI', jenis_surat: 'LAINNYA' }, 'kategori'), c.LAINNYA);
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'BELUM_DIVERIFIKASI', jenis_surat: 'SHM' }, 'kategori'), c.BELUM_VERIFIKASI);
});
test('warna mode inventarisasi: hijau/kuning', () => {
  assert.strictEqual(ml.colorFor({ status_inventarisasi: 'LENGKAP' }, 'inventarisasi'), ml.DEFAULT_COLORS.LENGKAP);
  assert.strictEqual(ml.colorFor({ status_inventarisasi: 'BELUM_LENGKAP' }, 'inventarisasi'), ml.DEFAULT_COLORS.BELUM_LENGKAP);
});
test('warna dapat dikonfigurasi; nilai tidak valid diganti bawaan (tidak ada injeksi CSS)', () => {
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'SUDAH_DIVERIFIKASI', jenis_surat: 'SHM' }, 'kategori', { SHM: '#112233' }), '#112233');
  assert.strictEqual(ml.colorFor({ status_verifikasi: 'SUDAH_DIVERIFIKASI', jenis_surat: 'SHM' }, 'kategori', { SHM: 'red;background:url(x)' }), ml.DEFAULT_COLORS.SHM);
});
test('legenda sesuai mode dan jumlah kategori', () => {
  assert.strictEqual(ml.legend('kategori').length, 4);
  assert.strictEqual(ml.legend('inventarisasi').length, 2);
});
test('filter fitur', () => {
  const p = { jenis_surat: 'SPT', status_inventarisasi: 'LENGKAP', status_verifikasi: 'BELUM_DIVERIFIKASI', status_pemetaan: 'SUDAH_DIPETAKAN', rt: '1', rw: '2' };
  assert.ok(ml.passes(p, {}));
  assert.ok(ml.passes(p, { jenis: 'SPT', rt: '1' }));
  assert.ok(!ml.passes(p, { jenis: 'SHM' }));
  assert.ok(!ml.passes(p, { ver: 'SUDAH_DIVERIFIKASI' }));
  assert.ok(!ml.passes(p, { rw: '3' }));
  assert.ok(ml.passes(Object.assign({}, p, { rt: 1 }), { rt: '1' }));
  assert.strictEqual(ml.activeFilterCount({ jenis: 'SPT', rt: '1', rw: '' }), 2);
  assert.deepStrictEqual(J(ml.apiFilters({ jenis: 'SPT', pet: 'BELUM_DIPETAKAN' })), { jenis_surat: 'SPT', status_pemetaan: 'BELUM_DIPETAKAN' });
});
test('luas & keliling (rumus bola) cocok dengan backend untuk poligon yang sama', () => {
  const env = createEnv(); env.run('initDatabase()');
  const t = env.login('admin@example.test');
  const id = env.call('createLand', t, { land: { jenis_surat: 'SPT', nama_pemilik: 'Uji' } }).data.land.id_bidang;
  const shapes = [SQ(113.9, -2.2, 0.001), { type: 'Polygon', coordinates: [[[113.92, -2.21], [113.9245, -2.2098], [113.9241, -2.2065], [113.9203, -2.2069], [113.92, -2.21]]] }];
  shapes.forEach(g => {
    const be = env.call('saveGeometry', t, { id_bidang: id, geojson: g }).data.metrics;
    const fe = ml.metrics(g);
    assert.ok(Math.abs(fe.luas_m2 - be.luas_m2) < 0.05, 'luas ' + fe.luas_m2 + ' vs ' + be.luas_m2);
    assert.ok(Math.abs(fe.keliling_m - be.keliling_m) < 0.05, 'keliling ' + fe.keliling_m + ' vs ' + be.keliling_m);
    assert.strictEqual(fe.titik, be.jumlah_titik);
  });
});
test('panjang tiap sisi: 4 sisi untuk persegi, jumlah = keliling', () => {
  const m = ml.metrics(SQ(113.9, -2.2, 0.001));
  assert.strictEqual(m.sisi.length, 4);
  assert.ok(Math.abs(m.sisi.reduce((a, s) => a + s.panjang_m, 0) - m.keliling_m) < 0.05);
  assert.strictEqual(m.sisi[3].ke, 1);
  assert.ok(Math.abs(m.luas_ha * 10000 - m.luas_m2) < 1, 'luas_ha dibulatkan 4 desimal (resolusi 1 m2)');
});
test('luas poligon berlubang < luar; MultiPolygon dijumlah', () => {
  const outer = SQ(113.9, -2.2, 0.002).coordinates[0];
  const hole = SQ(113.9005, -2.1995, 0.0005).coordinates[0];
  const full = ml.metrics({ type: 'Polygon', coordinates: [outer] }).luas_m2;
  const holed = ml.metrics({ type: 'Polygon', coordinates: [outer, hole] }).luas_m2;
  assert.ok(holed < full * 0.95);
  const mp = ml.metrics({ type: 'MultiPolygon', coordinates: [SQ(113.9, -2.2, 0.001).coordinates, SQ(113.95, -2.2, 0.001).coordinates] }).luas_m2;
  assert.ok(Math.abs(mp - 2 * ml.metrics(SQ(113.9, -2.2, 0.001)).luas_m2) / mp < 0.01);
});
test('validasi geometri di klien menangkap kasus yang juga ditolak backend', () => {
  const bad = {
    point: { type: 'Point', coordinates: [113.9, -2.2] },
    dua: { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.2]]] },
    segaris: { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.2], [113.902, -2.2], [113.9, -2.2]]] },
    bowtie: { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.201], [113.901, -2.2], [113.9, -2.201], [113.9, -2.2]]] },
    tertukar: { type: 'Polygon', coordinates: [[[-2.2, 113.9], [-2.2, 113.901], [-2.201, 113.901], [-2.2, 113.9]]] },
    luar: SQ(2.35, 48.85, 0.001),
    terbuka: { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.2], [113.901, -2.201], [113.9, -2.201]]] },
    nol: { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.9, -2.2], [113.9, -2.2], [113.9, -2.2]]] },
    nan: { type: 'Polygon', coordinates: [[[113.9, -2.2], ['a', -2.2], [113.9, -2.201], [113.9, -2.2]]] }
  };
  Object.keys(bad).forEach(k => assert.ok(ml.validateGeometry(bad[k]).length > 0, k + ' seharusnya ditolak'));
  assert.deepStrictEqual(J(ml.validateGeometry(SQ(113.9, -2.2, 0.001))), []);
  assert.deepStrictEqual(J(ml.validateGeometry({ type: 'Feature', properties: {}, geometry: SQ(113.9, -2.2, 0.001) })), []);
  assert.ok(ml.validateGeometry(null).length);
});
test('validasi klien konsisten dengan backend pada data demo', () => {
  const fc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sample-land.geojson'), 'utf8'));
  fc.features.forEach(f => assert.deepStrictEqual(J(ml.validateGeometry(f)), [], f.properties.id_bidang));
});
test('extractSingleGeometry: Feature, FeatureCollection 1 fitur, geometri; selain itu galat', () => {
  assert.strictEqual(ml.extractSingleGeometry({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: SQ(113.9, -2.2, 0.1) }] }).type, 'Feature');
  assert.strictEqual(ml.extractSingleGeometry(SQ(113.9, -2.2, 0.1)).type, 'Polygon');
  assert.throws(() => ml.extractSingleGeometry({ type: 'FeatureCollection', features: [] }), /tepat 1 fitur/);
  assert.throws(() => ml.extractSingleGeometry({ type: 'Point' }), /tidak didukung/);
  assert.throws(() => ml.extractSingleGeometry(null));
});
test('toLatLngs menukar urutan ke [lat, lon]', () => {
  assert.deepStrictEqual(J(ml.toLatLngs([[113.9, -2.2], [114, -2.3]])), [[-2.2, 113.9], [-2.3, 114]]);
});
test('resultLine: publik hanya jenis; petugas lengkap', () => {
  const it = { jenis_surat: 'SPT', nomor_surat: 'N1', nama_pemilik: 'X' };
  assert.strictEqual(ml.resultLine(it, false), 'SPT');
  assert.strictEqual(ml.resultLine(it, true), 'SPT · N1 · X');
});

console.log('\nLulus: ' + passed + '  Gagal: ' + failed);
if (failed) process.exit(1);
