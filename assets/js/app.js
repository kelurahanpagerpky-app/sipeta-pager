/**
 * SIPETA PAGER - app.js
 * Router hash, boot aplikasi, navigasi berbasis role, banner mode, dan penanganan galat global.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var cfg = window.SIPETA_CONFIG || {};
  var app = (S.app = {});
  var VIEWS = { dashboard: 'Dashboard', peta: 'Peta', inventaris: 'Inventarisasi', laporan: 'Laporan', admin: 'Administrasi' };
  var current = null, pendingParams = null, cfgPromise = null, booted = false;

  S.cfg = null;

  /** Memuat konfigurasi publik (warna, jenis surat, status peta publik). Galat tidak menghentikan aplikasi. */
  app.loadConfig = function (force) {
    if (S.cfg && !force) return Promise.resolve(S.cfg);
    if (cfgPromise && !force) return cfgPromise;
    cfgPromise = S.api.call('getPublicConfig', {}, { silent: true, noAuth: true }).then(function (c) {
      S.cfg = c; cfgPromise = null; return c;
    }, function (e) {
      cfgPromise = null;
      S.cfg = S.cfg || { jenis_surat: ['SPT', 'SHM', 'LAINNYA'], warna: null, peta_publik_aktif: false, _fallback: true };
      showBanner(e);
      return S.cfg;
    });
    return cfgPromise;
  };

  /* ---------- Banner status ---------- */
  function showBanner(err) {
    var el = document.getElementById('modeBanner');
    if (!el) return;
    u.clear(el);
    var parts = [];
    if (cfg.MODE === 'demo') parts.push(h('span', null, h('strong', { text: 'MODE DEMO. ' }), 'Data di bawah ini fiktif dan hanya ada di memori browser; tidak ada yang disimpan ke spreadsheet. Batas dan koordinat bukan data resmi Kelurahan Pager.'));
    if (err) parts.push(h('span', { class: 'banner-err' }, h('strong', { text: 'Server tidak dapat dihubungi. ' }), err.message + ' ',
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Coba lagi', onclick: function () { app.loadConfig(true).then(function () { clearErr(); route(); }); } })));
    el.hidden = !parts.length;
    el.className = 'mode-banner' + (err ? ' mode-banner-err' : '');
    parts.forEach(function (p) { el.appendChild(p); });
  }
  function clearErr() { showBanner(null); }

  /* ---------- Navigasi ---------- */
  function allowed(view) {
    if (view === 'laporan' || view === 'inventaris') return true; // halaman menampilkan pesan masuk bila perlu
    return !!VIEWS[view];
  }

  function parseHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var name = raw.split('?')[0] || 'dashboard';
    return allowed(name) ? name : 'dashboard';
  }

  app.go = function (view, params) {
    pendingParams = params || null;
    if (parseHash() === view && location.hash) { route(); } else { location.hash = '#/' + view; }
  };

  function renderNav() {
    var nav = document.getElementById('mainNav');
    if (!nav) return;
    u.clear(nav);
    var items = ['dashboard', 'peta', 'inventaris'];
    if (S.auth.isStaff()) items.push('laporan');
    if (S.auth.isAdmin()) items.push('admin');
    items.forEach(function (v) {
      nav.appendChild(h('a', { href: '#/' + v, class: 'nav-link' + (current === v ? ' active' : ''), 'aria-current': current === v ? 'page' : null, text: VIEWS[v] }));
    });
  }

  function renderUser() {
    var box = document.getElementById('userBox');
    if (!box) return;
    u.clear(box);
    var user = S.auth.user();
    if (user) {
      box.appendChild(h('span', { class: 'user-name', text: user.nama }));
      box.appendChild(u.badge('info', u.label('role', user.role)));
      box.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Keluar', onclick: function () { S.auth.logout(); } }));
    } else {
      box.appendChild(h('span', { class: 'muted small', text: 'Pengunjung' }));
      box.appendChild(h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Masuk', onclick: function () { S.auth.openLogin(); } }));
    }
  }

  function route() {
    var view = parseHash();
    var params = pendingParams; pendingParams = null;
    if (S.detail && view !== 'peta' && view !== 'inventaris') S.detail.close();
    Object.keys(VIEWS).forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('active', v === view);
    });
    var left = current;
    current = view;
    document.title = VIEWS[view] + ' - SIPETA PAGER';
    renderNav();
    var mod = { dashboard: S.dashboard, peta: S.map, inventaris: S.inventory, laporan: S.reports, admin: S.admin }[view];
    var main = document.getElementById('main');
    if (left !== view && main) { main.scrollTop = 0; window.scrollTo(0, 0); }
    if (!mod || !mod.show) { showViewError(view, new Error('Modul halaman gagal dimuat. Muat ulang halaman.')); return; }
    try {
      var p = mod.show(params || {});
      if (p && p.catch) p.catch(function (e) { showViewError(view, e); });
    } catch (e) { showViewError(view, e); }
  }

  function showViewError(view, e) {
    var el = document.getElementById('view-' + view);
    if (!el) return;
    u.clear(el);
    el.appendChild(u.errorBox({ code: e && e.code, message: (e && e.message) || 'Terjadi kesalahan saat menampilkan halaman.' }, route));
    if (window.console) console.error(e);
  }

  /* ---------- Pemeriksaan pustaka ---------- */
  function libWarnings() {
    var miss = [];
    if (!window.L) miss.push('peta (Leaflet)');
    else if (!window.L.Draw) miss.push('digitasi (Leaflet Draw)');
    if (!window.turf) miss.push('perhitungan geospasial (Turf.js; dipakai rumus cadangan)');
    if (!window.Chart) miss.push('grafik (Chart.js; diganti diagram sederhana)');
    if (miss.length) u.toast('Sebagian pustaka tidak termuat: ' + miss.join(', ') + '. Periksa koneksi internet lalu muat ulang.', 'warn', 12000);
  }

  /* ---------- Galat global ---------- */
  window.addEventListener('error', function (ev) {
    if (window.console) console.error('Galat tak tertangkap:', ev.error || ev.message);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    if (window.console) console.error('Promise ditolak:', ev.reason);
    var r = ev.reason;
    if (r && r.name === 'ApiError') return; // sudah ditangani pemanggil
    u.toast('Terjadi kesalahan tak terduga. Muat ulang halaman jika tampilan tidak normal.', 'err');
  });
  window.addEventListener('offline', function () { u.toast('Anda sedang offline. Perubahan tidak dapat disimpan.', 'warn'); });
  window.addEventListener('online', function () { u.toast('Koneksi kembali tersambung.', 'ok', 3000); });

  /* ---------- Boot ---------- */
  function boot() {
    if (booted) return;
    booted = true;
    var hero = document.getElementById('bootMsg');
    showBanner(null);
    renderUser(); renderNav();
    Promise.resolve()
      .then(function () { return app.loadConfig(); })
      .then(function () { return S.auth.init(); })
      .then(function () {
        if (hero) hero.hidden = true;
        renderUser();
        window.addEventListener('hashchange', route);
        route();
        libWarnings();
      })
      .catch(function (e) {
        if (hero) { u.clear(hero); hero.appendChild(u.errorBox(e, function () { location.reload(); })); }
      });
  }

  S.on('auth:change', function () {
    renderUser(); renderNav();
    if (!S.auth.isStaff() && (current === 'laporan' || current === 'admin')) { /* modul menampilkan pesan masuk */ }
  });
  S.on('config:changed', function () { app.loadConfig(true); });

  app.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
