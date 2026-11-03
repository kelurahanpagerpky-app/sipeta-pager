/* Uji UI dengan Chromium (Playwright). Pustaka CDN diblokir -> menguji jalur cadangan (tanpa Leaflet/Chart/Turf).
   Jalankan: node tests/ui.test.js  (butuh playwright + chromium) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.geojson': 'application/json', '.csv': 'text/csv' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  GAGAL ' + m); } }
(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [], csp = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await page.route(/cdn\.jsdelivr\.net|accounts\.google\.com|tile\.openstreetmap/, r => r.abort());
  await page.goto(base);
  await page.waitForSelector('#view-dashboard .stat-grid', { timeout: 15000 });
  ok(true, 'dashboard termuat');
  ok((await page.textContent('#modeBanner')).includes('MODE DEMO'), 'banner mode demo tampil');
  const total = await page.textContent('#view-dashboard .stat-value');
  ok(total.trim() === '8', 'total bidang dashboard = 8 (dari backend), dapat: ' + total);
  ok(await page.locator('#view-dashboard .barlist').count() > 0, 'grafik cadangan (barlist) tampil saat Chart.js tak ada');
  ok(await page.locator('#mainNav a').count() === 3, 'menu publik: 3 item');

  // Inventarisasi sebagai publik
  await page.click('#mainNav a[href="#/inventaris"]');
  await page.waitForTimeout(800);
  const invTxt = await page.textContent('#view-inventaris');
  ok(!/9999/.test(invTxt), 'NIK tidak tampil ke publik');
  // Laporan butuh login
  await page.goto(base + '#/laporan'); await page.waitForTimeout(500);
  ok(/masuk/i.test(await page.textContent('#view-laporan')), 'laporan meminta masuk');

  // Login petugas demo
  await page.click('.user-box .btn-primary');
  await page.click('text=Masuk sebagai Petugas (demo)');
  await page.waitForSelector('.user-name');
  ok((await page.textContent('.user-name')) === 'Petugas Demo', 'login petugas');
  await page.waitForSelector('#view-laporan .report-sec', { timeout: 8000 });
  ok(true, 'laporan tampil untuk petugas');
  ok(await page.locator('#mainNav a').count() === 4, 'menu petugas: 4 item');

  // Inventarisasi: tabel + tambah bidang
  await page.goto(base + '#/inventaris');
  await page.waitForSelector('#view-inventaris table tbody tr', { timeout: 8000 });
  const rows = await page.locator('#view-inventaris table tbody tr').count();
  ok(rows === 8, 'tabel inventarisasi 8 baris, dapat ' + rows);
  await page.click('#view-inventaris >> text=Detail >> nth=0');
  await page.waitForSelector('#detailPanel.open .detail-sec');
  ok(true, 'panel detail terbuka');
  await page.click('#detailPanel .icon-btn');

  // Peta tanpa Leaflet -> pesan galat, bukan layar kosong
  await page.goto(base + '#/peta'); await page.waitForTimeout(800);
  ok(/Leaflet|peta/i.test(await page.textContent('#view-peta')), 'peta menampilkan pesan bila Leaflet tak termuat');

  // Admin: tidak tersedia untuk petugas
  await page.goto(base + '#/admin'); await page.waitForTimeout(500);
  ok(/administrator/i.test(await page.textContent('#view-admin')), 'admin ditolak untuk petugas');
  // Login sebagai admin
  await page.click('.user-box .btn:has-text("Keluar")');
  await page.click('.user-box .btn-primary'); await page.click('text=Masuk sebagai Administrator (demo)');
  await page.waitForSelector('#view-admin .tabs', { timeout: 8000 });
  ok(await page.locator('#view-admin table tbody tr').count() >= 2, 'tab pengguna menampilkan pengguna');
  for (const t of ['Konfigurasi', 'Batas wilayah', 'Impor & cadangan', 'Log aktivitas']) {
    await page.click('#view-admin .tab:has-text("' + t + '")'); await page.waitForTimeout(500);
    ok(await page.locator('#view-admin .tabpanel > *').count() > 0 && !(await page.locator('#view-admin .errorbox').count()), 'tab ' + t + ' termuat tanpa galat');
  }
  // Mobile
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '#/dashboard'); await page.waitForTimeout(800);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 392, 'tanpa scroll horizontal di 390px (lebar ' + sw + ')');
  ok(errs.length === 0, 'tanpa galat JS tak tertangkap' + (errs.length ? ': ' + errs.join(' | ') : ''));
  ok(csp.length === 0, 'tanpa pelanggaran CSP' + (csp.length ? ': ' + csp[0] : ''));
  await page.screenshot({ path: process.env.SHOT || '/tmp/ui-mobile.png' });
  await br.close(); srv.close();
  console.log('\nLulus: ' + pass + '  Gagal: ' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
