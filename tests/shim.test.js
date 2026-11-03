'use strict';
/** Uji shim layanan (SHA-256 dan aturan penyimpanan). Jalankan: node tests/shim.test.js */
const assert = require('assert');
const crypto = require('crypto');
const shim = require('../assets/js/gas-shim.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔ ' + name); }
  catch (e) { failed++; console.log('  ✘ ' + name + '\n      ' + e.message.split('\n')[0]); }
}

console.log('Shim layanan Apps Script');
test('SHA-256 sama dengan crypto Node untuk berbagai masukan', () => {
  const inputs = ['', 'a', 'abc', 'Halo Dunia', 'Ünïcödé ✓ 日本語', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65),
    'y'.repeat(1000), 'z'.repeat(100000), 'token-sesi-' + 'k'.repeat(64)];
  inputs.forEach(s => {
    const mine = Buffer.from(shim.sha256Bytes(shim.utf8Bytes(s))).toString('hex');
    const ref = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.strictEqual(mine, ref, 'beda untuk panjang ' + s.length);
  });
});
test('computeDigest mengembalikan 32 byte bertanda seperti Apps Script', () => {
  const env = shim.create();
  const d = env.services.Utilities.computeDigest('SHA_256', 'abc');
  assert.strictEqual(d.length, 32);
  assert.ok(d.every(b => b >= -128 && b <= 127));
});
test('cache menolak nilai > 100 KB dan kunci > 250 karakter', () => {
  const c = shim.create().services.CacheService.getScriptCache();
  assert.throws(() => c.put('k', 'x'.repeat(100001)));
  assert.throws(() => c.put('k'.repeat(251), 'x'));
  c.put('k', 'ok');
  assert.strictEqual(c.get('k'), 'ok');
});
test('cache kedaluwarsa menurut TTL', () => {
  const env = shim.create();
  const c = env.services.CacheService.getScriptCache();
  c.put('a', '1', 1);
  env.cache.get('a').exp = Date.now() - 1;
  assert.strictEqual(c.get('a'), null);
});
test('setValues menolak dimensi salah dan baris di luar batas', () => {
  const env = shim.create();
  const sh = env.ss.insertSheet('T');
  assert.throws(() => sh.getRange(1, 1, 1, 2).setValues([[1]]));
  assert.throws(() => sh.getRange(1, 1, 2, 1).setValues([[1]]));
  assert.throws(() => sh.getRange(2000, 1, 1, 1).setValues([[1]]));
  sh.getRange(1, 1, 1, 2).setValues([['a', 'b']]);
  assert.strictEqual(sh.getLastRow(), 1);
});
test('sel > 50.000 karakter ditolak', () => {
  const sh = shim.create().ss.insertSheet('T');
  assert.throws(() => sh.getRange(1, 1, 1, 1).setValues([['x'.repeat(50001)]]));
});

console.log('\nLulus: ' + passed + '  Gagal: ' + failed);
if (failed) process.exit(1);
