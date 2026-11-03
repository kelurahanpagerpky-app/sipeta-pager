'use strict';
/** Uji backend SIPETA PAGER. Jalankan: node tests/backend.test.js */
const assert = require('assert');
const { createEnv } = require('./gas-mock');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔ ' + name); }
  catch (e) { failed++; failures.push(name + ' -> ' + e.message); console.log('  ✘ ' + name + '\n      ' + e.message.split('\n')[0]); }
}
function section(t) { console.log('\n' + t); }

const SQUARE = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
const OWNER = 'Budi Fiktif Contoh';
const NIK = '6271000000000001';

const env = createEnv();
const call = env.call;

section('1. Konfigurasi & inisialisasi');
test('semua file .gs termuat (urutan alfabet) tanpa galat', () => {
  assert.ok(env.files.length >= 8, env.files.join(','));
});
test('healthCheck sebelum database dibuat: tidak crash, database=false', () => {
  const r = call('healthCheck', null, {}, true);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.konfigurasi.spreadsheet, true);
  assert.strictEqual(r.data.konfigurasi.database, false);
});
test('aksi data sebelum initDatabase -> NOT_INITIALIZED (bukan crash)', () => {
  const r = call('getDashboardStats', null, {});
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.errorCode, 'NOT_INITIALIZED');
  assert.ok(!/at |\.gs:/.test(JSON.stringify(r)), 'tidak boleh ada stack trace');
});
test('initDatabase membuat 6 sheet, header benar, admin awal', () => {
  env.run('initDatabase()');
  assert.deepStrictEqual(Object.keys(env.ss.sheets).sort(), ['BATAS_WILAYAH', 'BIDANG_TANAH', 'GEOMETRI_BIDANG', 'KONFIGURASI', 'LOG_AKTIVITAS', 'PENGGUNA']);
  assert.strictEqual(env.ss.sheets.BIDANG_TANAH.data[0].length, 30);
  assert.strictEqual(env.ss.sheets.PENGGUNA.data[1][2], 'admin@example.test');
});
test('initDatabase idempotent (tanpa duplikasi)', () => {
  env.run('initDatabase()');
  assert.strictEqual(env.ss.sheets.PENGGUNA.getLastRow(), 2);
  assert.strictEqual(env.ss.sheets.KONFIGURASI.getLastRow(), 10);
});
test('SPREADSHEET_ID salah -> NOT_CONFIGURED', () => {
  env.failOpen = true;
  const r = call('getDashboardStats', null, {});
  env.failOpen = false;
  assert.strictEqual(r.errorCode, 'NOT_CONFIGURED');
});
test('SPREADSHEET_ID kosong -> NOT_CONFIGURED', () => {
  const keep = env.props.SPREADSHEET_ID; delete env.props.SPREADSHEET_ID;
  const r = call('getDashboardStats', null, {});
  env.props.SPREADSHEET_ID = keep;
  assert.strictEqual(r.errorCode, 'NOT_CONFIGURED');
});

section('2. Autentikasi');
test('token Google dengan aud salah ditolak', () => {
  const t = env.addIdToken('x.y.z1aaaaaaaaaaaaaaaaaaa', 'admin@example.test', { aud: 'orang-lain' });
  const r = call('login', null, { idToken: t });
  assert.strictEqual(r.errorCode, 'UNAUTHENTICATED');
});
test('token kedaluwarsa ditolak', () => {
  const t = env.addIdToken('x.y.z2aaaaaaaaaaaaaaaaaaa', 'admin@example.test', { exp: String(Math.floor(Date.now() / 1000) - 10) });
  assert.strictEqual(call('login', null, { idToken: t }).errorCode, 'UNAUTHENTICATED');
});
test('email belum terverifikasi ditolak', () => {
  const t = env.addIdToken('x.y.z3aaaaaaaaaaaaaaaaaaa', 'admin@example.test', { email_verified: 'false' });
  assert.strictEqual(call('login', null, { idToken: t }).errorCode, 'UNAUTHENTICATED');
});
test('token palsu/tidak dikenal ditolak', () => {
  assert.strictEqual(call('login', null, { idToken: 'aaa.bbb.cccccccccccccccccccccc' }).errorCode, 'UNAUTHENTICATED');
});
test('format token tidak valid -> VALIDATION_ERROR', () => {
  assert.strictEqual(call('login', null, { idToken: 'pendek' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('login', null, {}).errorCode, 'VALIDATION_ERROR');
});
test('Google valid tetapi email tidak terdaftar -> FORBIDDEN', () => {
  const t = env.addIdToken('x.y.z4aaaaaaaaaaaaaaaaaaa', 'orangasing@example.test');
  assert.strictEqual(call('login', null, { idToken: t }).errorCode, 'FORBIDDEN');
});
let ADMIN, PETUGAS;
test('admin login sukses, role dari sheet', () => {
  ADMIN = env.login('admin@example.test');
  const r = call('getCurrentUser', ADMIN, {});
  assert.strictEqual(r.data.role, 'ADMINISTRATOR');
  assert.strictEqual(r.data.authenticated, true);
});
test('admin menambah petugas; petugas login', () => {
  const r = call('saveUser', ADMIN, { email: 'Petugas@Example.test', nama_pengguna: 'Petugas Satu', role: 'PETUGAS' });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  PETUGAS = env.login('petugas@example.test');
  assert.strictEqual(call('getCurrentUser', PETUGAS, {}).data.role, 'PETUGAS');
});
test('akun NONAKTIF tidak bisa login dan sesi lama dicabut', () => {
  call('saveUser', ADMIN, { email: 'nonaktif@example.test', nama_pengguna: 'Non Aktif', role: 'PETUGAS' });
  const tok = env.login('nonaktif@example.test');
  assert.strictEqual(call('getCurrentUser', tok, {}).success, true);
  call('saveUser', ADMIN, { email: 'nonaktif@example.test', nama_pengguna: 'Non Aktif', role: 'PETUGAS', status_akun: 'NONAKTIF' });
  assert.strictEqual(call('getCurrentUser', tok, {}).errorCode, 'SESSION_EXPIRED');
  const t = env.addIdToken('x.y.z5aaaaaaaaaaaaaaaaaaa', 'nonaktif@example.test');
  assert.strictEqual(call('login', null, { idToken: t }).errorCode, 'FORBIDDEN');
});
test('sesi hilang dari cache -> SESSION_EXPIRED', () => {
  const tok = env.login('petugas@example.test');
  env.cache.clear();
  assert.strictEqual(call('searchLand', tok, {}).errorCode, 'SESSION_EXPIRED');
  PETUGAS = env.login('petugas@example.test');
  ADMIN = env.login('admin@example.test');
});
test('format token sesi ngawur -> SESSION_EXPIRED', () => {
  assert.strictEqual(call('searchLand', 'abc', {}).errorCode, 'SESSION_EXPIRED');
  assert.strictEqual(call('searchLand', '../../etc', {}).errorCode, 'SESSION_EXPIRED');
});
test('logout mencabut sesi', () => {
  const tok = env.login('petugas@example.test');
  assert.strictEqual(call('logout', tok, {}).success, true);
  assert.strictEqual(call('getCurrentUser', tok, {}).errorCode, 'SESSION_EXPIRED');
});
test('role tidak bisa dipalsukan lewat parameter', () => {
  const r = call('listUsers', PETUGAS, { role: 'ADMINISTRATOR' });
  assert.strictEqual(r.errorCode, 'FORBIDDEN');
  const r2 = call('createLand', null, { role: 'ADMINISTRATOR', land: {} });
  assert.strictEqual(r2.errorCode, 'UNAUTHENTICATED');
});

section('3. Hak akses (publik / petugas / admin)');
const ADMIN_ONLY = ['archiveLand', 'restoreLand', 'importGeoJSON', 'importCSV', 'importBoundary', 'setBoundaryStatus', 'listUsers', 'saveUser', 'getActivityLog', 'updateConfig'];
const STAFF_ONLY = ['getReport', 'getLandHistory', 'exportLandData', 'createLand', 'updateLand', 'saveGeometry'];
test('aksi admin: publik -> UNAUTHENTICATED, petugas -> FORBIDDEN', () => {
  ADMIN_ONLY.forEach(a => {
    assert.strictEqual(call(a, null, {}).errorCode, 'UNAUTHENTICATED', a + ' (publik)');
    assert.strictEqual(call(a, PETUGAS, {}).errorCode, 'FORBIDDEN', a + ' (petugas)');
  });
});
test('aksi petugas: publik -> UNAUTHENTICATED', () => {
  STAFF_ONLY.forEach(a => assert.strictEqual(call(a, null, {}).errorCode, 'UNAUTHENTICATED', a));
});
test('aksi tidak dikenal -> UNKNOWN_ACTION; prototype tidak bisa dipanggil', () => {
  assert.strictEqual(call('hapusSemua', null, {}).errorCode, 'UNKNOWN_ACTION');
  assert.strictEqual(call('constructor', null, {}).errorCode, 'UNKNOWN_ACTION');
  assert.strictEqual(call('__proto__', null, {}).errorCode, 'UNKNOWN_ACTION');
  assert.strictEqual(call(undefined, null, {}).errorCode, 'UNKNOWN_ACTION');
});
test('GET hanya untuk aksi publik baca; aksi lain -> METHOD_NOT_ALLOWED', () => {
  assert.strictEqual(call('login', null, {}, true).errorCode, 'METHOD_NOT_ALLOWED');
  assert.strictEqual(call('createLand', null, {}, true).errorCode, 'METHOD_NOT_ALLOWED');
  assert.strictEqual(call('getBoundary', null, {}, true).success, true);
});
test('params bukan objek -> VALIDATION_ERROR', () => {
  assert.strictEqual(call('searchLand', PETUGAS, 'abc').errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('searchLand', PETUGAS, [1]).errorCode, 'VALIDATION_ERROR');
});
test('petugas tidak dapat mengubah konfigurasi / pengguna', () => {
  assert.strictEqual(call('updateConfig', PETUGAS, { kunci: 'PETA_PUBLIK_AKTIF', nilai: 'TRUE' }).errorCode, 'FORBIDDEN');
  assert.strictEqual(call('saveUser', PETUGAS, { email: 'a@b.co', nama_pengguna: 'x', role: 'ADMINISTRATOR' }).errorCode, 'FORBIDDEN');
});

section('4. Database kosong');
test('dashboard kosong menghasilkan nol', () => {
  const r = call('getDashboardStats', null, {});
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.total, 0);
  assert.strictEqual(r.data.spt, 0);
  assert.deepStrictEqual(r.data.per_jenis, []);
});
test('pencarian kosong untuk petugas = 0 hasil, bukan error', () => {
  const r = call('searchLand', PETUGAS, {});
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.total, 0);
  assert.strictEqual(r.data.totalPages, 1);
});
test('batas wilayah belum ada: pesan jelas, boundary null', () => {
  const r = call('getBoundary', null, {});
  assert.strictEqual(r.data.boundary, null);
  assert.ok(r.data.message);
});
test('peta publik default: dibatasi (restricted), tanpa fitur', () => {
  const r = call('getPublicMapData', null, {});
  assert.strictEqual(r.data.restricted, true);
  assert.strictEqual(r.data.features.length, 0);
});

