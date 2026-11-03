/**
 * SIPETA PAGER - utils.js
 * Fungsi bantu UI. Semua teks dari pengguna/server dimasukkan lewat textContent
 * (bukan innerHTML) sehingga aman dari XSS.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = (S.u = {});

  u.LABEL = {
    inv: { LENGKAP: 'Lengkap', BELUM_LENGKAP: 'Belum lengkap' },
    ver: { SUDAH_DIVERIFIKASI: 'Sudah diverifikasi', BELUM_DIVERIFIKASI: 'Belum diverifikasi' },
    peta: { SUDAH_DIPETAKAN: 'Sudah dipetakan', BELUM_DIPETAKAN: 'Belum dipetakan' },
    arsip: { AKTIF: 'Aktif', ARSIP: 'Diarsipkan' },
    role: { ADMINISTRATOR: 'Administrator', PETUGAS: 'Petugas', PUBLIK: 'Publik' }
  };

  u.label = function (group, v) {
    var g = u.LABEL[group];
    return (g && g[v]) || (v === null || v === undefined || v === '' ? '—' : String(v));
  };

  /* ---------- DOM ---------- */
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    if (c.nodeType) { el.appendChild(c); return; }
    el.appendChild(document.createTextNode(String(c)));
  }

  u.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'required' || k === 'readOnly') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  var h = u.h;

  u.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  u.$ = function (sel, root) { return (root || document).querySelector(sel); };
  u.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  u.isNarrow = function () { return window.matchMedia && window.matchMedia('(max-width: 900px)').matches; };

  u.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  u.debounce = function (fn, ms) {
    var t = null;
    var d = function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
    d.cancel = function () { clearTimeout(t); };
    return d;
  };

  /* ---------- Format ---------- */
  var MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  u.NA = 'Belum tersedia';

  u.isNum = function (n) { return n !== null && n !== undefined && n !== '' && isFinite(Number(n)); };
  u.fmtNum = function (n, dec) {
    if (!u.isNum(n)) return '—';
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: dec === undefined ? 2 : dec, minimumFractionDigits: 0 }).format(Number(n));
  };
  u.fmtM2 = function (n, naText) { return u.isNum(n) ? u.fmtNum(n, 2) + ' m²' : (naText || u.NA); };
  u.fmtHa = function (m2) { return u.isNum(m2) ? u.fmtNum(Number(m2) / 10000, 4) + ' ha' : u.NA; };
  u.fmtMeter = function (n) { return u.isNum(n) ? u.fmtNum(n, 2) + ' m' : u.NA; };
  u.fmtDate = function (s) {
    if (!s) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (m) return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
    return u.fmtDateTime(s);
  };
  u.fmtDateTime = function (s) {
    if (!s) return '—';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    try {
      return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Pontianak' }).format(d);
    } catch (e) { return d.toISOString(); }
  };
  u.dash = function (v) { return v === null || v === undefined || v === '' ? '—' : String(v); };

  /* ---------- CSV ---------- */
  u.csvCell = function (v) {
    if (v === null || v === undefined) return '';
    var isNum = typeof v === 'number';
    var s = String(v);
    if (!isNum && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  u.toCsv = function (rows) {
    return rows.map(function (r) { return r.map(u.csvCell).join(','); }).join('\r\n');
  };
  u.download = function (filename, mime, content) {
    var bom = /csv/.test(mime) ? '﻿' : '';
    var blob = new Blob([bom + content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  };

  /* ---------- Loading, toast ---------- */
  var loadCount = 0;
  u.loading = function (on) {
    loadCount = Math.max(0, loadCount + (on ? 1 : -1));
    var bar = document.getElementById('loadingBar');
    if (bar) bar.classList.toggle('on', loadCount > 0);
  };

  u.toast = function (msg, type, ms) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    type = type || 'info';
    var t = h('div', { class: 'toast toast-' + type, role: type === 'err' ? 'alert' : 'status' }, h('span', { text: msg }),
      h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Tutup pesan', text: '×', onclick: function () { rm(); } }));
    var gone = false;
    function rm() { if (gone) return; gone = true; if (t.parentNode) t.parentNode.removeChild(t); }
    root.appendChild(t);
    while (root.children.length > 4) root.removeChild(root.firstChild);
    setTimeout(rm, ms || (type === 'err' ? 9000 : 5000));
  };

  /* ---------- Modal ---------- */
  var modalStack = [];
  u.modal = function (opts) {
    var root = document.getElementById('modalRoot');
    var prevFocus = document.activeElement;
    var titleId = 'mt' + Math.random().toString(36).slice(2, 8);
    var body = h('div', { class: 'modal-body' }, opts.body);
    var footer = h('footer', { class: 'modal-foot' });
    var closed = false;
    var api = {};
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      modalStack = modalStack.filter(function (m) { return m !== api; });
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* abaikan */ } }
      if (opts.onClose) opts.onClose(result);
    }
    (opts.buttons || []).forEach(function (b) {
      var btn = h('button', { type: 'button', class: 'btn ' + (b.kind ? 'btn-' + b.kind : ''), text: b.label, disabled: false });
      btn.addEventListener('click', function () {
        if (b.onClick) {
          var r = b.onClick(close, btn);
          if (r && r.then) { btn.disabled = true; r.then(function () { btn.disabled = false; }, function () { btn.disabled = false; }); }
        } else close(b.value);
      });
      footer.appendChild(btn);
    });
    var overlay = h('div', { class: 'modal-overlay' },
      h('div', { class: 'modal modal-' + (opts.size || 'md'), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('header', { class: 'modal-head' },
          h('h2', { id: titleId, text: opts.title || '' }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', text: '×', onclick: function () { close(null); } })),
        body, (opts.buttons && opts.buttons.length) ? footer : null));
    function onKey(e) {
      if (modalStack[modalStack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
      if (e.key === 'Tab') {
        var f = u.$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', overlay)
          .filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    api.close = close; api.el = overlay; api.body = body; api.footer = footer;
    modalStack.push(api);
    document.addEventListener('keydown', onKey, true);
    root.appendChild(overlay);
    var first = u.$('input:not([type=hidden]),select,textarea', body) || u.$('button', footer) || u.$('.icon-btn', overlay);
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* abaikan */ } }, 0);
    return api;
  };

  u.confirm = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      u.modal({
        title: o.title || 'Konfirmasi', size: 'sm',
        body: h('p', { class: 'confirm-msg', text: o.message }),
        buttons: [
          { label: o.cancelLabel || 'Batal', onClick: function (close) { close(false); } },
          { label: o.okLabel || 'Ya, lanjutkan', kind: o.danger ? 'danger' : 'primary', onClick: function (close) { done = true; close(true); } }
        ],
        onClose: function (r) { resolve(done && r === true); }
      });
    });
  };

  /* ---------- Kotak galat ---------- */
  u.errorBox = function (err, retry) {
    var msg = (err && err.message) || 'Terjadi kesalahan yang tidak diketahui.';
    var box = h('div', { class: 'errorbox', role: 'alert' },
      h('strong', { text: 'Tidak dapat memuat data' }),
      h('p', { text: msg }));
    if (err && err.details && Array.isArray(err.details)) {
      box.appendChild(h('ul', null, err.details.slice(0, 8).map(function (d) { return h('li', { text: typeof d === 'string' ? d : JSON.stringify(d) }); })));
    }
    var actions = h('div', { class: 'errorbox-actions' });
    if (err && (err.code === 'UNAUTHENTICATED' || err.code === 'SESSION_EXPIRED') && S.auth) {
      actions.appendChild(h('button', { class: 'btn btn-primary', type: 'button', text: 'Masuk', onclick: function () { S.auth.openLogin(); } }));
    }
    if (retry) actions.appendChild(h('button', { class: 'btn', type: 'button', text: 'Coba lagi', onclick: retry }));
    if (actions.children.length) box.appendChild(actions);
    if (err && err.code) box.appendChild(h('small', { class: 'muted', text: 'Kode: ' + err.code }));
    return box;
  };

  u.empty = function (title, text) {
    return h('div', { class: 'emptybox' }, h('strong', { text: title }), text ? h('p', { text: text }) : null);
  };

  u.badge = function (kind, text) { return h('span', { class: 'badge badge-' + kind, text: text }); };
  u.invBadge = function (v) { return u.badge(v === 'LENGKAP' ? 'ok' : 'warn', u.label('inv', v)); };
  u.verBadge = function (v) { return u.badge(v === 'SUDAH_DIVERIFIKASI' ? 'info' : 'muted', u.label('ver', v)); };
  u.petaBadge = function (v) { return u.badge(v === 'SUDAH_DIPETAKAN' ? 'ok' : 'muted', u.label('peta', v)); };

  /* ---------- Formulir ---------- */
  /**
   * Membuat satu baris isian. Mengembalikan {el, input, get(), set(v), error(msg)}.
   * o: {label, name, type, value, required, help, options[{value,label}], maxlength, placeholder, readonly, inputmode, rows}
   */
  u.field = function (o) {
    var id = 'f_' + o.name + '_' + Math.random().toString(36).slice(2, 6);
    var input;
    if (o.type === 'select') {
      input = h('select', { id: id, name: o.name });
      (o.options || []).forEach(function (op) { input.appendChild(h('option', { value: op.value, text: op.label })); });
    } else if (o.type === 'textarea') {
      input = h('textarea', { id: id, name: o.name, rows: o.rows || 3, maxlength: o.maxlength });
    } else {
      input = h('input', { id: id, name: o.name, type: o.type || 'text', maxlength: o.maxlength, inputmode: o.inputmode, autocomplete: 'off' });
    }
    if (o.placeholder) input.setAttribute('placeholder', o.placeholder);
    if (o.readonly) input.readOnly = true;
    if (o.value !== undefined && o.value !== null) input.value = o.value;
    var err = h('div', { class: 'field-error', id: id + '_e', role: 'alert' });
    var help = o.help ? h('div', { class: 'field-help', id: id + '_h', text: o.help }) : null;
    var el = h('div', { class: 'field' + (o.wide ? ' field-wide' : '') },
      h('label', { for: id }, o.label, o.required ? h('span', { class: 'req', title: 'wajib diisi', text: ' *' }) : null),
      input, help, err);
    return {
      el: el, input: input,
      get: function () { return input.value; },
      set: function (v) { input.value = v === null || v === undefined ? '' : v; },
      error: function (m) {
        err.textContent = m || '';
        el.classList.toggle('has-error', !!m);
        if (m) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', id + '_e'); }
        else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
      }
    };
  };

  /* ---------- Berkas ---------- */
  u.readFileText = function (file, maxBytes) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Tidak ada berkas dipilih.'));
      if (file.size > maxBytes) return reject(new Error('Ukuran berkas ' + Math.round(file.size / 1024) + ' KB melebihi batas ' + Math.round(maxBytes / 1024) + ' KB.'));
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('Berkas tidak dapat dibaca.')); };
      r.readAsText(file, 'utf-8');
    });
  };

  u.parseJson = function (text, what) {
    try { return JSON.parse(text); }
    catch (e) { throw new Error((what || 'Berkas') + ' bukan JSON yang valid: ' + e.message); }
  };

  /** Memakai tombol sambil menjalankan fungsi async, mencegah klik ganda. */
  u.busy = function (btn, fn) {
    if (btn.disabled) return Promise.resolve();
    var label = btn.textContent;
    btn.disabled = true; btn.classList.add('is-busy');
    return Promise.resolve().then(fn).then(function (r) { btn.disabled = false; btn.classList.remove('is-busy'); btn.textContent = label; return r; },
      function (e) { btn.disabled = false; btn.classList.remove('is-busy'); btn.textContent = label; throw e; });
  };
})();
