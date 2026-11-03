/**
 * SIPETA PAGER - inventory.js
 * Halaman inventarisasi (tabel server-side: pencarian, filter, urut, paginasi) dan formulir tambah/ubah.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var inv = (S.inventory = {});

  var st = { q: '', jenis_surat: '', status_inventarisasi: '', status_verifikasi: '', status_pemetaan: '', rt: '', rw: '', page: 1, pageSize: 25, sortBy: 'id_bidang', sortDir: 'asc', includeArchived: false };
  var root = null, tableHolder = null, pager = null, countEl = null, built = false, seq = 0, lastQuery = null;
  var ctl = {};

  function opts(list, firstLabel) {
    return [{ value: '', label: firstLabel }].concat(list);
  }

  function build() {
    root = document.getElementById('view-inventaris');
    u.clear(root);
    var staff = S.auth.isStaff(), admin = S.auth.isAdmin();
    var jenis = (S.cfg && S.cfg.jenis_surat) || ['SPT', 'SHM', 'LAINNYA'];

    var q = h('input', { type: 'search', placeholder: staff ? 'Cari ID, nomor surat, nama pemilik, alamat, RT/RW…' : 'Cari ID bidang atau jenis dokumen…', 'aria-label': 'Cari bidang tanah', value: st.q, maxlength: '100' });
    var debounced = u.debounce(function () { st.q = q.value.trim(); st.page = 1; load(); }, 350);
    q.addEventListener('input', debounced);
    ctl.q = q;

    function sel(key, label, list) {
      var s = h('select', { 'aria-label': label });
      opts(list, label).forEach(function (o) { s.appendChild(h('option', { value: o.value, text: o.label })); });
      s.value = st[key];
      s.addEventListener('change', function () { st[key] = s.value; st.page = 1; load(); });
      ctl[key] = s;
      return s;
    }
    function num(key, label) {
      var i = h('input', { type: 'text', inputmode: 'numeric', maxlength: '3', placeholder: label, 'aria-label': 'Filter ' + label, class: 'narrow', value: st[key] });
      i.addEventListener('input', u.debounce(function () { st[key] = i.value.replace(/\D/g, ''); st.page = 1; load(); }, 400));
      ctl[key] = i;
      return i;
    }

    var bar = h('div', { class: 'toolbar' },
      h('div', { class: 'toolbar-row' }, q,
        sel('jenis_surat', 'Semua jenis dokumen', jenis.map(function (j) { return { value: j, label: j }; })),
        sel('status_inventarisasi', 'Semua status data', [{ value: 'LENGKAP', label: 'Lengkap' }, { value: 'BELUM_LENGKAP', label: 'Belum lengkap' }]),
        sel('status_verifikasi', 'Semua status verifikasi', [{ value: 'SUDAH_DIVERIFIKASI', label: 'Sudah diverifikasi' }, { value: 'BELUM_DIVERIFIKASI', label: 'Belum diverifikasi' }]),
        sel('status_pemetaan', 'Semua status pemetaan', [{ value: 'SUDAH_DIPETAKAN', label: 'Sudah dipetakan' }, { value: 'BELUM_DIPETAKAN', label: 'Belum dipetakan' }]),
        staff ? num('rt', 'RT') : null, staff ? num('rw', 'RW') : null),
      h('div', { class: 'toolbar-row toolbar-actions' },
        admin ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.includeArchived, onchange: function (e) { st.includeArchived = e.target.checked; st.page = 1; load(); } }), ' Tampilkan yang diarsipkan') : null,
        h('button', { class: 'btn', type: 'button', text: 'Reset filter', onclick: reset }),
        staff ? h('button', { class: 'btn', type: 'button', text: 'Ekspor CSV', onclick: function (e) { exportCsv(e.currentTarget); } }) : null,
        admin ? h('button', { class: 'btn', type: 'button', text: 'Impor CSV', onclick: function () { S.admin.openCsvImport(); } }) : null,
        staff ? h('button', { class: 'btn btn-primary', type: 'button', text: '+ Tambah bidang', onclick: function () { openForm(null, { onSaved: function (id) { S.emit('data:changed', { id: id }); } }); } }) : null));

    countEl = h('div', { class: 'result-count', 'aria-live': 'polite' });
    tableHolder = h('div', { class: 'table-wrap' });
    pager = h('div', { class: 'pager' });
    root.appendChild(h('div', { class: 'page-head' }, h('h1', { text: 'Inventarisasi Tanah' }),
      h('p', { class: 'muted', text: 'Daftar bidang tanah yang telah diinventarisasi. Data dimuat per halaman dari server.' })));
    root.appendChild(bar);
    root.appendChild(countEl);
    root.appendChild(tableHolder);
    root.appendChild(pager);
    built = true;
  }

  function reset() {
    st.q = ''; st.jenis_surat = ''; st.status_inventarisasi = ''; st.status_verifikasi = ''; st.status_pemetaan = ''; st.rt = ''; st.rw = ''; st.page = 1; st.includeArchived = false;
    built = false; show();
  }

  function query() {
    var p = { q: st.q, page: st.page, pageSize: st.pageSize, sortBy: st.sortBy, sortDir: st.sortDir };
    ['jenis_surat', 'status_inventarisasi', 'status_verifikasi', 'status_pemetaan', 'rt', 'rw'].forEach(function (k) { if (st[k]) p[k] = st[k]; });
    if (st.includeArchived) p.includeArchived = true;
    return p;
  }

  function columns() {
    var staff = S.auth.isStaff();
    var c = [{ k: 'no', label: 'No.', sort: false }, { k: 'id_bidang', label: 'ID bidang', sort: true }];
    if (staff) c.push({ k: 'nomor_surat', label: 'Nomor surat', sort: true });
    c.push({ k: 'jenis_surat', label: 'Jenis dokumen', sort: true });
    if (staff) c.push({ k: 'nama_pemilik', label: 'Nama pemilik', sort: true }, { k: 'alamat_objek', label: 'Lokasi', sort: true }, { k: 'luas_dokumen_m2', label: 'Luas tanah', sort: true });
    c.push({ k: 'status_inventarisasi', label: 'Status data', sort: true }, { k: 'status_pemetaan', label: 'Status pemetaan', sort: true }, { k: 'aksi', label: 'Aksi', sort: false });
    return c;
  }

  function cellFor(col, it, idx) {
    switch (col.k) {
      case 'no': return (st.page - 1) * st.pageSize + idx + 1;
      case 'id_bidang': return h('button', { class: 'linkbtn mono', type: 'button', text: it.id_bidang, onclick: function () { S.detail.open(it.id_bidang); } });
      case 'nomor_surat': return u.dash(it.nomor_surat);
      case 'jenis_surat': return it.jenis_surat;
      case 'nama_pemilik': return u.dash(it.nama_pemilik);
      case 'alamat_objek': return h('span', null, u.dash(it.alamat_objek), (it.rt || it.rw) ? h('small', { class: 'muted', text: ' (RT ' + u.dash(it.rt) + '/RW ' + u.dash(it.rw) + ')' }) : null);
      case 'luas_dokumen_m2': return h('span', { title: it.luas_peta_m2 ? 'Luas hasil pemetaan: ' + u.fmtM2(it.luas_peta_m2) : 'Belum ada luas hasil pemetaan' }, u.fmtM2(it.luas_dokumen_m2, '—'));
      case 'status_inventarisasi': return h('span', null, u.invBadge(it.status_inventarisasi), ' ', u.verBadge(it.status_verifikasi), it.status_arsip === 'ARSIP' ? [' ', u.badge('danger', 'Arsip')] : null);
      case 'status_pemetaan': return u.petaBadge(it.status_pemetaan);
      case 'aksi': {
        var box = h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', type: 'button', text: 'Detail', onclick: function () { S.detail.open(it.id_bidang); } }));
        if (S.auth.isStaff() && it.status_arsip !== 'ARSIP') {
          box.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Edit', onclick: function () {
            S.api.call('getLandDetail', { id_bidang: it.id_bidang }).then(function (d) { openForm(d.land, { onSaved: function () { S.emit('data:changed', { id: it.id_bidang }); } }); }).catch(function (e) { u.toast(e.message, 'err'); });
          } }));
        }
        if (it.status_pemetaan === 'SUDAH_DIPETAKAN' && it.status_arsip !== 'ARSIP') box.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Peta', onclick: function () { S.app.go('peta', { focus: it.id_bidang }); } }));
        return box;
      }
    }
    return '';
  }

  function renderTable(r) {
    u.clear(tableHolder);
    var cols = columns();
    if (!r.items.length) {
      tableHolder.appendChild(u.empty(lastQuery && (st.q || st.jenis_surat || st.status_inventarisasi || st.status_verifikasi || st.status_pemetaan || st.rt || st.rw)
        ? 'Tidak ada data yang cocok' : 'Data belum tersedia', lastQuery && st.q ? 'Ubah kata kunci atau reset filter.' : 'Belum ada bidang tanah yang diinventarisasi.'));
      return;
    }
    var thead = h('tr', null, cols.map(function (c) {
      var th = h('th', { scope: 'col' });
      if (c.sort) {
        var active = st.sortBy === c.k;
        th.setAttribute('aria-sort', active ? (st.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
        th.appendChild(h('button', { class: 'sortbtn', type: 'button', onclick: function () {
          if (st.sortBy === c.k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc'; else { st.sortBy = c.k; st.sortDir = 'asc'; }
          st.page = 1; load();
        } }, c.label, h('span', { class: 'sortmark', 'aria-hidden': 'true', text: active ? (st.sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕' })));
      } else th.textContent = c.label;
      return th;
    }));
    var tbody = h('tbody', null, r.items.map(function (it, i) {
      return h('tr', { class: it.status_arsip === 'ARSIP' ? 'row-archived' : '' }, cols.map(function (c) { return h('td', { 'data-label': c.label }, cellFor(c, it, i)); }));
    }));
    tableHolder.appendChild(h('table', { class: 'data-table' }, h('thead', null, thead), tbody));
  }

  function renderPager(r) {
    u.clear(pager);
    if (r.total === 0) return;
    function b(label, page, dis, aria) { return h('button', { class: 'btn btn-sm', type: 'button', text: label, disabled: dis, 'aria-label': aria, onclick: function () { st.page = page; load(); } }); }
    var sizeSel = h('select', { 'aria-label': 'Baris per halaman', onchange: function (e) { st.pageSize = parseInt(e.target.value, 10); st.page = 1; load(); } },
      [10, 25, 50, 100].map(function (n) { return h('option', { value: n, text: n + ' / halaman', selected: n === st.pageSize }); }));
    pager.appendChild(b('«', 1, r.page <= 1, 'Halaman pertama'));
    pager.appendChild(b('‹ Sebelumnya', r.page - 1, r.page <= 1, 'Halaman sebelumnya'));
    pager.appendChild(h('span', { class: 'pager-info', text: 'Halaman ' + r.page + ' dari ' + r.totalPages }));
    pager.appendChild(b('Berikutnya ›', r.page + 1, r.page >= r.totalPages, 'Halaman berikutnya'));
    pager.appendChild(b('»', r.totalPages, r.page >= r.totalPages, 'Halaman terakhir'));
    pager.appendChild(sizeSel);
  }

  function load() {
    if (!built) build();
    var my = ++seq;
    tableHolder.classList.add('loading');
    return S.api.call('searchLand', query(), { silent: true }).then(function (r) {
      if (my !== seq) return;
      tableHolder.classList.remove('loading');
      lastQuery = r;
      if (r.page > r.totalPages && r.total > 0) { st.page = r.totalPages; return load(); }
      countEl.textContent = 'Menampilkan ' + u.fmtNum(r.items.length, 0) + ' dari ' + u.fmtNum(r.total, 0) + ' bidang' + (r.total ? ' (halaman ' + r.page + '/' + r.totalPages + ')' : '');
      renderTable(r); renderPager(r);
    }).catch(function (e) {
      if (my !== seq) return;
      tableHolder.classList.remove('loading');
      u.clear(tableHolder); u.clear(pager); countEl.textContent = '';
      tableHolder.appendChild(u.errorBox(e, load));
    });
  }

  function exportCsv(btn) {
    var p = query(); delete p.page; delete p.pageSize; p.format = 'csv';
    return u.busy(btn, function () {
      return S.api.call('exportLandData', p).then(function (r) {
        u.download(r.filename, r.mimeType, r.content);
        u.toast('Ekspor selesai: ' + r.jumlah + ' baris' + (S.auth.isAdmin() ? ' (termasuk data pribadi; jaga kerahasiaannya).' : '.'), 'ok');
      }).catch(function (e) { u.toast(e.message, 'err'); });
    });
  }

  function show() { build(); return load(); }

  /* ---------- Formulir ---------- */
  var NUM_FIELDS = ['panjang_meter', 'lebar_meter', 'luas_dokumen_m2'];

  function openForm(land, o) {
    o = o || {};
    var edit = !!land;
    var staff = S.auth.isStaff(), admin = S.auth.isAdmin();
    if (!staff) { u.toast('Anda tidak memiliki izin untuk mengubah data.', 'err'); return; }
    land = land || {};
    var jenis = (S.cfg && S.cfg.jenis_surat) || ['SPT', 'SHM', 'LAINNYA'];
    var F = {};
    function add(name, spec) { spec.name = name; F[name] = u.field(spec); return F[name].el; }
    function v(n, d) { return land[n] === null || land[n] === undefined ? (d || '') : land[n]; }

    var top = h('div', { class: 'form-errors', role: 'alert' });
    var maskedNote = edit && !admin;
    var form = h('form', { class: 'form-grid', novalidate: 'novalidate' },
      h('fieldset', null, h('legend', { text: 'Identitas bidang' }),
        add('jenis_surat', { label: 'Jenis dokumen', type: 'select', required: true, value: v('jenis_surat', jenis[0]), options: jenis.map(function (j) { return { value: j, label: j }; }) }),
        add('nomor_surat', { label: 'Nomor surat', maxlength: 100, value: v('nomor_surat'), help: 'Nomor surat yang sama pada jenis dokumen yang sama akan diperingatkan sebagai duplikat.' }),
        add('nomor_persil', { label: 'Nomor persil', maxlength: 60, value: v('nomor_persil') }),
        add('nomor_peta_bidang', { label: 'Nomor peta bidang', maxlength: 60, value: v('nomor_peta_bidang') })),
      h('fieldset', null, h('legend', { text: 'Pemilik' }),
        add('nama_pemilik', { label: 'Nama pemilik', required: true, maxlength: 150, value: v('nama_pemilik') }),
        add('nik', { label: 'NIK', maxlength: 16, inputmode: 'numeric', value: maskedNote ? '' : v('nik'), placeholder: maskedNote ? 'Kosongkan jika tidak diubah' : '16 digit', help: 'Data sensitif. Tidak pernah ditampilkan kepada publik.' }),
        add('alamat_pemilik', { label: 'Alamat pemilik', maxlength: 300, value: maskedNote ? '' : v('alamat_pemilik'), placeholder: maskedNote ? 'Kosongkan jika tidak diubah' : '' })),
      h('fieldset', null, h('legend', { text: 'Lokasi' }),
        add('alamat_objek', { label: 'Alamat objek tanah', maxlength: 300, value: v('alamat_objek'), wide: true }),
        add('rt', { label: 'RT', maxlength: 3, inputmode: 'numeric', value: v('rt') }),
        add('rw', { label: 'RW', maxlength: 3, inputmode: 'numeric', value: v('rw') }),
        add('kelurahan', { label: 'Kelurahan', maxlength: 80, value: v('kelurahan', 'Pager') }),
        add('kecamatan', { label: 'Kecamatan', maxlength: 80, value: v('kecamatan', 'Rakumpit') }),
        add('kota', { label: 'Kota', maxlength: 80, value: v('kota', 'Palangka Raya') })),
      h('fieldset', null, h('legend', { text: 'Ukuran menurut dokumen' }),
        add('panjang_meter', { label: 'Panjang (m)', inputmode: 'decimal', value: v('panjang_meter'), help: 'Boleh kosong. Tidak dihitung otomatis dari luas.' }),
        add('lebar_meter', { label: 'Lebar (m)', inputmode: 'decimal', value: v('lebar_meter'), help: 'Boleh kosong.' }),
        add('luas_dokumen_m2', { label: 'Luas menurut dokumen (m²)', inputmode: 'decimal', value: v('luas_dokumen_m2'), help: 'Disimpan terpisah dari luas hasil pemetaan.' })),
      h('fieldset', null, h('legend', { text: 'Administrasi' }),
        add('tanggal_surat', { label: 'Tanggal surat', type: 'date', value: v('tanggal_surat') }),
        add('tanggal_pendataan', { label: 'Tanggal pendataan', type: 'date', value: v('tanggal_pendataan') }),
        add('penggunaan_tanah', { label: 'Penggunaan tanah', maxlength: 100, value: v('penggunaan_tanah') }),
        add('sumber_data', { label: 'Sumber data', maxlength: 200, value: v('sumber_data') }),
        add('keterangan', { label: 'Keterangan', type: 'textarea', maxlength: 1000, value: v('keterangan'), wide: true }),
        (edit && admin) ? add('status_verifikasi', { label: 'Status verifikasi', type: 'select', value: v('status_verifikasi', 'BELUM_DIVERIFIKASI'),
          options: [{ value: 'BELUM_DIVERIFIKASI', label: 'Belum diverifikasi' }, { value: 'SUDAH_DIVERIFIKASI', label: 'Sudah diverifikasi' }],
          help: 'Hanya administrator. Verifikasi bersifat administratif, bukan kepastian hukum.' }) : null));
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    function validate() {
      var errs = {}, ok = true;
      function bad(n, m) { errs[n] = m; ok = false; }
      if (!F.jenis_surat.get()) bad('jenis_surat', 'Jenis dokumen wajib dipilih.');
      if (!F.nama_pemilik.get().trim()) bad('nama_pemilik', 'Nama pemilik wajib diisi.');
      var nik = F.nik.get().replace(/[\s.-]/g, '');
      if (nik && !/^\d{16}$/.test(nik)) bad('nik', 'NIK harus 16 digit angka.');
      ['rt', 'rw'].forEach(function (n) { var x = F[n].get().trim(); if (x && !/^\d{1,3}$/.test(x)) bad(n, 'Harus angka (maksimal 3 digit).'); });
      NUM_FIELDS.forEach(function (n) {
        var x = F[n].get().trim().replace(',', '.');
        if (x && (!/^\d+(\.\d+)?$/.test(x) || Number(x) > (n === 'luas_dokumen_m2' ? 1e9 : 1e5))) bad(n, 'Harus berupa angka positif yang wajar.');
      });
      ['tanggal_surat', 'tanggal_pendataan'].forEach(function (n) {
        var x = F[n].get(); if (x && !/^\d{4}-\d{2}-\d{2}$/.test(x)) bad(n, 'Format tanggal tidak valid.');
      });
      Object.keys(F).forEach(function (n) { F[n].error(errs[n] || ''); });
      var first = Object.keys(errs)[0];
      if (first) F[first].input.focus();
      return ok;
    }

    function payload() {
      var l = {};
      Object.keys(F).forEach(function (n) {
        var val = F[n].get();
        if (n === 'jenis_surat' || n === 'status_verifikasi') { l[n] = val; return; }
        if (maskedNote && (n === 'nik' || n === 'alamat_pemilik') && !val.trim()) return;
        l[n] = typeof val === 'string' ? val.trim() : val;
      });
      if (!(edit && admin)) delete l.status_verifikasi;
      return l;
    }

    function submit(dlg, btn, ignoreDup) {
      top.textContent = '';
      if (!validate()) { u.clear(top); top.appendChild(h('div', { text: 'Periksa kembali isian yang ditandai.' })); return Promise.resolve(); }
      var params = { land: payload() };
      if (ignoreDup) params.abaikan_duplikat = true;
      if (edit) { params.id_bidang = land.id_bidang; params.expected_updated_at = land.updated_at; }
      return S.api.call(edit ? 'updateLand' : 'createLand', params).then(function (r) {
        if (edit && r.unchanged) u.toast('Tidak ada perubahan untuk disimpan.', 'info');
        else u.toast(edit ? 'Perubahan tersimpan.' : 'Bidang baru tersimpan dengan ID ' + r.land.id_bidang + '.', 'ok');
        if (r && r.verifikasi_direset) u.toast('Status verifikasi dikembalikan ke "belum diverifikasi" karena data diubah.', 'warn');
        dlg.close(true);
        if (o.onSaved) o.onSaved(r.land.id_bidang);
      }).catch(function (e) {
        u.clear(top);
        if (e.code === 'DUPLICATE') {
          return u.confirm({ title: 'Nomor surat sudah ada', message: e.message + ' Tetap simpan sebagai bidang terpisah?', okLabel: 'Tetap simpan' }).then(function (ok) {
            if (ok) return submit(dlg, btn, true);
          });
        }
        if (e.code === 'CONFLICT') {
          top.appendChild(h('div', null, h('strong', { text: 'Konflik pembaruan. ' }), e.message, ' ',
            h('button', { class: 'linkbtn', type: 'button', text: 'Muat ulang data', onclick: function () { dlg.close(); S.detail.open(land.id_bidang); } })));
          return;
        }
        if (e.code === 'SESSION_EXPIRED' || e.code === 'UNAUTHENTICATED') { top.appendChild(u.errorBox(e)); return; }
        top.appendChild(h('div', null, h('strong', { text: e.message }), e.details && e.details.length ? h('ul', null, e.details.slice(0, 8).map(function (d) { return h('li', { text: String(d) }); })) : null));
      });
    }

    var dlg = u.modal({
      title: edit ? 'Ubah data bidang ' + land.id_bidang : 'Tambah bidang tanah', size: 'lg',
      body: h('div', null, top, form,
        h('p', { class: 'muted small', text: 'Tanda * wajib diisi. Poligon di peta ditambahkan terpisah melalui mode digitasi atau impor GeoJSON; data tanpa poligon tetap dapat diinventarisasi.' })),
      buttons: [
        { label: 'Batal', onClick: function (c) { c(null); } },
        { label: edit ? 'Simpan perubahan' : 'Simpan bidang', kind: 'primary', onClick: function (c, btn) { return submit(dlg, btn, false); } }
      ]
    });
    return dlg;
  }

  inv.show = show;
  inv.openForm = openForm;
  inv.refresh = function () { if (built && document.getElementById('view-inventaris').classList.contains('active')) load(); };
  inv.invalidate = function () { built = false; };

  S.on('data:changed', function () { inv.refresh(); });
  S.on('auth:change', function () { built = false; if (document.getElementById('view-inventaris').classList.contains('active')) show(); });
})();