section('5. CRUD bidang tanah & validasi');
const baseLand = () => ({ nomor_surat: 'SPT-CONTOH-001/2025', jenis_surat: 'spt', nama_pemilik: OWNER, nik: NIK, alamat_pemilik: 'Jl. Contoh No. 1 (fiktif)',
  alamat_objek: 'Jl. Dummy RT 01', rt: '01', rw: '02', panjang_meter: '30', lebar_meter: '15', luas_dokumen_m2: '450', tanggal_surat: '2025-01-15' });
let ID1, ID2, UPD1;
test('create: jenis_surat & nama_pemilik wajib', () => {
  const r = call('createLand', PETUGAS, { land: {} });
  assert.strictEqual(r.errorCode, 'VALIDATION_ERROR');
  assert.ok(r.details.length >= 2);
});
test('create: NIK/angka/tanggal/jenis tidak valid ditolak', () => {
  const bad = [
    { nik: '123' }, { panjang_meter: 'abc' }, { luas_dokumen_m2: '-5' }, { tanggal_surat: '2025-02-30' },
    { jenis_surat: 'HGB-NGAWUR' }, { rt: 'A1' }, { nama_pemilik: 'x'.repeat(200) }, { keterangan: { a: 1 } }
  ];
  bad.forEach(b => {
    const r = call('createLand', PETUGAS, { land: Object.assign(baseLand(), b) });
    assert.strictEqual(r.errorCode, 'VALIDATION_ERROR', JSON.stringify(b));
  });
});
test('create sukses: ID PGR-000001, luas dokumen tersimpan, status lengkap', () => {
  const r = call('createLand', PETUGAS, { land: baseLand() });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  ID1 = r.data.land.id_bidang; UPD1 = r.data.land.updated_at;
  assert.strictEqual(ID1, 'PGR-000001');
  assert.strictEqual(r.data.land.jenis_surat, 'SPT');
  assert.strictEqual(r.data.land.luas_dokumen_m2, 450);
  assert.strictEqual(r.data.land.luas_peta_m2, null);
  assert.strictEqual(r.data.land.status_inventarisasi, 'LENGKAP');
  assert.strictEqual(r.data.land.status_pemetaan, 'BELUM_DIPETAKAN');
  assert.strictEqual(r.data.land.status_verifikasi, 'BELUM_DIVERIFIKASI');
  assert.strictEqual(r.data.land.kelurahan, 'Pager');
});
test('create: respons petugas menyamarkan NIK & tidak memuat alamat pemilik', () => {
  const r = call('getLandDetail', PETUGAS, { id_bidang: ID1 });
  assert.notStrictEqual(r.data.land.nik, NIK);
  assert.ok(/•/.test(r.data.land.nik));
  assert.strictEqual(r.data.land.alamat_pemilik, null);
  assert.strictEqual(r.data.land.nama_pemilik, OWNER);
});
test('admin melihat NIK & alamat pemilik asli', () => {
  const r = call('getLandDetail', ADMIN, { id_bidang: ID1 });
  assert.strictEqual(r.data.land.nik, NIK);
  assert.ok(r.data.land.alamat_pemilik.includes('Contoh'));
});
test('nomor surat ganda -> DUPLICATE (409), bisa diabaikan eksplisit', () => {
  const r = call('createLand', PETUGAS, { land: baseLand() });
  assert.strictEqual(r.errorCode, 'DUPLICATE');
  const r2 = call('createLand', PETUGAS, { land: baseLand(), abaikan_duplikat: true });
  assert.strictEqual(r2.success, true);
  ID2 = r2.data.land.id_bidang;
  assert.strictEqual(ID2, 'PGR-000002');
});
test('data tidak lengkap -> BELUM_LENGKAP; panjang/lebar kosong tidak dikarang', () => {
  const r = call('createLand', PETUGAS, { land: { jenis_surat: 'SHM', nama_pemilik: 'Siti Fiktif', nomor_surat: 'SHM-CONTOH-77' } });
  assert.strictEqual(r.data.land.status_inventarisasi, 'BELUM_LENGKAP');
  assert.strictEqual(r.data.land.panjang_meter, null);
  assert.strictEqual(r.data.land.lebar_meter, null);
  assert.strictEqual(r.data.land.luas_dokumen_m2, null);
});
test('field tak dikenal / injeksi status tidak berpengaruh saat create', () => {
  const r = call('createLand', PETUGAS, { land: Object.assign(baseLand(), { nomor_surat: 'X-1', id_bidang: 'PGR-999999', status_verifikasi: 'SUDAH_DIVERIFIKASI', luas_peta_m2: 99999, status_arsip: 'ARSIP', created_at: '1999' }) });
  assert.strictEqual(r.success, true);
  assert.notStrictEqual(r.data.land.id_bidang, 'PGR-999999');
  assert.strictEqual(r.data.land.status_verifikasi, 'BELUM_DIVERIFIKASI');
  assert.strictEqual(r.data.land.luas_peta_m2, null);
  assert.strictEqual(r.data.land.status_arsip, 'AKTIF');
});
test('update: wajib expected_updated_at', () => {
  assert.strictEqual(call('updateLand', PETUGAS, { id_bidang: ID1, land: { keterangan: 'x' } }).errorCode, 'VALIDATION_ERROR');
});
test('update sukses mengubah field & updated_at', () => {
  const r = call('updateLand', PETUGAS, { id_bidang: ID1, expected_updated_at: UPD1, land: { keterangan: 'Catatan uji', luas_dokumen_m2: '460,5' } });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  assert.strictEqual(r.data.land.luas_dokumen_m2, 460.5);
  assert.deepStrictEqual(r.data.changed.sort(), ['keterangan', 'luas_dokumen_m2']);
  assert.notStrictEqual(r.data.land.updated_at, UPD1);
});
test('update dengan versi lama -> CONFLICT (409)', () => {
  const r = call('updateLand', ADMIN, { id_bidang: ID1, expected_updated_at: UPD1, land: { keterangan: 'tabrakan' } });
  assert.strictEqual(r.errorCode, 'CONFLICT');
  assert.ok(r.details.current_updated_at);
});
test('petugas tidak bisa mengubah status_verifikasi (diabaikan)', () => {
  const cur = call('getLandDetail', PETUGAS, { id_bidang: ID1 }).data.land.updated_at;
  const r = call('updateLand', PETUGAS, { id_bidang: ID1, expected_updated_at: cur, land: { status_verifikasi: 'SUDAH_DIVERIFIKASI', keterangan: 'coba' } });
  assert.strictEqual(r.data.land.status_verifikasi, 'BELUM_DIVERIFIKASI');
});
test('admin memverifikasi; petugas mengubah data -> verifikasi direset', () => {
  let cur = call('getLandDetail', ADMIN, { id_bidang: ID1 }).data.land.updated_at;
  let r = call('updateLand', ADMIN, { id_bidang: ID1, expected_updated_at: cur, land: { status_verifikasi: 'SUDAH_DIVERIFIKASI' } });
  assert.strictEqual(r.data.land.status_verifikasi, 'SUDAH_DIVERIFIKASI');
  cur = r.data.land.updated_at;
  r = call('updateLand', PETUGAS, { id_bidang: ID1, expected_updated_at: cur, land: { alamat_objek: 'Alamat baru' } });
  assert.strictEqual(r.data.land.status_verifikasi, 'BELUM_DIVERIFIKASI');
  assert.strictEqual(r.data.verifikasi_direset, true);
  call('updateLand', ADMIN, { id_bidang: ID1, expected_updated_at: r.data.land.updated_at, land: { status_verifikasi: 'SUDAH_DIVERIFIKASI' } });
});
test('petugas mengirim NIK tersamarkan: NIK asli tidak tertimpa', () => {
  const d = call('getLandDetail', PETUGAS, { id_bidang: ID1 }).data.land;
  const r = call('updateLand', PETUGAS, { id_bidang: ID1, expected_updated_at: d.updated_at, land: { nik: d.nik, alamat_pemilik: '', keterangan: 'cek nik' } });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  assert.strictEqual(call('getLandDetail', ADMIN, { id_bidang: ID1 }).data.land.nik, NIK);
});
test('update tanpa perubahan -> unchanged', () => {
  const d = call('getLandDetail', PETUGAS, { id_bidang: ID1 }).data.land;
  const r = call('updateLand', PETUGAS, { id_bidang: ID1, expected_updated_at: d.updated_at, land: { keterangan: d.keterangan } });
  assert.strictEqual(r.data.unchanged, true);
});
test('ID tidak valid / tidak ada', () => {
  assert.strictEqual(call('getLandDetail', PETUGAS, { id_bidang: "PGR-1'; DROP" }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('getLandDetail', PETUGAS, { id_bidang: 'PGR-424242' }).errorCode, 'NOT_FOUND');
});

section('6. Geometri & luas');
test('luas persegi 0,001° di lintang -2,2 ≈ 12.380 m² (±1%)', () => {
  const r = call('saveGeometry', PETUGAS, { id_bidang: ID1, geojson: SQUARE(113.9, -2.2, 0.001), sumber_geometri: 'Digitasi layar' });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  const exp = 111319.49 * 0.001 * 111319.49 * 0.001 * Math.cos(-2.2005 * Math.PI / 180);
  assert.ok(Math.abs(r.data.metrics.luas_m2 - exp) / exp < 0.01, 'luas ' + r.data.metrics.luas_m2 + ' vs ' + exp);
  assert.ok(Math.abs(r.data.metrics.keliling_m - 4 * 111.32) < 2, 'keliling ' + r.data.metrics.keliling_m);
});
test('luas peta tersimpan terpisah dari luas dokumen; status dipetakan', () => {
  const d = call('getLandDetail', PETUGAS, { id_bidang: ID1 }).data;
  assert.strictEqual(d.land.luas_dokumen_m2, 460.5);
  assert.ok(d.land.luas_peta_m2 > 12000);
  assert.strictEqual(d.land.status_pemetaan, 'SUDAH_DIPETAKAN');
  assert.ok(d.perbandingan_luas && /bukan penetapan batas/.test(d.perbandingan_luas.catatan));
  assert.strictEqual(d.perbandingan_luas.selisih_m2, +(d.land.luas_peta_m2 - 460.5).toFixed(2));
});
test('petugas tidak bisa menandai geometri terverifikasi; admin bisa', () => {
  let r = call('saveGeometry', PETUGAS, { id_bidang: ID1, geojson: SQUARE(113.9, -2.2, 0.001), status_verifikasi_geometri: 'SUDAH_DIVERIFIKASI' });
  assert.strictEqual(r.data.geometry.status_verifikasi_geometri, 'BELUM_DIVERIFIKASI');
  r = call('saveGeometry', ADMIN, { id_bidang: ID1, geojson: SQUARE(113.9, -2.2, 0.001), status_verifikasi_geometri: 'SUDAH_DIVERIFIKASI' });
  assert.strictEqual(r.data.geometry.status_verifikasi_geometri, 'SUDAH_DIVERIFIKASI');
});
test('update geometri tidak menduplikasi baris', () => {
  call('saveGeometry', PETUGAS, { id_bidang: ID1, geojson: SQUARE(113.9, -2.2, 0.002) });
  const g = env.ss.sheets.GEOMETRI_BIDANG;
  assert.strictEqual(g.getLastRow(), 2);
});
test('ring tidak tertutup otomatis ditutup', () => {
  const open = { type: 'Polygon', coordinates: [[[113.91, -2.21], [113.911, -2.21], [113.911, -2.209]]] };
  const r = call('saveGeometry', PETUGAS, { id_bidang: ID2, geojson: open });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  const ring = r.data.geometry.geojson.coordinates[0];
  assert.deepStrictEqual(ring[0], ring[ring.length - 1]);
});
test('Feature dan MultiPolygon diterima', () => {
  const f = { type: 'Feature', properties: {}, geometry: SQUARE(113.92, -2.2, 0.0005) };
  assert.strictEqual(call('saveGeometry', PETUGAS, { id_bidang: ID2, geojson: f }).success, true);
  const mp = { type: 'MultiPolygon', coordinates: [SQUARE(113.92, -2.2, 0.0005).coordinates, SQUARE(113.93, -2.2, 0.0005).coordinates] };
  assert.strictEqual(call('saveGeometry', PETUGAS, { id_bidang: ID2, geojson: mp }).success, true);
});
test('geometri tidak valid ditolak dengan pesan', () => {
  const cases = {
    'Point': { type: 'Point', coordinates: [113.9, -2.2] },
    'dua titik': { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.2]]] },
    'segaris': { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.2], [113.902, -2.2], [113.9, -2.2]]] },
    'bowtie': { type: 'Polygon', coordinates: [[[113.9, -2.2], [113.901, -2.201], [113.901, -2.2], [113.9, -2.201], [113.9, -2.2]]] },
    'lat/lon tertukar': { type: 'Polygon', coordinates: [[[-2.2, 113.9], [-2.2, 113.901], [-2.201, 113.901], [-2.2, 113.9]]] },
    'di luar Indonesia': SQUARE(2.35, 48.85, 0.001),
    'NaN': { type: 'Polygon', coordinates: [[[113.9, -2.2], ['a', -2.2], [113.9, -2.201], [113.9, -2.2]]] },
    'kosong': {}, 'string': 'bukan objek', 'null': null,
    'koordinat tak terhingga': { type: 'Polygon', coordinates: [[[113.9, -2.2], [1e999, -2.2], [113.9, -2.201], [113.9, -2.2]]] }
  };
  Object.keys(cases).forEach(k => {
    const r = call('saveGeometry', PETUGAS, { id_bidang: ID1, geojson: cases[k] });
    assert.strictEqual(r.success, false, k + ' seharusnya ditolak');
    assert.strictEqual(r.errorCode, 'INVALID_GEOJSON', k);
  });
});
test('geometri terlalu besar ditolak (batas sel)', () => {
  const pts = []; const n = 3000;
  for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; pts.push([113.9 + 0.01 * Math.cos(a), -2.2 + 0.01 * Math.sin(a)]); }
  pts.push(pts[0]);
  const r = call('saveGeometry', PETUGAS, { id_bidang: ID1, geojson: { type: 'Polygon', coordinates: [pts] } });
  assert.strictEqual(r.errorCode, 'INVALID_GEOJSON');
  assert.ok(/terlalu besar/i.test(r.message));
});
test('saveGeometry untuk ID tidak ada -> NOT_FOUND', () => {
  assert.strictEqual(call('saveGeometry', PETUGAS, { id_bidang: 'PGR-777777', geojson: SQUARE(113.9, -2.2, 0.001) }).errorCode, 'NOT_FOUND');
});
test('poligon berlubang: luas = luar - lubang', () => {
  const outer = SQUARE(113.94, -2.2, 0.002).coordinates[0];
  const hole = SQUARE(113.9405, -2.1995, 0.0005).coordinates[0].slice().reverse();
  const r = call('saveGeometry', PETUGAS, { id_bidang: ID2, geojson: { type: 'Polygon', coordinates: [outer, hole] } });
  const full = call('saveGeometry', PETUGAS, { id_bidang: ID2, geojson: { type: 'Polygon', coordinates: [outer] } });
  assert.ok(r.data.metrics.luas_m2 < full.data.metrics.luas_m2 * 0.95);
});

