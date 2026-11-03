/**
 * SIPETA PAGER - gas-shim.js
 * Simulasi layanan Google Apps Script (Spreadsheet, Cache, Lock, Properties, dst.) di memori.
 * Dipakai oleh:
 *   1) MODE DEMO di browser  -> menjalankan kode backend asli (apps-script/*.gs) tanpa Google.
 *   2) Uji otomatis di Node  -> tests/gas-mock.js
 * File ini TIDAK dipakai pada mode produksi dan tidak pernah menyentuh Google Sheets sungguhan.
 * Aturan asli ditegakkan: nilai cache <= 100 KB, kunci cache <= 250 karakter, dimensi setValues
 * ketat, sel <= 50.000 karakter, dan batas jumlah baris sheet.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SIPETA_GAS_SHIM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- SHA-256 murni JavaScript (sinkron) ---------- */
  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(String(str)));
    var out = new Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  var K = [], H0 = [];
  (function initConstants() {
    var composite = {}, count = 0;
    for (var cand = 2; count < 64; cand++) {
      if (composite[cand]) continue;
      for (var i = cand * cand; i < 400; i += cand) composite[i] = true;
      if (count < 8) H0[count] = (Math.pow(cand, 0.5) * 4294967296) | 0;
      K[count++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0;
    }
  })();
  function sha256Bytes(msg) {
    var l = msg.length, i;
    var nWords = (((l + 8) >> 6) + 1) * 16;
    var w = new Array(nWords);
    for (i = 0; i < nWords; i++) w[i] = 0;
    for (i = 0; i < l; i++) w[i >> 2] |= msg[i] << (24 - (i & 3) * 8);
    w[l >> 2] |= 0x80 << (24 - (l & 3) * 8);
    w[nWords - 2] = Math.floor(l * 8 / 4294967296);
    w[nWords - 1] = (l * 8) | 0;
    var hash = H0.slice(0, 8);
    for (var o = 0; o < nWords; o += 16) {
      var W = w.slice(o, o + 16);
      for (i = 16; i < 64; i++) {
        var w15 = W[i - 15], w2 = W[i - 2];
        var s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
        var s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      hash = [(hash[0] + a) | 0, (hash[1] + b) | 0, (hash[2] + c) | 0, (hash[3] + d) | 0,
        (hash[4] + e) | 0, (hash[5] + f) | 0, (hash[6] + g) | 0, (hash[7] + h) | 0];
    }
    var out = [];
    for (i = 0; i < 8; i++) for (var s = 3; s >= 0; s--) out.push((hash[i] >>> (s * 8)) & 255);
    return out;
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return hex.substr(0, 8) + '-' + hex.substr(8, 4) + '-' + hex.substr(12, 4) + '-' + hex.substr(16, 4) + '-' + hex.substr(20);
  }

  /* ---------- Spreadsheet palsu ---------- */
  function FakeRange(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  FakeRange.prototype.check = function () {
    if (this.r < 1 || this.c < 1 || this.nr < 1 || this.nc < 1) throw new Error('Rentang tidak valid');
    if (this.r + this.nr - 1 > this.s.maxRows) throw new Error('Baris di luar batas sheet ' + this.s.name + ' (' + (this.r + this.nr - 1) + ' > ' + this.s.maxRows + ')');
  };
  FakeRange.prototype.getValues = function () {
    this.check();
    var out = [];
    for (var i = 0; i < this.nr; i++) {
      var row = [];
      for (var j = 0; j < this.nc; j++) {
        var v = (this.s.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  };
  FakeRange.prototype.setValues = function (vals) {
    var self = this;
    this.check();
    if (!Array.isArray(vals) || vals.length !== this.nr) throw new Error('Dimensi baris setValues tidak cocok: ' + (vals && vals.length) + ' vs ' + this.nr);
    vals.forEach(function (row, i) {
      if (!Array.isArray(row) || row.length !== self.nc) throw new Error('Dimensi kolom setValues tidak cocok: ' + (row && row.length) + ' vs ' + self.nc);
      row.forEach(function (v, j) {
        if (typeof v === 'string' && v.length > 50000) throw new Error('Sel melebihi 50.000 karakter');
        var rr = self.r - 1 + i;
        while (self.s.data.length <= rr) self.s.data.push([]);
        self.s.data[rr][self.c - 1 + j] = v;
      });
    });
    return this;
  };
  FakeRange.prototype.clearContent = function () {
    this.check();
    for (var i = 0; i < this.nr; i++) {
      var rr = this.r - 1 + i;
      if (this.s.data[rr]) for (var j = 0; j < this.nc; j++) this.s.data[rr][this.c - 1 + j] = '';
    }
    return this;
  };
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor'].forEach(function (m) {
    FakeRange.prototype[m] = function () { return this; };
  });

  function FakeSheet(name) { this.name = name; this.data = []; this.maxRows = 1000; }
  FakeSheet.prototype.getLastRow = function () {
    for (var i = this.data.length - 1; i >= 0; i--) {
      if ((this.data[i] || []).some(function (v) { return v !== '' && v !== undefined && v !== null; })) return i + 1;
    }
    return 0;
  };
  FakeSheet.prototype.getMaxRows = function () { return this.maxRows; };
  FakeSheet.prototype.insertRowsAfter = function (pos, n) { this.maxRows += n; };
  FakeSheet.prototype.getRange = function (r, c, nr, nc) { return new FakeRange(this, r, c, nr || 1, nc || 1); };
  FakeSheet.prototype.setFrozenRows = function () {};

  function FakeSpreadsheet() { this.sheets = {}; }
  FakeSpreadsheet.prototype.getName = function () { return 'SIPETA (simulasi di memori)'; };
  FakeSpreadsheet.prototype.getSheetByName = function (n) { return this.sheets[n] || null; };
  FakeSpreadsheet.prototype.insertSheet = function (n) { this.sheets[n] = new FakeSheet(n); return this.sheets[n]; };

  /* ---------- Layanan ---------- */
  function create(opts) {
    opts = opts || {};
    var env = {
      ss: new FakeSpreadsheet(), props: {}, cache: new Map(), idTokens: {}, logs: [], errors: [],
      failOpen: false, spreadsheetId: opts.spreadsheetId || 'TEST-SHEET-ID', fetchCount: 0
    };

    function cacheGet(k) {
      if (k.length > 250) throw new Error('Kunci cache > 250 karakter');
      var e = env.cache.get(k);
      if (!e) return null;
      if (e.exp && e.exp < Date.now()) { env.cache.delete(k); return null; }
      return e.v;
    }
    function cachePut(k, v, ttl) {
      if (k.length > 250) throw new Error('Kunci cache > 250 karakter');
      v = String(v);
      if (v.length > 100000) throw new Error('Nilai cache > 100 KB');
      env.cache.set(k, { v: v, exp: Date.now() + Math.min(ttl || 600, 21600) * 1000 });
    }

    var services = {
      Logger: { log: function (m) { env.logs.push(m); } },
      PropertiesService: {
        getScriptProperties: function () {
          return {
            getProperty: function (k) { return Object.prototype.hasOwnProperty.call(env.props, k) ? env.props[k] : null; },
            setProperty: function (k, v) { env.props[k] = String(v); }
          };
        }
      },
      CacheService: {
        getScriptCache: function () {
          return {
            get: cacheGet,
            put: cachePut,
            putAll: function (o, ttl) { Object.keys(o).forEach(function (k) { cachePut(k, o[k], ttl); }); },
            getAll: function (ks) { var o = {}; ks.forEach(function (k) { var v = cacheGet(k); if (v !== null) o[k] = v; }); return o; },
            remove: function (k) { env.cache.delete(k); }
          };
        }
      },
      LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
      Utilities: {
        getUuid: uuid,
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        Charset: { UTF_8: 'UTF_8' },
        computeDigest: function (alg, s) {
          return sha256Bytes(utf8Bytes(s)).map(function (b) { return b > 127 ? b - 256 : b; });
        },
        formatDate: function (d, tz, fmt) {
          var t = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
          if (fmt === 'yyyy-MM-dd') return t.substring(0, 10);
          throw new Error('Format tidak didukung oleh simulasi: ' + fmt);
        }
      },
      Session: {
        getScriptTimeZone: function () { return 'Asia/Pontianak'; },
        getEffectiveUser: function () { return { getEmail: function () { return opts.ownerEmail || 'pemilik@example.invalid'; } }; }
      },
      SpreadsheetApp: {
        openById: function (id) {
          if (env.failOpen || id !== env.spreadsheetId) throw new Error('Tidak dapat membuka spreadsheet');
          return env.ss;
        }
      },
      UrlFetchApp: {
        fetch: function (url) {
          env.fetchCount++;
          var m = /id_token=([^&]+)/.exec(url);
          var tok = m ? decodeURIComponent(m[1]) : '';
          var info = Object.prototype.hasOwnProperty.call(env.idTokens, tok) ? env.idTokens[tok] : null;
          if (!info) return { getResponseCode: function () { return 400; }, getContentText: function () { return '{"error":"invalid_token"}'; } };
          return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(info); } };
        }
      },
      ContentService: {
        MimeType: { JSON: 'JSON' },
        createTextOutput: function (s) {
          return { content: s, mime: null, setMimeType: function (m) { this.mime = m; return this; }, getContent: function () { return this.content; } };
        }
      }
    };

    env.services = services;
    env.addIdToken = function (tok, email, extra) {
      var base = {
        aud: env.props.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com',
        exp: String(Math.floor(Date.now() / 1000) + 3600), email: email, email_verified: 'true', name: String(email).split('@')[0]
      };
      env.idTokens[tok] = Object.assign(base, extra || {});
      return tok;
    };
    return env;
  }

  return { create: create, sha256Bytes: sha256Bytes, utf8Bytes: utf8Bytes };
});
