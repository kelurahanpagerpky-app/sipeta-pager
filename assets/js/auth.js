/**
 * SIPETA PAGER - auth.js
 * Status masuk pengguna. Produksi: Google Sign-In -> ID token dikirim ke backend, yang memverifikasi
 * dan mengembalikan token sesi. Role SELALU ditentukan backend; nilai di sini hanya untuk tampilan.
 * Menyembunyikan tombol di frontend BUKAN mekanisme keamanan; backend memeriksa setiap permintaan.
 * Token sesi disimpan di sessionStorage (hilang saat tab ditutup).
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var cfg = window.SIPETA_CONFIG || {};
  var KEY = 'sipeta.token';

  var state = { user: null, role: 'PUBLIK', token: null };
  var memToken = null;

  function store(t) {
    memToken = t;
    try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) { /* penyimpanan tidak tersedia */ }
  }
  function stored() {
    try { return sessionStorage.getItem(KEY) || memToken; } catch (e) { return memToken; }
  }

  function setState(user, token) {
    state.user = user || null;
    state.role = user ? user.role : 'PUBLIK';
    state.token = token || null;
    store(token || null);
    S.emit('auth:change', { user: state.user, role: state.role });
  }

  var auth = (S.auth = {});
  auth.token = function () { return state.token; };
  auth.user = function () { return state.user; };
  auth.role = function () { return state.role; };
  auth.isAuth = function () { return !!state.token; };
  auth.isStaff = function () { return state.role === 'PETUGAS' || state.role === 'ADMINISTRATOR'; };
  auth.isAdmin = function () { return state.role === 'ADMINISTRATOR'; };

  /** Memulihkan sesi dari sessionStorage. Tidak pernah melempar galat. */
  auth.init = function () {
    var t = stored();
    if (!t) return Promise.resolve();
    state.token = t;
    return S.api.call('getCurrentUser', {}, { silent: true }).then(function (r) {
      if (r.authenticated) setState(r.user, t); else setState(null, null);
    }, function () { setState(null, null); });
  };

  auth.loginWithIdToken = function (idToken) {
    return S.api.call('login', { idToken: idToken }, { noAuth: true }).then(function (r) {
      setState(r.user, r.token);
      u.toast('Berhasil masuk sebagai ' + r.user.nama + ' (' + u.label('role', r.user.role) + ').', 'ok');
      return r.user;
    });
  };

  auth.demoLogin = function (role) {
    return auth.loginWithIdToken(S.demo.idTokenFor(role));
  };

  auth.logout = function () {
    var p = state.token ? S.api.call('logout', {}, { silent: true }).catch(function () { /* sesi dihapus di sisi klien */ }) : Promise.resolve();
    return p.then(function () {
      setState(null, null);
      u.toast('Anda telah keluar.', 'info');
    });
  };

  auth.expire = function () {
    var was = !!state.user;
    setState(null, null);
    if (was) u.toast('Sesi Anda telah berakhir. Silakan masuk kembali.', 'warn');
  };

  /* ---------- Dialog masuk ---------- */
  var gisPromise = null;
  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = function () { gisPromise = null; reject(new Error('Layanan Google Sign-In tidak dapat dimuat. Periksa koneksi internet atau pemblokir konten, lalu coba lagi.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  auth.openLogin = function () {
    var msg = h('div', { class: 'login-msg', role: 'alert' });
    var holder = h('div', { class: 'login-holder' });
    var body = h('div', { class: 'login-body' });
    var dlg;

    function showErr(e) { msg.textContent = (e && e.message) || 'Gagal masuk.'; }
    function done() { if (dlg) dlg.close(); }

    if (cfg.MODE === 'demo') {
      body.appendChild(h('p', { class: 'login-note', text: 'Mode demonstrasi: pilih peran untuk mencoba aplikasi. Semua data fiktif dan hanya ada di browser ini.' }));
      [['PETUGAS', 'Masuk sebagai Petugas (demo)'], ['ADMINISTRATOR', 'Masuk sebagai Administrator (demo)']].forEach(function (r) {
        holder.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', text: r[1], onclick: function (ev) {
          msg.textContent = '';
          u.busy(ev.currentTarget, function () { return auth.demoLogin(r[0]).then(done); }).catch(showErr);
        } }));
      });
    } else if (!cfg.GOOGLE_CLIENT_ID) {
      body.appendChild(u.errorBox({ code: 'NOT_CONFIGURED', message: 'Google Client ID belum diatur. Isi GOOGLE_CLIENT_ID pada assets/js/config.js (lihat docs/INSTALLATION.md).' }));
    } else {
      body.appendChild(h('p', { class: 'login-note', text: 'Masuk dengan akun Google yang telah didaftarkan oleh administrator kelurahan. Akun yang belum terdaftar tidak akan diberi akses.' }));
      holder.appendChild(h('div', { class: 'muted', text: 'Memuat Google Sign-In…' }));
      loadGis().then(function () {
        u.clear(holder);
        window.google.accounts.id.initialize({
          client_id: cfg.GOOGLE_CLIENT_ID,
          callback: function (resp) {
            msg.textContent = '';
            if (!resp || !resp.credential) { showErr({ message: 'Google tidak mengirim kredensial. Coba lagi.' }); return; }
            auth.loginWithIdToken(resp.credential).then(done, showErr);
          },
          auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true
        });
        window.google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'id', width: 280 });
      }, function (e) { u.clear(holder); showErr(e); });
    }
    body.appendChild(holder);
    body.appendChild(msg);
    body.appendChild(h('p', { class: 'login-foot', text: 'Pengunjung umum tidak perlu masuk untuk melihat peta dan statistik ringkas.' }));
    dlg = u.modal({ title: 'Masuk ke SIPETA PAGER', size: 'sm', body: body, buttons: [{ label: 'Tutup', onClick: function (c) { c(null); } }] });
    return dlg;
  };

  /** Dipakai pengujian otomatis dan integrasi: masuk dengan ID token Google yang sudah ada. */
  auth._loginWithIdToken = auth.loginWithIdToken;
})();
