'use strict';
/**
 * Menguji MODE DEMO apa adanya: memuat demo.js + gas-shim.js + demo-backend.js + demo-data.js
 * seperti yang dilakukan browser (lewat document.createElement('script') tiruan yang memuat berkas nyata).
 * Jalankan: node tests/demo.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let passed = 0, failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

function makeBrowser() {
  const win = {};
  const sandbox = {
    console, setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number, Error, TypeError, RegExp, Map, Promise,
    parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent, unescape, escape, crypto: require('crypto').webcrypto,
    TextEncoder
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  sandbox.document = {
    head: {
      appendChild(s) {
        const file = path.join(root, s.src);
        setTimeout(() => {
          try { vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: s.src }); s.onload && s.onload(); }
          catch (e) { console.error('Gagal memuat ' + s.src + ': ' + e.message); s.onerror && s.onerror(e); }
        }, 0);
      }
    },
    createElement() { return {}; }
  };
  const ctx = vm.createContext(sandbox);
  ['assets/js/config.js', 'assets/js/gas-shim.js', 'assets/js/demo.js'].forEach(f => {
    // utils/api tidak diperlukan oleh demo.js; SIPETA dibuat oleh demo.js sendiri
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

const B = makeBrowser();
const call = async (action, token, params) => JSON.parse(JSON.stringify(await B.SIPETA.demo.handle(action, token, params || {})));
async function login(role) {
  const r = await call('login', null, { idToken: B.SIPETA.demo.idTokenFor(role) });
  assert.ok(r.success, JSON.stringify(r));
  return r.data.token;
}

test('file hasil build sinkron dengan sumber (.gs dan data demo)', () => {
  execFileSync('node', [path.join(root, 'tools', 'build-demo-backend.js'), '--check'], { stdio: 'pipe' });
});
test('penyiapan demo selesai tanpa galat', async () => {
  await B.SIPETA.demo.init();
});
test('dashboard demo: 8 bidang, 6 dipetakan, 2 belum, angka dihitung backend', async () => {
  const r = await call('getDashboardStats', null);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.total, 8);
  assert.strictEqual(r.data.dipetakan, 6);
  assert.strictEqual(r.data.belum_dipetakan, 2);
  assert.strictEqual(r.data.spt, 4);
  assert.strictEqual(r.data.shm, 3);
  assert.ok(r.data.belum_lengkap >= 2);
  assert.ok(r.data.perlu_verifikasi >= 1);
});
test('publik: peta berisi 6 poligon tanpa data pribadi; batas belum diverifikasi disembunyikan', async () => {
  const m = await call('getPublicMapData', null);
  assert.strictEqual(m.data.features.length, 6);
  const s = JSON.stringify(m);
  ['Warga Contoh', '9999000', 'CONTOH-SPT', 'alamat'].forEach(x => assert.ok(s.indexOf(x) < 0, x));
  const b = await call('getBoundary', null);
  assert.strictEqual(b.data.boundary, null);
  assert.ok(b.data.message);
});
test('petugas demo melihat batas (belum diverifikasi, berlabel demo) dan nama pemilik', async () => {
  const t = await login('PETUGAS');
  const b = await call('getBoundary', t);
  assert.ok(b.data.boundary);
  assert.strictEqual(b.data.boundary.status_verifikasi, 'BELUM_DIVERIFIKASI');
  assert.ok(/DEMO/.test(b.data.boundary.sumber_data));
  const d = await call('getLandDetail', t, { id_bidang: 'PGR-000001' });
  assert.ok(/Warga Contoh 1/.test(d.data.land.nama_pemilik));
  assert.ok(/•/.test(d.data.land.nik));
  assert.ok(d.data.perbandingan_luas, 'luas dokumen vs luas peta harus tersedia');
  assert.ok(d.data.land.luas_peta_m2 > 1000, 'luas peta dihitung dari poligon');
  assert.strictEqual(d.data.land.luas_dokumen_m2, 450);
});
test('admin demo: NIK asli; tidak bisa menulis ke spreadsheet produksi (tidak ada koneksi)', async () => {
  const t = await login('ADMINISTRATOR');
  const d = await call('getLandDetail', t, { id_bidang: 'PGR-000001' });
  assert.strictEqual(d.data.land.nik, '9999000000000001');
  const r = await call('createLand', t, { land: { jenis_surat: 'SPT', nama_pemilik: 'Uji Demo', nomor_surat: 'X-1' } });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.land.id_bidang, 'PGR-000009');
});
test('bidang tanpa poligon tetap terinventarisasi (PGR-000007, 000008)', async () => {
  const t = await login('PETUGAS');
  const s = await call('searchLand', t, { status_pemetaan: 'BELUM_DIPETAKAN' });
  const ids = s.data.items.map(i => i.id_bidang);
  assert.ok(ids.indexOf('PGR-000007') >= 0 && ids.indexOf('PGR-000008') >= 0);
});
test('data demo (CSV/GeoJSON) valid untuk latihan impor pada backend nyata', async () => {
  const t = await login('ADMINISTRATOR');
  const csv = fs.readFileSync(path.join(root, 'data', 'sample-land.csv'), 'utf8');
  const p = await call('importCSV', t, { csv, mode: 'preview', abaikan_duplikat: true });
  assert.strictEqual(p.data.invalid, 0, JSON.stringify(p.data.errors));
  const fc = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sample-land.geojson'), 'utf8'));
  const g = await call('importGeoJSON', t, { featureCollection: fc, mode: 'preview' });
  assert.strictEqual(g.data.invalid, 0, JSON.stringify(g.data.errors));
  assert.strictEqual(g.data.valid, 6);
});
test('data demo diberi label fiktif; tidak ada klaim batas resmi', () => {
  const all = ['data/sample-boundary.geojson', 'data/sample-land.geojson', 'data/sample-land.csv'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  assert.ok(/BUKAN BATAS|bukan batas/i.test(all));
  assert.ok(/DEMO/.test(all));
  const b = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sample-boundary.geojson'), 'utf8'));
  assert.ok(/BUKAN BATAS KELURAHAN PAGER/.test(b.features[0].properties.nama_wilayah));
});
test('data demo hanya berisi nama/nomor/NIK fiktif', () => {
  const csv = fs.readFileSync(path.join(root, 'data', 'sample-land.csv'), 'utf8');
  csv.split('\n').slice(1).filter(Boolean).forEach(line => {
    assert.ok(/CONTOH/.test(line) && /DEMO/.test(line), 'baris tidak berlabel contoh: ' + line.slice(0, 40));
  });
});

(async () => {
  console.log('Mode demo (backend asli di browser tiruan)');
  for (const t of pending) {
    try { await t.fn(); passed++; console.log('  ✔ ' + t.name); }
    catch (e) { failed++; console.log('  ✘ ' + t.name + '\n      ' + String(e.message).split('\n')[0]); }
  }
  console.log('\nLulus: ' + passed + '  Gagal: ' + failed);
  if (failed) process.exit(1);
})();