section('7. Privasi data publik');
test('PETA_PUBLIK_AKTIF=FALSE: publik tidak mendapat poligon/pencarian/detail', () => {
  assert.strictEqual(call('getPublicMapData', null, {}).data.restricted, true);
  assert.strictEqual(call('searchLand', null, { q: 'SPT' }).errorCode, 'UNAUTHENTICATED');
  assert.strictEqual(call('getLandDetail', null, { id_bidang: ID1 }).errorCode, 'UNAUTHENTICATED');
});
test('setelah diaktifkan, GeoJSON publik tidak memuat nama/NIK/nomor surat/alamat', () => {
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'PETA_PUBLIK_AKTIF', nilai: 'true' }).success, true);
  const r = call('getPublicMapData', null, {});
  assert.strictEqual(r.data.restricted, false);
  assert.ok(r.data.features.length >= 1);
  const s = JSON.stringify(r);
  [OWNER, NIK, 'SPT-CONTOH', 'Contoh No. 1', 'Alamat baru', 'Siti Fiktif', 'petugas@'].forEach(x => assert.ok(s.indexOf(x) < 0, 'bocor: ' + x));
  const keys = Object.keys(r.data.features[0].properties).sort();
  assert.deepStrictEqual(keys, ['id_bidang', 'jenis_surat', 'status_inventarisasi', 'status_pemetaan', 'status_verifikasi']);
});
test('pencarian & detail publik: tanpa data pribadi; nama pemilik tidak dapat dicari', () => {
  const r = call('searchLand', null, { q: 'budi' });
  assert.strictEqual(r.data.total, 0, 'nama pemilik tidak boleh dapat dicari publik');
  const r2 = call('searchLand', null, { q: 'SPT' });
  const s = JSON.stringify(r2);
  [OWNER, NIK, 'nomor_surat', 'nik', 'nama_pemilik', 'alamat'].forEach(x => assert.ok(s.indexOf(x) < 0, 'bocor: ' + x));
  const d = JSON.stringify(call('getLandDetail', null, { id_bidang: ID1 }));
  [OWNER, NIK, 'nama_pemilik', 'alamat', 'luas_dokumen_m2', 'luas_peta_m2', 'nomor_surat'].forEach(x => assert.ok(d.indexOf(x) < 0, 'bocor di detail: ' + x));
  const land = call('getLandDetail', null, { id_bidang: ID1 }).data.land;
  assert.deepStrictEqual(Object.keys(land).sort(), ['id_bidang', 'jenis_surat', 'status_inventarisasi', 'status_pemetaan', 'status_verifikasi']);
});
test('pencarian publik: filter RT/RW & pageSize dibatasi', () => {
  const r = call('searchLand', null, { rt: '1', pageSize: 100000 });
  assert.ok(r.data.pageSize <= 25);
});
test('publik tidak dapat memanggil ekspor/laporan/riwayat', () => {
  ['exportLandData', 'getReport', 'getLandHistory'].forEach(a => assert.strictEqual(call(a, null, { id_bidang: ID1 }).errorCode, 'UNAUTHENTICATED'));
});
test('daftar petugas tidak memuat NIK / alamat pemilik', () => {
  const s = JSON.stringify(call('searchLand', PETUGAS, {}));
  assert.ok(s.indexOf(NIK) < 0 && s.indexOf('"nik"') < 0 && s.indexOf('alamat_pemilik') < 0);
});
test('data peta untuk petugas memuat RT/RW tetapi tetap tanpa nama', () => {
  const r = call('getPublicMapData', PETUGAS, {});
  assert.ok('rt' in r.data.features[0].properties);
  assert.ok(JSON.stringify(r).indexOf(OWNER) < 0);
});
test('batas wilayah belum diverifikasi tidak tampil ke publik', () => {
  const sq = SQUARE(113.85, -2.25, 0.05);
  const imp = call('importBoundary', ADMIN, { geojson: sq, sumber_data: 'DATA DEMO - BUKAN BATAS RESMI', status_verifikasi: 'BELUM_DIVERIFIKASI' });
  assert.strictEqual(imp.success, true, JSON.stringify(imp));
  assert.strictEqual(call('getBoundary', null, {}).data.boundary, null);
  assert.ok(call('getBoundary', ADMIN, {}).data.boundary);
  call('setBoundaryStatus', ADMIN, { id_batas: imp.data.id_batas, status_verifikasi: 'SUDAH_DIVERIFIKASI' });
  assert.ok(call('getBoundary', null, {}).data.boundary);
});
test('importBoundary: wajib sumber data', () => {
  assert.strictEqual(call('importBoundary', ADMIN, { geojson: SQUARE(113.85, -2.25, 0.05) }).errorCode, 'VALIDATION_ERROR');
});
test('cache publik tidak dipakai untuk pengguna login dan sebaliknya', () => {
  const a = JSON.stringify(call('getPublicMapData', PETUGAS, {}));
  const b = JSON.stringify(call('getPublicMapData', null, {}));
  assert.ok(a.indexOf('"rt"') >= 0 && b.indexOf('"rt"') < 0);
});

