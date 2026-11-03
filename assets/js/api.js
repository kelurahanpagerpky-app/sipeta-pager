/**
 * SIPETA PAGER - api.js
 * Satu-satunya jalur komunikasi dengan backend.
 *  - Produksi : POST text/plain (tanpa preflight CORS) ke Web App Apps Script, JSON {action, token, params}.
 *  - Demo     : memanggil backend asli yang berjalan di memori browser (demo.js).
 * Semua galat dinormalkan menjadi ApiError berbahasa Indonesia.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u;
  var cfg = window.SIPETA_CONFIG || {};

  /* ---------- Pub/sub sederhana ---------- */
  var handlers = {};
  S.on = function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); };
  S.emit = function (evt, data) {
    (handlers[evt] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { if (window.console) console.error('Handler ' + evt + ' gagal:', e); }
    });
  };

  function ApiError(code, message, details, status) {
    this.name = 'ApiError';
    this.code = code;
    this.message = message;
    this.details = details === undefined ? null : details;
    this.status = status || 0;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;
  S.ApiError = ApiError;

  var READ_ACTIONS = {
    healthCheck: 1, getPublicConfig: 1, getBoundary: 1, getPublicMapData: 1, getDashboardStats: 1, searchLand: 1,
    getLandDetail: 1, getReport: 1, getLandHistory: 1, listUsers: 1, getActivityLog: 1, getCurrentUser: 1
  };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function transport(action, token, params, timeoutMs) {
    if (cfg.MODE === 'demo') {
      return S.demo.handle(action, token, params);
    }
    if (!cfg.API_URL) {
      return Promise.reject(new ApiError('NOT_CONFIGURED', 'Alamat API belum diatur. Isi API_URL pada assets/js/config.js dengan URL Web App Google Apps Script, atau gunakan MODE "demo".'));
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.reject(new ApiError('OFFLINE', 'Perangkat tidak terhubung ke internet. Periksa koneksi Anda lalu coba lagi.'));
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: token || undefined, params: params || {} }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store'
    };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(cfg.API_URL, opts).then(function (resp) {
      return resp.text().then(function (text) {
        clearTimeout(timer);
        var json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        if (!json || typeof json !== 'object' || typeof json.success !== 'boolean') {
          var htmlLike = /^\s*</.test(text);
          throw new ApiError('BAD_RESPONSE', htmlLike
            ? 'Server mengirim halaman web, bukan data. Penyebab umum: deployment Apps Script belum diatur "Siapa saja" dapat mengakses, URL /exec salah, atau skrip mengalami galat. Lihat docs/DEPLOYMENT.md.'
            : 'Respons server tidak dapat dibaca.', null, resp.status);
        }
        return json;
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (e instanceof ApiError) throw e;
      if (e && e.name === 'AbortError') throw new ApiError('TIMEOUT', 'Server terlalu lama merespons. Coba lagi beberapa saat lagi.');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('OFFLINE', 'Koneksi internet terputus. Periksa koneksi Anda lalu coba lagi.');
      throw new ApiError('NETWORK', 'Server tidak dapat dihubungi. Periksa koneksi internet dan URL API, lalu coba lagi.');
    });
  }

  /**
   * Memanggil aksi backend. Mengembalikan data sukses atau melempar ApiError.
   * opts: {silent, noAuth, timeout}
   */
  function call(action, params, opts) {
    opts = opts || {};
    var token = opts.noAuth ? null : (S.auth ? S.auth.token() : null);
    var timeoutMs = opts.timeout || cfg.REQUEST_TIMEOUT_MS || 30000;
    if (!opts.silent) u.loading(true);
    var attempt = function (n) {
      return transport(action, token, params, timeoutMs).catch(function (e) {
        var transient = e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT');
        if (transient && n === 0 && READ_ACTIONS[action]) return sleep(900).then(function () { return attempt(1); });
        throw e;
      });
    };
    return attempt(0).then(function (json) {
      if (!opts.silent) u.loading(false);
      if (json.success) return json.data;
      var err = new ApiError(json.errorCode || 'ERROR', json.message || 'Permintaan tidak dapat diproses.', json.details, 0);
      if (err.code === 'SESSION_EXPIRED' && S.auth && !opts.noAuth) S.auth.expire();
      throw err;
    }, function (e) {
      if (!opts.silent) u.loading(false);
      throw e;
    });
  }

  S.api = { call: call };
})();
