/* Uji alur formulir & penanganan galat. Pustaka CDN diblokir; Leaflet diganti STUB (Proxy) hanya untuk memastikan
   map.js berjalan tanpa ReferenceError. Ini BUKAN uji Leaflet asli. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, q.url.split('?')[0].replace(/^\/$/, '/index.html'));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'text/plain' }); fs.createReadStream(p).pipe(r);
});
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok  ' : '  GAGAL ') + m); };
const STUB = `(function(){function mk(){var f=function(){return mk()};return new Proxy(f,{get:function(t,k){if(k==='then')return undefined;if(k===Symbol.toPrimitive)return function(){return 0};if(k==='getBounds')return function(){return {isValid:function(){return true}}};return mk()},apply:function(){return mk()},construct:function(){return mk()}})}
window.L=mk();window.L.Draw={};window.L.version='stub';})();`;
(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const br = await chromium.launch();
  const page = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/cdn\.jsdelivr\.net\/npm\/leaflet@/, r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().endsWith('.js') ? STUB : '' }));
  await page.route(/cdn\.jsdelivr\.net|accounts\.google\.com|tile\.openstreetmap/, r => r.abort());
  await page.goto(base); await page.waitForSelector('#view-dashboard .stat-grid');
  await page.click('.user-box .btn-primary'); await page.click('text=Masuk sebagai Administrator (demo)'); await page.waitForSelector('.user-name');

  // Peta dengan stub: tidak boleh melempar galat JS
  await page.goto(base + '#/peta'); await page.waitForTimeout(1500);
  ok(await page.locator('#view-peta .map-side').count() === 1, 'panel peta dibangun (stub)');
  ok(errs.length === 0, 'peta berjalan tanpa galat JS (stub)' + (errs.length ? ': ' + errs[0] : ''));
  errs.length = 0;

  // Formulir tambah bidang: validasi klien
  await page.goto(base + '#/inventaris'); await page.waitForSelector('#view-inventaris table tbody tr');
  await page.click('#view-inventaris .btn-primary:has-text("Tambah")');
  await page.waitForSelector('.modal');
  await page.click('.modal-foot .btn-primary');
  await page.waitForTimeout(300);
  ok(await page.locator('.modal .field.has-error').count() > 0, 'validasi: isian wajib kosong ditolak');
  await page.fill('.modal [name=nama_pemilik]', 'Warga Uji (DEMO)');
  await page.selectOption('.modal [name=jenis_surat]', 'SPT');
  await page.fill('.modal [name=nomor_surat]', 'CONTOH-UJI/2026');
  await page.click('.modal-foot .btn-primary');
  await page.waitForTimeout(900);
  ok(await page.locator('.modal').count() === 0, 'bidang baru tersimpan, modal tertutup');
  await page.waitForTimeout(500);
  ok(await page.locator('#view-inventaris table tbody tr').count() === 9, 'tabel menjadi 9 baris');
  ok(/PGR-000009/.test(await page.textContent('#view-inventaris')), 'ID otomatis PGR-000009');

  // Duplikat nomor surat -> konfirmasi
  await page.click('#view-inventaris .btn-primary:has-text("Tambah")'); await page.waitForSelector('.modal');
  await page.fill('.modal [name=nama_pemilik]', 'Warga Lain (DEMO)'); await page.selectOption('.modal [name=jenis_surat]', 'SPT');
  await page.fill('.modal [name=nomor_surat]', 'CONTOH-UJI/2026');
  await page.click('.modal-foot .btn-primary'); await page.waitForTimeout(900);
  ok(await page.locator('.modal').count() >= 2 || /duplikat|sudah|sama/i.test(await page.textContent('#modalRoot')), 'duplikat nomor surat memunculkan konfirmasi');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // Impor CSV: pratinjau menolak baris tak valid
  await page.goto(base + '#/admin'); await page.waitForSelector('#view-admin .tabs');
  await page.click('#view-admin .tab:has-text("Impor")'); await page.click('#view-admin .card button:has-text("Impor CSV")');
  await page.waitForSelector('.modal input[type=file]');
  await page.setInputFiles('.modal input[type=file]', { name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from('jenis_surat,nama_pemilik,nomor_surat\nSPT,Uji A (DEMO),CONTOH-CSV-1\nXXX,Uji B,CONTOH-CSV-2\n') });
  await page.waitForSelector('.import-report', { timeout: 6000 });
  const rep = await page.textContent('.import-report');
  ok(/Valid/.test(rep) && /Ditolak/.test(rep) && /Baris 2|Baris 3/.test(rep), 'pratinjau CSV: 1 valid, 1 ditolak dengan nomor baris');
  await page.click('.modal-foot .btn-primary'); await page.waitForSelector('.modal-overlay >> nth=1'); await page.click('.modal-overlay >> nth=1 >> .btn-primary');
  await page.waitForTimeout(1200);
  ok(/1 bidang ditambahkan/.test(await page.textContent('#toastRoot')), 'impor CSV tersimpan 1 baris');
  await page.keyboard.press('Escape');

  // Berkas bukan JSON untuk batas wilayah
  await page.click('#view-admin .tab:has-text("Batas")'); await page.click('#view-admin .tabpanel button:has-text("batas wilayah")');
  await page.setInputFiles('.modal input[type=file]', { name: 'x.geojson', mimeType: 'application/json', buffer: Buffer.from('bukan json') });
  await page.waitForTimeout(500);
  ok(/bukan JSON/i.test(await page.textContent('.modal .form-errors')), 'GeoJSON rusak ditolak dengan pesan jelas');
  await page.keyboard.press('Escape');

  ok(errs.length === 0, 'tanpa galat JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close();

  // Mode produksi tanpa API_URL -> NOT_CONFIGURED tampil jelas
  const br2 = await chromium.launch(); const p2 = await br2.newPage();
  await p2.route(/cdn\.jsdelivr\.net|accounts\.google\.com/, r => r.abort());
  await p2.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.SIPETA_CONFIG={MODE:'production',API_URL:'',GOOGLE_CLIENT_ID:'',MAP_DEFAULT_CENTER:[-2.21,113.92],MAP_DEFAULT_ZOOM:12,REQUEST_TIMEOUT_MS:5000};" }));
  await p2.goto(base); await p2.waitForSelector('#modeBanner:not([hidden])', { timeout: 8000 });
  ok(/Alamat API belum diatur/.test(await p2.textContent('#modeBanner')), 'produksi tanpa API_URL: banner galat konfigurasi');
  await p2.waitForSelector('#view-dashboard .errorbox'); ok(true, 'dashboard menampilkan kotak galat + coba lagi');
  // API tak terjangkau
  await p2.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.SIPETA_CONFIG={MODE:'production',API_URL:'https://script.google.com/macros/s/X/exec',GOOGLE_CLIENT_ID:'',REQUEST_TIMEOUT_MS:5000};" }));
  await p2.route(/script\.google\.com/, r => r.abort());
  await p2.reload(); await p2.waitForSelector('#view-dashboard .errorbox', { timeout: 15000 });
  ok(/internet|server|terhubung|menghubungi/i.test(await p2.textContent('#view-dashboard')), 'API tak terjangkau: pesan jaringan dalam bahasa Indonesia');
  await br2.close(); srv.close();
  console.log('\nLulus: ' + pass + '  Gagal: ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