section('8. Arsip & pemulihan');
test('petugas tidak dapat mengarsipkan', () => {
  assert.strictEqual(call('archiveLand', PETUGAS, { id_bidang: ID2 }).errorCode, 'FORBIDDEN');
});
test('admin mengarsipkan: hilang dari pencarian, peta, statistik; data tetap di sheet', () => {
  const before = call('getDashboardStats', null, {}).data.total;
  assert.strictEqual(call('archiveLand', ADMIN, { id_bidang: ID2, alasan: 'uji' }).success, true);
  assert.strictEqual(call('getDashboardStats', null, {}).data.total, before - 1);
  assert.ok(!call('searchLand', PETUGAS, {}).data.items.some(i => i.id_bidang === ID2));
  assert.ok(!call('getPublicMapData', null, {}).data.features.some(f => f.id === ID2));
  assert.strictEqual(call('getLandDetail', PETUGAS, { id_bidang: ID2 }).errorCode, 'NOT_FOUND');
  assert.strictEqual(call('getLandDetail', ADMIN, { id_bidang: ID2 }).success, true);
  assert.ok(env.ss.sheets.BIDANG_TANAH.data.some(r => r[0] === ID2));
});
test('mengarsipkan dua kali -> CONFLICT; ubah data terarsip -> ARCHIVED', () => {
  assert.strictEqual(call('archiveLand', ADMIN, { id_bidang: ID2 }).errorCode, 'CONFLICT');
  const cur = call('getLandDetail', ADMIN, { id_bidang: ID2 }).data.land.updated_at;
  assert.strictEqual(call('updateLand', ADMIN, { id_bidang: ID2, expected_updated_at: cur, land: { keterangan: 'x' } }).errorCode, 'ARCHIVED');
});
test('admin dapat memulihkan', () => {
  assert.strictEqual(call('restoreLand', ADMIN, { id_bidang: ID2 }).success, true);
  assert.ok(call('searchLand', PETUGAS, {}).data.items.some(i => i.id_bidang === ID2));
  assert.strictEqual(call('restoreLand', ADMIN, { id_bidang: ID2 }).errorCode, 'CONFLICT');
});

section('9. Pencarian & filter');
test('cari nomor surat (petugas)', () => {
  const r = call('searchLand', PETUGAS, { q: 'SPT-CONTOH-001' });
  assert.ok(r.data.total >= 1);
});
test('cari nama pemilik (petugas) & multi-kata', () => {
  assert.ok(call('searchLand', PETUGAS, { q: 'budi' }).data.total >= 1);
  assert.ok(call('searchLand', PETUGAS, { q: 'budi fiktif' }).data.total >= 1);
  assert.strictEqual(call('searchLand', PETUGAS, { q: 'budi tidakada' }).data.total, 0);
});
test('filter jenis, status, pemetaan, RT', () => {
  const t = (p, f) => { const r = call('searchLand', PETUGAS, p); assert.ok(r.success); r.data.items.forEach(f); return r.data.total; };
  assert.ok(t({ jenis_surat: 'SHM' }, i => assert.strictEqual(i.jenis_surat, 'SHM')) >= 1);
  assert.ok(t({ status_inventarisasi: 'BELUM_LENGKAP' }, i => assert.strictEqual(i.status_inventarisasi, 'BELUM_LENGKAP')) >= 1);
  assert.ok(t({ status_pemetaan: 'SUDAH_DIPETAKAN' }, i => assert.strictEqual(i.status_pemetaan, 'SUDAH_DIPETAKAN')) >= 1);
  assert.ok(t({ rt: '1' }, i => assert.strictEqual(String(i.rt), '1')) >= 1);
});
test('pagination & pengurutan', () => {
  const r = call('searchLand', PETUGAS, { pageSize: 2, page: 1, sortBy: 'id_bidang', sortDir: 'desc' });
  assert.strictEqual(r.data.items.length, 2);
  assert.ok(r.data.items[0].id_bidang > r.data.items[1].id_bidang);
  assert.ok(r.data.totalPages >= 2);
  const r2 = call('searchLand', PETUGAS, { pageSize: 2, page: 99 });
  assert.strictEqual(r2.data.items.length, 0);
});
test('sortBy ngawur / pageSize ekstrem aman', () => {
  assert.strictEqual(call('searchLand', PETUGAS, { sortBy: 'nik', pageSize: 999999, page: -5 }).success, true);
  assert.ok(call('searchLand', PETUGAS, { pageSize: 999999 }).data.pageSize <= 100);
});
test('pencarian regex/karakter khusus aman', () => {
  assert.strictEqual(call('searchLand', PETUGAS, { q: '.*(' }).data.total, 0);
  assert.strictEqual(call('searchLand', PETUGAS, { q: "'; DROP --" }).success, true);
});

section('10. Dashboard, laporan, riwayat');
test('statistik dihitung dari data (bukan angka tetap)', () => {
  const s = call('getDashboardStats', null, {}).data;
  const all = call('searchLand', ADMIN, { pageSize: 100 }).data.items;
  assert.strictEqual(s.total, all.length);
  assert.strictEqual(s.spt, all.filter(i => i.jenis_surat === 'SPT').length);
  assert.strictEqual(s.shm, all.filter(i => i.jenis_surat === 'SHM').length);
  assert.strictEqual(s.dipetakan + s.belum_dipetakan, s.total);
  assert.strictEqual(s.belum_lengkap, all.filter(i => i.status_inventarisasi !== 'LENGKAP').length);
  assert.ok(s.per_rtrw.length >= 1);
});
test('statistik langsung berubah setelah tulis (cache dibatalkan)', () => {
  const a = call('getDashboardStats', null, {}).data.total;
  call('createLand', PETUGAS, { land: { jenis_surat: 'SHM', nama_pemilik: 'Warga Fiktif Dua', nomor_surat: 'SHM-CONTOH-' + Math.random() } });
  assert.strictEqual(call('getDashboardStats', null, {}).data.total, a + 1);
});
test('laporan: rekap luas dokumen & peta terpisah, ada catatan', () => {
  const r = call('getReport', PETUGAS, {}).data;
  assert.ok(r.luas_dokumen_m2 > 0 && r.luas_peta_m2 > 0);
  assert.ok(/bukan pengukuran kadastral/i.test(r.catatan));
  assert.strictEqual(r.pemetaan.sudah + r.pemetaan.belum, r.total);
  assert.strictEqual(r.per_jenis.reduce((a, x) => a + x.jumlah, 0), r.total);
});
test('riwayat bidang memuat aksi dan pelaku, tanpa data pribadi', () => {
  const r = call('getLandHistory', PETUGAS, { id_bidang: ID1 });
  assert.ok(r.data.items.length >= 3);
  assert.ok(r.data.items.some(i => i.aksi === 'TAMBAH'));
  assert.ok(r.data.items.some(i => i.aksi === 'UBAH_GEOMETRI' || i.aksi === 'TAMBAH_GEOMETRI'));
  assert.ok(JSON.stringify(r).indexOf(NIK) < 0);
});

section('11. Impor/ekspor CSV & GeoJSON');
const CSV = 'nomor_surat,jenis_surat,nama_pemilik,nik,rt,rw,luas_dokumen_m2,kolom_aneh\r\n' +
  'SPT-IMP-1,SPT,"Warga, Fiktif Satu",,1,1,200,x\r\n' +
  'SPT-IMP-2,shm,Warga Fiktif Dua,6271000000000009,2,1,300,x\r\n' +
  'SPT-IMP-3,HGB,Salah Jenis,,1,1,100,x\r\n' +
  'SPT-IMP-1,SPT,Ganda Dalam File,,1,1,100,x\r\n' +
  'SPT-IMP-5,SPT,,,1,1,100,x\r\n' +
  '=HYPERLINK("http://evil"),SPT,Rumus Berbahaya,,1,1,100,x\r\n';
test('impor CSV preview: tidak menulis; melaporkan baris salah per nomor baris', () => {
  const before = env.ss.sheets.BIDANG_TANAH.getLastRow();
  const r = call('importCSV', ADMIN, { csv: CSV, mode: 'preview' });
  assert.strictEqual(r.success, true, JSON.stringify(r));
  assert.strictEqual(r.data.total, 6);
  assert.strictEqual(r.data.valid, 3);
  assert.strictEqual(r.data.invalid, 3);
  assert.deepStrictEqual(r.data.kolom_diabaikan, ['kolom_aneh']);
  assert.strictEqual(r.data.errors[0].baris, 4);
  assert.strictEqual(env.ss.sheets.BIDANG_TANAH.getLastRow(), before);
});
test('impor CSV commit: hanya baris valid disimpan, ID berurutan unik', () => {
  const r = call('importCSV', ADMIN, { csv: CSV, mode: 'commit' });
  assert.strictEqual(r.data.saved, 3);
  const ids = env.ss.sheets.BIDANG_TANAH.data.slice(1).map(x => x[0]).filter(Boolean);
  assert.strictEqual(new Set(ids).size, ids.length, 'ID harus unik');
});
test('impor ulang CSV yang sama -> semua ditolak sebagai duplikat', () => {
  const r = call('importCSV', ADMIN, { csv: CSV, mode: 'commit' });
  assert.strictEqual(r.data.saved, 0);
});
test('impor CSV: header wajib, kosong, terlalu banyak baris', () => {
  assert.strictEqual(call('importCSV', ADMIN, { csv: 'a,b\n1,2', mode: 'preview' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('importCSV', ADMIN, { csv: '', mode: 'preview' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('importCSV', ADMIN, { csv: 'jenis_surat,nama_pemilik\n' + new Array(600).fill('SPT,Fiktif').join('\n') }).errorCode, 'LIMIT_EXCEEDED');
  assert.strictEqual(call('importCSV', ADMIN, { csv: 'jenis_surat,nama_pemilik\n"SPT,Fiktif' }).errorCode, 'VALIDATION_ERROR');
});
test('ekspor CSV petugas tanpa NIK/alamat pemilik; admin dengan NIK', () => {
  const p = call('exportLandData', PETUGAS, { format: 'csv' }).data;
  const pCols = p.content.split('\r\n')[0].split(',');
  assert.ok(pCols.indexOf('nik') < 0 && pCols.indexOf('alamat_pemilik') < 0, 'kolom sensitif ada di ekspor petugas');
  assert.ok(p.content.indexOf(NIK) < 0 && p.content.indexOf('Contoh No. 1') < 0);
  assert.ok(p.content.indexOf(OWNER) >= 0);
  const a = call('exportLandData', ADMIN, { format: 'csv' }).data;
  assert.ok(a.content.split('\r\n')[0].split(',').indexOf('nik') >= 0);
  assert.ok(a.content.indexOf(NIK) >= 0);
  assert.ok(/\.csv$/.test(a.filename));
});
test('ekspor CSV menetralkan formula (CSV injection)', () => {
  const a = call('exportLandData', ADMIN, { format: 'csv' }).data.content;
  assert.ok(a.indexOf(',=HYPERLINK') < 0 && a.indexOf('"=HYPERLINK') < 0, 'formula tidak dinetralkan');
});
test('ekspor tercatat di log; ekspor GeoJSON memuat geometri tanpa pemilik', () => {
  const g = call('exportLandData', ADMIN, { format: 'geojson' }).data;
  const fc = JSON.parse(g.content);
  assert.ok(fc.features.length >= 1);
  assert.ok(g.content.indexOf(OWNER) < 0 && g.content.indexOf(NIK) < 0);
  const log = call('getActivityLog', ADMIN, { q: 'EKSPOR' }).data;
  assert.ok(log.total >= 3);
});
test('ekspor dibatasi laju', () => {
  let limited = false;
  for (let i = 0; i < 20; i++) if (call('exportLandData', PETUGAS, {}).errorCode === 'RATE_LIMITED') { limited = true; break; }
  assert.ok(limited);
});
let IMPID;
test('impor GeoJSON preview/commit; ID salah dan duplikat dilaporkan', () => {
  IMPID = call('searchLand', ADMIN, { q: 'SPT-IMP-1' }).data.items[0].id_bidang;
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id_bidang: IMPID }, geometry: SQUARE(113.96, -2.2, 0.001) },
    { type: 'Feature', properties: { id_bidang: 'PGR-555555' }, geometry: SQUARE(113.97, -2.2, 0.001) },
    { type: 'Feature', properties: {}, geometry: SQUARE(113.98, -2.2, 0.001) },
    { type: 'Feature', properties: { id_bidang: IMPID }, geometry: SQUARE(113.99, -2.2, 0.001) },
    { type: 'Feature', properties: { id_bidang: ID1 }, geometry: { type: 'Point', coordinates: [113.9, -2.2] } }
  ] };
  const p = call('importGeoJSON', ADMIN, { featureCollection: fc, mode: 'preview' });
  assert.strictEqual(p.data.valid, 1); assert.strictEqual(p.data.invalid, 4); assert.strictEqual(p.data.saved, 0);
  const c = call('importGeoJSON', ADMIN, { featureCollection: fc, mode: 'commit' });
  assert.strictEqual(c.data.saved, 1);
  const d = call('getLandDetail', ADMIN, { id_bidang: IMPID }).data;
  assert.strictEqual(d.land.status_pemetaan, 'SUDAH_DIPETAKAN');
  assert.ok(d.land.luas_peta_m2 > 0);
});
test('impor GeoJSON: bukan FeatureCollection / kosong / terlalu banyak', () => {
  assert.strictEqual(call('importGeoJSON', ADMIN, { featureCollection: { type: 'Point' } }).errorCode, 'INVALID_GEOJSON');
  assert.strictEqual(call('importGeoJSON', ADMIN, { featureCollection: { type: 'FeatureCollection', features: [] } }).errorCode, 'INVALID_GEOJSON');
  const many = { type: 'FeatureCollection', features: new Array(101).fill({ type: 'Feature', properties: { id_bidang: ID1 }, geometry: SQUARE(113.9, -2.2, 0.001) }) };
  assert.strictEqual(call('importGeoJSON', ADMIN, { featureCollection: many }).errorCode, 'LIMIT_EXCEEDED');
});

section('12. Administrasi pengguna & konfigurasi');
test('admin tidak bisa menurunkan/menonaktifkan diri sendiri', () => {
  assert.strictEqual(call('saveUser', ADMIN, { email: 'admin@example.test', nama_pengguna: 'Administrator', role: 'PETUGAS' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('saveUser', ADMIN, { email: 'admin@example.test', nama_pengguna: 'Administrator', role: 'ADMINISTRATOR', status_akun: 'NONAKTIF' }).errorCode, 'VALIDATION_ERROR');
});
test('administrator terakhir tidak bisa dinonaktifkan oleh admin lain yang sama', () => {
  call('saveUser', ADMIN, { email: 'admin2@example.test', nama_pengguna: 'Admin Dua', role: 'ADMINISTRATOR' });
  const A2 = env.login('admin2@example.test');
  assert.strictEqual(call('saveUser', A2, { email: 'admin@example.test', nama_pengguna: 'Administrator', role: 'PETUGAS' }).success, true);
  assert.strictEqual(call('saveUser', A2, { email: 'admin2@example.test', nama_pengguna: 'Admin Dua', role: 'PETUGAS' }).errorCode, 'VALIDATION_ERROR');
  call('saveUser', A2, { email: 'admin@example.test', nama_pengguna: 'Administrator', role: 'ADMINISTRATOR' });
  ADMIN = env.login('admin@example.test');
});
test('validasi pengguna: email/role tidak valid', () => {
  assert.strictEqual(call('saveUser', ADMIN, { email: 'bukan-email', nama_pengguna: 'X', role: 'PETUGAS' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('saveUser', ADMIN, { email: 'a@b.co', nama_pengguna: 'X', role: 'PUBLIK' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('saveUser', ADMIN, { email: 'a@b.co', nama_pengguna: 'X', role: 'SUPERADMIN' }).errorCode, 'VALIDATION_ERROR');
});
test('konfigurasi: hanya kunci diizinkan & nilai tervalidasi', () => {
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'SPREADSHEET_ID', nilai: 'x' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'WARNA_SHM', nilai: 'merah' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'WARNA_SHM', nilai: '#112233' }).success, true);
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'SESSION_JAM', nilai: '99' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'JENIS_SURAT', nilai: 'SPT,SHM,HGB' }).success, true);
  assert.strictEqual(call('updateConfig', ADMIN, { kunci: 'JENIS_SURAT', nilai: 'SPT,HGB' }).errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(call('getPublicConfig', null, {}).data.warna.SHM, '#112233');
  assert.ok(call('getPublicConfig', null, {}).data.jenis_surat.indexOf('HGB') >= 0);
});
test('konfigurasi publik tidak memuat rahasia', () => {
  const s = JSON.stringify(call('getPublicConfig', null, {}));
  ['TEST-SHEET-ID', 'client-123', 'admin@example'].forEach(x => assert.ok(s.indexOf(x) < 0, x));
});
test('log aktivitas: admin saja, tanpa token/kata sandi', () => {
  const all = JSON.stringify(env.ss.sheets.LOG_AKTIVITAS.data);
  [ADMIN, PETUGAS].forEach(t => assert.ok(all.indexOf(t) < 0, 'token bocor di log'));
  assert.ok(!/password|kata sandi.*=|id_token/i.test(all));
  assert.ok(call('getActivityLog', ADMIN, { pageSize: 5 }).data.items.length === 5);
});

section('13. Penanganan galat & ketahanan');
function post(body) { return JSON.parse(env.ctx.doPost({ postData: { contents: body } }).getContent()); }
test('doPost: JSON rusak, kosong, bukan objek', () => {
  assert.strictEqual(post('{rusak').errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(post('').errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(post('[1,2]').errorCode, 'VALIDATION_ERROR');
  assert.strictEqual(JSON.parse(env.ctx.doPost({}).getContent()).errorCode, 'VALIDATION_ERROR');
});
test('doPost: ukuran berlebih ditolak', () => {
  const r = post(JSON.stringify({ action: 'searchLand', params: { q: 'x'.repeat(4100000) } }));
  assert.strictEqual(r.errorCode, 'LIMIT_EXCEEDED');
});
test('doPost end-to-end menghasilkan format respons standar', () => {
  const r = post(JSON.stringify({ action: 'searchLand', token: PETUGAS, params: { q: 'budi' } }));
  assert.strictEqual(r.success, true);
  assert.strictEqual(typeof r.message, 'string');
  assert.ok('data' in r);
});
test('doGet tanpa action -> healthCheck; format JSON', () => {
  const out = env.ctx.doGet({ parameter: {} });
  assert.strictEqual(out.mime, 'JSON');
  assert.strictEqual(JSON.parse(out.getContent()).success, true);
  assert.strictEqual(JSON.parse(env.ctx.doGet({ parameter: { action: 'createLand' } }).getContent()).errorCode, 'METHOD_NOT_ALLOWED');
});
test('galat internal tak terduga: pesan generik, tanpa stack/detail', () => {
  env.ctx.getDashboardStats_ = () => { throw new TypeError('rahasia internal: Cannot read property x of undefined at Foo.gs:12'); };
  env.ctx._actionsMemo = null;
  const r = call('getDashboardStats', null, {});
  assert.strictEqual(r.errorCode, 'INTERNAL_ERROR');
  assert.ok(r.message.indexOf('rahasia') < 0 && r.message.indexOf('.gs') < 0);
  assert.ok(env.errors.some(e => e.indexOf('rahasia internal') >= 0), 'harus dicatat di log server');
});
test('rate limit login gagal', () => {
  const env2 = createEnv();
  env2.run('initDatabase()');
  let limited = false;
  for (let i = 0; i < 70; i++) {
    const r = env2.call('login', null, { idToken: 'aaa.bbb.' + 'c'.repeat(30 + (i % 5)) });
    if (r.errorCode === 'RATE_LIMITED') { limited = true; break; }
  }
  assert.ok(limited, 'brute force tidak dibatasi');
});
test('Client ID belum diatur -> NOT_CONFIGURED yang jelas', () => {
  const env3 = createEnv(); env3.run('initDatabase()'); delete env3.props.GOOGLE_CLIENT_ID;
  const r = env3.call('login', null, { idToken: 'aaa.bbb.' + 'c'.repeat(30) });
  assert.strictEqual(r.errorCode, 'NOT_CONFIGURED');
});
test('kerusakan header sheet terdeteksi (NOT_INITIALIZED)', () => {
  const env4 = createEnv(); env4.run('initDatabase()');
  env4.ss.sheets.BIDANG_TANAH.data[0][3] = 'salah';
  assert.strictEqual(env4.call('getDashboardStats', null, {}).errorCode, 'NOT_INITIALIZED');
});
test('baris sheet bertambah otomatis saat melebihi kapasitas', () => {
  const env5 = createEnv(); env5.run('initDatabase()');
  env5.ss.sheets.BIDANG_TANAH.maxRows = 5;
  const tok = env5.login('admin@example.test');
  for (let i = 0; i < 8; i++) {
    const r = env5.call('createLand', tok, { land: { jenis_surat: 'SPT', nama_pemilik: 'Fiktif ' + i, nomor_surat: 'N-' + i } });
    assert.strictEqual(r.success, true, 'baris ' + i + ': ' + JSON.stringify(r));
  }
});
test('1000 bidang: ID unik, pencarian & statistik tetap cepat', () => {
  const env6 = createEnv(); env6.run('initDatabase()');
  const tok = env6.login('admin@example.test');
  let csv = 'nomor_surat,jenis_surat,nama_pemilik,rt,rw,luas_dokumen_m2\n';
  for (let i = 0; i < 500; i++) csv += `N-${i},${i % 2 ? 'SPT' : 'SHM'},Fiktif ${i},${i % 9 + 1},${i % 3 + 1},${100 + i}\n`;
  assert.strictEqual(env6.call('importCSV', tok, { csv, mode: 'commit' }).data.saved, 500);
  csv = csv.replace(/N-/g, 'M-');
  assert.strictEqual(env6.call('importCSV', tok, { csv, mode: 'commit' }).data.saved, 500);
  const t0 = Date.now();
  const s = env6.call('getDashboardStats', null, {});
  const r = env6.call('searchLand', tok, { q: 'Fiktif 77', pageSize: 100 });
  assert.strictEqual(s.data.total, 1000);
  assert.ok(r.data.total >= 1);
  const ids = env6.ss.sheets.BIDANG_TANAH.data.slice(1).map(x => x[0]).filter(Boolean);
  assert.strictEqual(new Set(ids).size, 1000);
  assert.strictEqual(ids[999], 'PGR-001000');
  assert.ok(Date.now() - t0 < 3000);
});
test('ID tetap unik meskipun counter hilang (pulih dari data)', () => {
  const env7 = createEnv(); env7.run('initDatabase()');
  const tok = env7.login('admin@example.test');
  env7.call('createLand', tok, { land: { jenis_surat: 'SPT', nama_pemilik: 'A Fiktif' } });
  env7.call('createLand', tok, { land: { jenis_surat: 'SPT', nama_pemilik: 'B Fiktif' } });
  delete env7.props.ID_COUNTER;
  const r = env7.call('createLand', tok, { land: { jenis_surat: 'SPT', nama_pemilik: 'C Fiktif' } });
  assert.strictEqual(r.data.land.id_bidang, 'PGR-000003');
});
test('cache peta besar dipecah (tidak melebihi 100 KB per kunci)', () => {
  const env8 = createEnv(); env8.run('initDatabase()');
  const tok = env8.login('admin@example.test');
  env8.call('updateConfig', tok, { kunci: 'PETA_PUBLIK_AKTIF', nilai: 'TRUE' });
  let csv = 'jenis_surat,nama_pemilik\n'; for (let i = 0; i < 60; i++) csv += 'SPT,Fiktif ' + i + '\n';
  env8.call('importCSV', tok, { csv, mode: 'commit' });
  const feats = [];
  for (let i = 1; i <= 60; i++) {
    const pts = []; for (let k = 0; k < 150; k++) { const a = k / 150 * 2 * Math.PI; pts.push([113.9 + i * 0.01 + 0.004 * Math.cos(a), -2.2 + 0.004 * Math.sin(a)]); }
    pts.push(pts[0]);
    feats.push({ type: 'Feature', properties: { id_bidang: 'PGR-' + String(i).padStart(6, '0') }, geometry: { type: 'Polygon', coordinates: [pts] } });
  }
  assert.strictEqual(env8.call('importGeoJSON', tok, { featureCollection: { type: 'FeatureCollection', features: feats }, mode: 'commit' }).data.saved, 60);
  const a = env8.call('getPublicMapData', null, {});
  const b = env8.call('getPublicMapData', null, {});
  assert.strictEqual(a.data.features.length, 60);
  assert.strictEqual(JSON.stringify(a.data.features), JSON.stringify(b.data.features), 'hasil dari cache harus sama');
  assert.ok(JSON.stringify(a).length > 100000, 'data uji harus > 100 KB agar pemecahan teruji');
});

console.log('\n==============================');
console.log('Lulus: ' + passed + '  Gagal: ' + failed);
if (failed) { console.log('\nDaftar gagal:\n- ' + failures.join('\n- ')); process.exit(1); }
