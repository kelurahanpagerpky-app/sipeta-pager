/**
 * SIPETA PAGER - admin.js
 * Halaman administrasi (khusus administrator; dicek ulang oleh backend pada setiap aksi):
 * pengguna, konfigurasi, batas wilayah, impor CSV/GeoJSON dengan pratinjau, dan log aktivitas.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h, ml = S.ml;
  var A = (S.admin = {});
  var tab = 'pengguna';
  var logState = { q: '', page: 1 };
  var MAX_FILE = 1500000;

  var TABS = [['pengguna', 'Pengguna'], ['konfigurasi', 'Konfigurasi'], ['batas', 'Batas wilayah'], ['impor', 'Impor & cadangan'], ['log', 'Log aktivitas']];

  function show() {
    var root = document.getElementById('view-admin');
    u.clear(root);
    root.appendChild(h('div', { class: 'page-head' }, h('h1', { text: 'Administrasi' }), h('p', { class: 'muted', text: 'Pengelolaan pengguna, konfigurasi, batas wilayah, dan data. Hanya untuk administrator.' })));
    if (!S.auth.isAdmin()) {
      root.appendChild(u.errorBox({ code: S.auth.isAuth() ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: S.auth.isAuth() ? 'Halaman ini hanya untuk administrator.' : 'Silakan masuk sebagai administrator.' }));
      return Promise.resolve();
    }
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(function (t) {
      return h('button', { class: 'tab' + (tab === t[0] ? ' active' : ''), type: 'button', role: 'tab', 'aria-selected': tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { tab = t[0]; show(); } });
    }));
    var panel = h('div', { class: 'tabpanel', role: 'tabpanel' });
    root.appendChild(tabs); root.appendChild(panel);
    return ({ pengguna: usersTab, konfigurasi: configTab, batas: boundaryTab, impor: importTab, log: logTab })[tab](panel);
  }

  /* ---------- Pengguna ---------- */
  function usersTab(panel) {
    panel.appendChild(h('div', { class: 'muted pad', text: 'Memuat pengguna…' }));
    function load() {
      return S.api.call('listUsers', {}).then(function (r) {
        u.clear(panel);
        panel.appendChild(h('div', { class: 'toolbar-row toolbar-actions' },
          h('p', { class: 'muted grow', text: 'Hanya akun Google yang terdaftar dan berstatus AKTIF yang dapat masuk. Role ditentukan di sini, bukan oleh browser.' }),
          h('button', { class: 'btn btn-primary', type: 'button', text: '+ Tambah pengguna', onclick: function () { userForm(null, load); } })));
        panel.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['ID', 'Nama', 'Email', 'Role', 'Status', 'Terakhir masuk', 'Aksi'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
          h('tbody', null, r.items.map(function (x) {
            return h('tr', null, h('td', { class: 'mono', text: x.user_id }), h('td', { text: x.nama_pengguna }), h('td', { text: x.email }),
              h('td', { text: u.label('role', x.role) }), h('td', null, u.badge(x.status_akun === 'AKTIF' ? 'ok' : 'muted', x.status_akun === 'AKTIF' ? 'Aktif' : 'Nonaktif')),
              h('td', { text: x.last_login ? u.fmtDateTime(x.last_login) : '—' }),
              h('td', null, h('button', { class: 'btn btn-sm', type: 'button', text: 'Ubah', onclick: function () { userForm(x, load); } })));
          })))));
      }).catch(function (e) { u.clear(panel); panel.appendChild(u.errorBox(e, load)); });
    }
    return load();
  }

  function userForm(user, done) {
    var edit = !!user;
    var f = {
      email: u.field({ label: 'Email akun Google', name: 'email', type: 'email', required: true, value: edit ? user.email : '', readonly: edit, maxlength: 254, help: 'Harus sama dengan email akun Google yang dipakai untuk masuk.' }),
      nama: u.field({ label: 'Nama', name: 'nama', required: true, value: edit ? user.nama_pengguna : '', maxlength: 100 }),
      role: u.field({ label: 'Role', name: 'role', type: 'select', value: edit ? user.role : 'PETUGAS', options: [{ value: 'PETUGAS', label: 'Petugas' }, { value: 'ADMINISTRATOR', label: 'Administrator' }] }),
      status: u.field({ label: 'Status akun', name: 'status', type: 'select', value: edit ? user.status_akun : 'AKTIF', options: [{ value: 'AKTIF', label: 'Aktif' }, { value: 'NONAKTIF', label: 'Nonaktif' }] })
    };
    var msg = h('div', { class: 'form-errors', role: 'alert' });
    var dlg = u.modal({
      title: edit ? 'Ubah pengguna' : 'Tambah pengguna', size: 'sm',
      body: h('div', null, msg, h('div', { class: 'form-stack' }, f.email.el, f.nama.el, f.role.el, f.status.el)),
      buttons: [{ label: 'Batal', onClick: function (c) { c(null); } }, { label: 'Simpan', kind: 'primary', onClick: function () {
        u.clear(msg);
        var email = f.email.get().trim().toLowerCase(), nama = f.nama.get().trim();
        var bad = false;
        f.email.error(''); f.nama.error('');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { f.email.error('Email tidak valid.'); bad = true; }
        if (!nama) { f.nama.error('Nama wajib diisi.'); bad = true; }
        if (bad) return Promise.resolve();
        return S.api.call('saveUser', { email: email, nama_pengguna: nama, role: f.role.get(), status_akun: f.status.get() }).then(function () {
          u.toast('Pengguna tersimpan.', 'ok'); dlg.close(true); done();
        }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); if (e.details) e.details.forEach(function (d) { msg.appendChild(h('div', { text: String(d) })); }); });
      } }]
    });
  }

  /* ---------- Konfigurasi ---------- */
  var COLOR_KEYS = [['WARNA_LENGKAP', 'Data lengkap', 'LENGKAP'], ['WARNA_BELUM_LENGKAP', 'Data belum lengkap', 'BELUM_LENGKAP'], ['WARNA_SHM', 'SHM terverifikasi', 'SHM'],
    ['WARNA_SPT', 'SPT terverifikasi', 'SPT'], ['WARNA_LAINNYA', 'Dokumen lain terverifikasi', 'LAINNYA'], ['WARNA_BELUM_VERIFIKASI', 'Belum diverifikasi', 'BELUM_VERIFIKASI']];

  function saveKey(key, val) {
    return S.api.call('updateConfig', { kunci: key, nilai: val });
  }

  function configTab(panel) {
    return S.app.loadConfig().then(function () {
      var cfg = S.cfg || {};
      u.clear(panel);
      var pub = h('select', { 'aria-label': 'Peta publik' }, h('option', { value: 'FALSE', text: 'Nonaktif (disarankan): publik tidak melihat poligon bidang' }), h('option', { value: 'TRUE', text: 'Aktif: publik melihat poligon dan ID/jenis dokumen' }));
      pub.value = cfg.peta_publik_aktif ? 'TRUE' : 'FALSE';
      var jenis = h('input', { type: 'text', value: (cfg.jenis_surat || []).join(','), maxlength: '120', 'aria-label': 'Jenis dokumen' });
      var sess = h('input', { type: 'number', min: '1', max: '6', placeholder: 'bawaan 6', 'aria-label': 'Masa sesi (jam)', class: 'narrow' });
      var msg = h('div', { class: 'form-errors', role: 'alert' });
      var colorInputs = {};
      var colorGrid = h('div', { class: 'color-grid' }, COLOR_KEYS.map(function (c) {
        var cur = (cfg.warna && cfg.warna[c[2]]) || ml.DEFAULT_COLORS[c[2]];
        var inp = h('input', { type: 'color', value: cur, 'aria-label': 'Warna ' + c[1] });
        colorInputs[c[0]] = { input: inp, orig: cur };
        return h('label', { class: 'color-item' }, inp, h('span', { text: c[1] }));
      }));
      panel.appendChild(h('div', { class: 'form-stack wide' },
        msg,
        h('div', { class: 'cfg-block' }, h('h3', { text: 'Peta untuk publik' }), pub,
          h('p', { class: 'muted small', text: 'Poligon bidang beserta ID menunjukkan lokasi tanah. Aktifkan hanya setelah kelurahan memutuskan data tersebut boleh dipublikasikan (lihat UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi). Nama pemilik, NIK, dan alamat tidak pernah dikirim ke publik.' })),
        h('div', { class: 'cfg-block' }, h('h3', { text: 'Jenis dokumen' }), jenis, h('p', { class: 'muted small', text: 'Kode huruf besar dipisah koma. SPT dan SHM wajib ada. Contoh: SPT,SHM,LAINNYA.' })),
        h('div', { class: 'cfg-block' }, h('h3', { text: 'Warna peta' }), colorGrid),
        h('div', { class: 'cfg-block' }, h('h3', { text: 'Masa berlaku sesi (jam)' }), sess, h('p', { class: 'muted small', text: 'Kosongkan jika tidak diubah (1-6 jam).' })),
        h('div', null, h('button', { class: 'btn btn-primary', type: 'button', text: 'Simpan konfigurasi', onclick: function (e) {
          u.clear(msg);
          var jobs = [];
          if (pub.value !== (cfg.peta_publik_aktif ? 'TRUE' : 'FALSE')) jobs.push(['PETA_PUBLIK_AKTIF', pub.value]);
          if (jenis.value.trim().toUpperCase().replace(/\s/g, '') !== (cfg.jenis_surat || []).join(',')) jobs.push(['JENIS_SURAT', jenis.value]);
          Object.keys(colorInputs).forEach(function (k) { if (colorInputs[k].input.value.toLowerCase() !== colorInputs[k].orig.toLowerCase()) jobs.push([k, colorInputs[k].input.value]); });
          if (sess.value.trim()) jobs.push(['SESSION_JAM', sess.value.trim()]);
          if (!jobs.length) { u.toast('Tidak ada perubahan.', 'info'); return; }
          var go = function () {
            return jobs.reduce(function (p, j) { return p.then(function () { return saveKey(j[0], j[1]); }); }, Promise.resolve());
          };
          var needsConfirm = jobs.some(function (j) { return j[0] === 'PETA_PUBLIK_AKTIF' && j[1] === 'TRUE'; });
          var pre = needsConfirm ? u.confirm({ title: 'Aktifkan peta publik?', message: 'Poligon dan ID bidang tanah akan dapat dilihat siapa saja tanpa masuk. Pastikan ini sudah disetujui kelurahan.', okLabel: 'Aktifkan', danger: true }) : Promise.resolve(true);
          return pre.then(function (ok) {
            if (!ok) return;
            return u.busy(e.target, function () {
              return go().then(function () { u.toast('Konfigurasi tersimpan.', 'ok'); return S.app.loadConfig(true); }).then(function () { S.emit('config:changed'); show(); });
            });
          }).catch(function (err) { msg.appendChild(h('div', { text: err.message })); });
        } }))));
    }).catch(function (e) { u.clear(panel); panel.appendChild(u.errorBox(e, function () { show(); })); });
  }

  /* ---------- Batas wilayah ---------- */
  function boundaryTab(panel) {
    return S.api.call('getBoundary', {}).then(function (r) {
      u.clear(panel);
      var b = r.boundary;
      if (!b) panel.appendChild(h('div', { class: 'notice' }, h('strong', { text: 'Batas wilayah belum diimpor. ' }), 'Impor GeoJSON batas resmi Kelurahan Pager dari sumber yang sah (mis. instansi pertanahan atau pemerintah daerah). Aplikasi tidak menyertakan batas apa pun.'));
      else {
        var ok = b.status_verifikasi === 'SUDAH_DIVERIFIKASI';
        var m = ml.metrics(b.geojson);
        panel.appendChild(h('div', { class: ok ? 'notice notice-ok' : 'notice notice-warn' }, h('strong', { text: ok ? 'Batas sudah diverifikasi. ' : 'Batas belum diverifikasi. ' }), ok ? 'Tampil kepada publik.' : 'Tidak tampil kepada publik dan jangan dianggap batas resmi.'));
        panel.appendChild(h('dl', { class: 'kv-list' },
          h('div', { class: 'kv' }, h('dt', { text: 'Nama' }), h('dd', { text: u.dash(b.nama_wilayah) })), h('div', { class: 'kv' }, h('dt', { text: 'Sumber' }), h('dd', { text: u.dash(b.sumber_data) })),
          h('div', { class: 'kv' }, h('dt', { text: 'Tanggal data' }), h('dd', { text: u.fmtDate(b.tanggal_data) })), h('div', { class: 'kv' }, h('dt', { text: 'Luas area' }), h('dd', { text: m ? u.fmtNum(m.luas_ha, 2) + ' ha' : '—' })),
          h('div', { class: 'kv' }, h('dt', { text: 'Keterangan' }), h('dd', { text: u.dash(b.keterangan) }))));
        panel.appendChild(h('div', { class: 'toolbar-row toolbar-actions' },
          h('button', { class: 'btn', type: 'button', text: ok ? 'Tandai belum diverifikasi' : 'Tandai sudah diverifikasi', onclick: function () {
            u.confirm({ title: 'Ubah status verifikasi batas?', message: ok ? 'Batas tidak akan tampil kepada publik.' : 'Batas akan tampil kepada publik sebagai batas terverifikasi. Lakukan hanya jika sumbernya resmi.', okLabel: 'Ya, ubah', danger: !ok }).then(function (y) {
              if (!y) return;
              S.api.call('setBoundaryStatus', { id_batas: b.id_batas, status_verifikasi: ok ? 'BELUM_DIVERIFIKASI' : 'SUDAH_DIVERIFIKASI' }).then(function () { u.toast('Status batas diubah.', 'ok'); S.emit('data:changed', {}); show(); }).catch(function (e) { u.toast(e.message, 'err'); });
            });
          } })));
      }
      panel.appendChild(h('div', { class: 'toolbar-row' }, h('button', { class: 'btn btn-primary', type: 'button', text: b ? 'Ganti batas wilayah (impor GeoJSON)' : 'Impor batas wilayah (GeoJSON)', onclick: function () { A.openBoundaryImport(b); } })));
    }).catch(function (e) { u.clear(panel); panel.appendChild(u.errorBox(e, function () { show(); })); });
  }

  A.openBoundaryImport = function (existing) {
    if (!S.auth.isAdmin()) { u.toast('Hanya administrator yang dapat mengimpor batas wilayah.', 'err'); return; }
    var file = h('input', { type: 'file', accept: '.geojson,.json,application/geo+json,application/json', 'aria-label': 'Berkas GeoJSON batas wilayah' });
    var info = h('div', { class: 'import-preview', 'aria-live': 'polite' });
    var f = {
      nama: u.field({ label: 'Nama wilayah', name: 'nama', value: (existing && existing.nama_wilayah) || 'Kelurahan Pager', maxlength: 100 }),
      sumber: u.field({ label: 'Sumber data', name: 'sumber', required: true, maxlength: 200, placeholder: 'mis. Peta batas resmi dari … tahun …', help: 'Wajib. Catat instansi dan dokumen yang menjadi sumber batas.' }),
      tgl: u.field({ label: 'Tanggal data', name: 'tgl', type: 'date' }),
      ket: u.field({ label: 'Keterangan', name: 'ket', type: 'textarea', maxlength: 500, wide: true }),
      ver: u.field({ label: 'Status verifikasi', name: 'ver', type: 'select', value: 'BELUM_DIVERIFIKASI', options: [{ value: 'BELUM_DIVERIFIKASI', label: 'Belum diverifikasi (tidak tampil ke publik)' }, { value: 'SUDAH_DIVERIFIKASI', label: 'Sudah diverifikasi (tampil ke publik)' }], help: 'Pilih "sudah diverifikasi" hanya jika sumbernya resmi.' })
    };
    var parsed = null;
    var msg = h('div', { class: 'form-errors', role: 'alert' });
    file.addEventListener('change', function () {
      parsed = null; u.clear(info); u.clear(msg);
      var fl = file.files && file.files[0];
      if (!fl) return;
      u.readFileText(fl, MAX_FILE).then(function (t) {
        var obj = u.parseJson(t, 'Berkas');
        var feat = ml.extractSingleGeometry(obj);
        var errs = ml.validateGeometry(feat);
        if (errs.length) throw new Error('GeoJSON tidak valid: ' + errs.join(' '));
        var m = ml.metrics(feat);
        parsed = feat;
        info.appendChild(h('div', { class: 'notice notice-ok' }, 'Berkas valid: ' + m.titik + ' titik, area ' + u.fmtNum(m.luas_ha, 2) + ' ha. Pastikan area ini sesuai dengan batas yang Anda maksud.'));
        if (feat.properties && feat.properties.nama_wilayah && !f.nama.get()) f.nama.set(feat.properties.nama_wilayah);
        if (feat.properties && /demo/i.test(JSON.stringify(feat.properties))) info.appendChild(h('div', { class: 'notice notice-warn' }, 'Berkas ini tampak sebagai DATA DEMO. Jangan dijadikan batas resmi.'));
      }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); });
    });
    var dlg = u.modal({
      title: 'Impor batas wilayah', size: 'md',
      body: h('div', { class: 'form-stack' },
        h('p', { class: 'muted small', text: 'Berkas GeoJSON harus berisi satu Polygon/MultiPolygon (Feature, FeatureCollection 1 fitur, atau geometri) dalam WGS84 (EPSG:4326) dengan urutan [bujur, lintang]. Batas yang sudah ada akan diganti.' }),
        msg, h('div', { class: 'field' }, h('label', { text: 'Berkas GeoJSON' }), file), info, f.nama.el, f.sumber.el, f.tgl.el, f.ket.el, f.ver.el),
      buttons: [{ label: 'Batal', onClick: function (c) { c(null); } }, { label: 'Simpan batas wilayah', kind: 'primary', onClick: function () {
        u.clear(msg); f.sumber.error('');
        if (!parsed) { msg.appendChild(h('div', { text: 'Pilih berkas GeoJSON yang valid terlebih dahulu.' })); return Promise.resolve(); }
        if (!f.sumber.get().trim()) { f.sumber.error('Sumber data wajib diisi.'); f.sumber.input.focus(); return Promise.resolve(); }
        return u.confirm({ title: 'Simpan batas wilayah?', message: existing ? 'Batas wilayah yang ada akan diganti.' : 'Batas wilayah akan disimpan.', okLabel: 'Simpan' }).then(function (ok) {
          if (!ok) return;
          return S.api.call('importBoundary', { geojson: parsed, nama_wilayah: f.nama.get().trim(), sumber_data: f.sumber.get().trim(), tanggal_data: f.tgl.get(), keterangan: f.ket.get().trim(), status_verifikasi: f.ver.get() }).then(function (r) {
            u.toast('Batas wilayah tersimpan (' + u.label('ver', r.status_verifikasi).toLowerCase() + ').', 'ok'); dlg.close(true); S.emit('data:changed', {});
            if (document.getElementById('view-admin').classList.contains('active')) show();
          });
        }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); if (e.details) e.details.forEach(function (d) { msg.appendChild(h('div', { text: String(d) })); }); });
      } }]
    });
  };

  /* ---------- Impor GeoJSON poligon bidang ---------- */
  function batches(arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

  function reportView(r, kind) {
    var box = h('div', { class: 'import-report' });
    box.appendChild(h('div', { class: 'stat-grid stat-grid-sm' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: String(r.total) }), h('div', { class: 'stat-label', text: 'Total ' + kind })),
      h('div', { class: 'stat stat-ok' }, h('div', { class: 'stat-value', text: String(r.valid) }), h('div', { class: 'stat-label', text: 'Valid' })),
      h('div', { class: 'stat stat-warn' }, h('div', { class: 'stat-value', text: String(r.invalid) }), h('div', { class: 'stat-label', text: 'Ditolak' }))));
    if (r.kolom_diabaikan && r.kolom_diabaikan.length) box.appendChild(h('div', { class: 'notice notice-soft', text: 'Kolom yang tidak dikenal dan diabaikan: ' + r.kolom_diabaikan.join(', ') }));
    if (r.errors && r.errors.length) {
      box.appendChild(h('details', { class: 'coords', open: true }, h('summary', { text: 'Baris/fitur yang ditolak (' + r.errors.length + ')' }),
        h('ul', null, r.errors.slice(0, 50).map(function (e) { return h('li', { text: (e.baris ? 'Baris ' + e.baris : 'Fitur ' + e.index + (e.id_bidang ? ' (' + e.id_bidang + ')' : '')) + ': ' + e.message }); }))));
    }
    return box;
  }

  A.openGeoJsonImport = function () {
    if (!S.auth.isAdmin()) { u.toast('Hanya administrator yang dapat mengimpor poligon.', 'err'); return; }
    var file = h('input', { type: 'file', accept: '.geojson,.json,application/geo+json,application/json', 'aria-label': 'Berkas GeoJSON poligon bidang' });
    var sumber = u.field({ label: 'Sumber geometri', name: 'sumber', value: 'Impor GeoJSON', maxlength: 100, help: 'Mis. "Survei GPS 2025" atau "Digitasi citra".' });
    var out = h('div', { 'aria-live': 'polite' }), msg = h('div', { class: 'form-errors', role: 'alert' });
    var fc = null, previewOk = false, dlg, commitBtn;

    function run(mode) {
      var parts = batches(fc.features, 100);
      var agg = { total: 0, valid: 0, invalid: 0, errors: [], saved: 0 };
      return parts.reduce(function (p, part, bi) {
        return p.then(function () {
          return S.api.call('importGeoJSON', { featureCollection: { type: 'FeatureCollection', features: part }, mode: mode, sumber_geometri: sumber.get().trim() || 'Impor GeoJSON' }).then(function (r) {
            agg.total += r.total; agg.valid += r.valid; agg.invalid += r.invalid; agg.saved += r.saved || 0;
            r.errors.forEach(function (e) { agg.errors.push({ index: e.index + bi * 100, id_bidang: e.id_bidang, message: e.message }); });
          });
        });
      }, Promise.resolve()).then(function () { return agg; });
    }

    file.addEventListener('change', function () {
      fc = null; previewOk = false; u.clear(out); u.clear(msg); if (commitBtn) commitBtn.disabled = true;
      var fl = file.files && file.files[0];
      if (!fl) return;
      u.readFileText(fl, 5000000).then(function (t) {
        var obj = u.parseJson(t, 'Berkas');
        if (!obj || obj.type !== 'FeatureCollection' || !Array.isArray(obj.features) || !obj.features.length) throw new Error('Berkas harus berupa GeoJSON FeatureCollection yang berisi fitur. Setiap fitur wajib memiliki properties.id_bidang.');
        fc = obj;
        out.appendChild(h('div', { class: 'muted small', text: 'Memeriksa ' + obj.features.length + ' fitur…' }));
        return run('preview').then(function (r) {
          u.clear(out); out.appendChild(reportView(r, 'fitur'));
          previewOk = r.valid > 0;
          if (commitBtn) { commitBtn.disabled = !previewOk; commitBtn.textContent = previewOk ? 'Simpan ' + r.valid + ' geometri' : 'Tidak ada yang valid'; }
        });
      }).catch(function (e) { u.clear(out); msg.appendChild(h('div', { text: e.message })); });
    });

    dlg = u.modal({
      title: 'Impor poligon bidang (GeoJSON)', size: 'md',
      body: h('div', { class: 'form-stack' },
        h('p', { class: 'muted small', text: 'Setiap fitur harus Polygon/MultiPolygon (WGS84, urutan [bujur, lintang]) dengan properties.id_bidang yang sudah ada di inventarisasi. Geometri lama bidang tersebut akan diganti dan luas hasil pemetaan dihitung ulang. Fitur yang tidak valid ditolak dan tidak disimpan.' }),
        msg, h('div', { class: 'field' }, h('label', { text: 'Berkas GeoJSON' }), file), sumber.el, out),
      buttons: [{ label: 'Tutup', onClick: function (c) { c(null); } }, { label: 'Simpan geometri', kind: 'primary', onClick: function (c, btn) {
        if (!previewOk || !fc) return Promise.resolve();
        return u.confirm({ title: 'Simpan geometri?', message: 'Geometri yang valid akan disimpan dan menggantikan geometri lama pada bidang terkait.', okLabel: 'Simpan' }).then(function (ok) {
          if (!ok) return;
          return run('commit').then(function (r) {
            u.clear(out); out.appendChild(reportView(r, 'fitur'));
            u.toast(r.saved + ' geometri tersimpan.', r.saved ? 'ok' : 'warn');
            previewOk = false; btn.disabled = true; S.emit('data:changed', {});
          });
        }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); });
      } }]
    });
    commitBtn = u.$('.modal-foot .btn-primary', dlg.el);
    commitBtn.disabled = true;
  };

  /* ---------- Impor CSV ---------- */
  var CSV_TEMPLATE = 'nomor_surat,jenis_surat,nama_pemilik,nik,alamat_pemilik,alamat_objek,rt,rw,panjang_meter,lebar_meter,luas_dokumen_m2,tanggal_surat,penggunaan_tanah,keterangan,sumber_data\r\n' +
    'CONTOH-001/2025,SPT,Nama Pemilik Contoh,,,"Jalan Contoh, RT 01",1,1,,,450,2025-01-15,Pekarangan,Baris contoh - hapus sebelum impor,Templat\r\n';

  A.openCsvImport = function () {
    if (!S.auth.isAdmin()) { u.toast('Hanya administrator yang dapat mengimpor CSV.', 'err'); return; }
    var file = h('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Berkas CSV' });
    var dup = h('input', { type: 'checkbox' });
    var out = h('div', { 'aria-live': 'polite' }), msg = h('div', { class: 'form-errors', role: 'alert' });
    var text = null, ok = false, dlg, commitBtn;
    function run(mode) { return S.api.call('importCSV', { csv: text, mode: mode, abaikan_duplikat: dup.checked }); }
    function preview() {
      if (!text) return;
      u.clear(out); u.clear(msg);
      run('preview').then(function (r) {
        out.appendChild(reportView(r, 'baris'));
        ok = r.valid > 0; commitBtn.disabled = !ok; commitBtn.textContent = ok ? 'Simpan ' + r.valid + ' baris' : 'Tidak ada yang valid';
      }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); commitBtn.disabled = true; });
    }
    file.addEventListener('change', function () {
      text = null; ok = false; commitBtn.disabled = true; u.clear(out); u.clear(msg);
      var fl = file.files && file.files[0]; if (!fl) return;
      u.readFileText(fl, MAX_FILE).then(function (t) { text = t; preview(); }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); });
    });
    dup.addEventListener('change', preview);
    dlg = u.modal({
      title: 'Impor data inventarisasi (CSV)', size: 'md',
      body: h('div', { class: 'form-stack' },
        h('p', { class: 'muted small', text: 'Header wajib memuat jenis_surat dan nama_pemilik. Maksimal 500 baris per impor. ID bidang dibuat otomatis oleh server. Baris tidak valid ditolak dan tidak disimpan. Impor tidak menimpa data yang sudah ada.' }),
        h('button', { class: 'btn btn-sm', type: 'button', text: 'Unduh templat CSV', onclick: function () { u.download('templat-impor-sipeta.csv', 'text/csv', CSV_TEMPLATE); } }),
        msg, h('div', { class: 'field' }, h('label', { text: 'Berkas CSV (UTF-8)' }), file),
        h('label', { class: 'check' }, dup, ' Izinkan nomor surat yang sudah ada (abaikan peringatan duplikat)'), out),
      buttons: [{ label: 'Tutup', onClick: function (c) { c(null); } }, { label: 'Simpan', kind: 'primary', onClick: function (c, btn) {
        if (!ok) return Promise.resolve();
        return u.confirm({ title: 'Simpan data impor?', message: 'Baris yang valid akan ditambahkan sebagai bidang tanah baru.', okLabel: 'Simpan' }).then(function (y) {
          if (!y) return;
          return run('commit').then(function (r) {
            u.clear(out); out.appendChild(reportView(r, 'baris'));
            u.toast(r.saved + ' bidang ditambahkan.', r.saved ? 'ok' : 'warn'); ok = false; btn.disabled = true; S.emit('data:changed', {});
          });
        }).catch(function (e) { msg.appendChild(h('div', { text: e.message })); });
      } }]
    });
    commitBtn = u.$('.modal-foot .btn-primary', dlg.el); commitBtn.disabled = true;
  };

  function importTab(panel) {
    u.clear(panel);
    var mode = (window.SIPETA_CONFIG || {}).MODE;
    panel.appendChild(h('div', { class: 'card-grid' },
      h('div', { class: 'card' }, h('h3', { text: 'Impor inventarisasi (CSV)' }), h('p', { class: 'muted', text: 'Tambahkan banyak bidang sekaligus dari spreadsheet. Ada pratinjau sebelum disimpan.' }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Impor CSV', onclick: A.openCsvImport })),
      h('div', { class: 'card' }, h('h3', { text: 'Impor poligon bidang (GeoJSON)' }), h('p', { class: 'muted', text: 'Hubungkan poligon ke ID bidang yang sudah ada. Luas hasil pemetaan dihitung otomatis.' }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Impor GeoJSON', onclick: A.openGeoJsonImport })),
      h('div', { class: 'card' }, h('h3', { text: 'Ekspor data lengkap' }), h('p', { class: 'muted', text: 'Unduh seluruh data (termasuk NIK dan alamat pemilik) sebagai CSV. Simpan di tempat aman; jangan dibagikan.' }),
        h('button', { class: 'btn', type: 'button', text: 'Ekspor CSV lengkap', onclick: function (e) {
          u.busy(e.currentTarget, function () { return S.api.call('exportLandData', { format: 'csv', includeArchived: true }).then(function (r) { u.download(r.filename, r.mimeType, r.content); u.toast('Ekspor selesai: ' + r.jumlah + ' baris.', 'ok'); }); }).catch(function (er) { u.toast(er.message, 'err'); });
        } }),
        h('button', { class: 'btn', type: 'button', text: 'Ekspor GeoJSON', onclick: function (e) {
          u.busy(e.currentTarget, function () { return S.api.call('exportLandData', { format: 'geojson' }).then(function (r) { u.download(r.filename, r.mimeType, r.content); u.toast('Ekspor selesai: ' + r.jumlah + ' poligon.', 'ok'); }); }).catch(function (er) { u.toast(er.message, 'err'); });
        } }))));
    panel.appendChild(h('div', { class: 'notice notice-soft' }, h('strong', { text: 'Pencadangan. ' }),
      mode === 'demo' ? 'Mode demo: data hanya di memori browser ini dan hilang saat halaman dimuat ulang.'
        : 'Data tersimpan di Google Sheets. Buat salinan spreadsheet secara berkala (File > Buat salinan) dan simpan ekspor CSV di tempat terpisah. Lihat docs/DEPLOYMENT.md bagian pemeliharaan.'));
    return Promise.resolve();
  }

  /* ---------- Log ---------- */
  function logTab(panel) {
    var q = h('input', { type: 'search', placeholder: 'Cari aksi, ID, keterangan…', 'aria-label': 'Cari log', value: logState.q, maxlength: '100' });
    var holder = h('div');
    q.addEventListener('input', u.debounce(function () { logState.q = q.value.trim(); logState.page = 1; load(); }, 350));
    u.clear(panel);
    panel.appendChild(h('div', { class: 'toolbar-row' }, q, h('button', { class: 'btn', type: 'button', text: 'Muat ulang', onclick: function () { load(); } })));
    panel.appendChild(holder);
    function load() {
      return S.api.call('getActivityLog', { q: logState.q, page: logState.page, pageSize: 25 }).then(function (r) {
        u.clear(holder);
        if (!r.items.length) { holder.appendChild(u.empty('Belum ada aktivitas', 'Log akan terisi saat ada perubahan data.')); return; }
        holder.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, ['Waktu', 'Pengguna', 'Aksi', 'Entitas', 'Referensi', 'Keterangan', 'Status'].map(function (x) { return h('th', { scope: 'col', text: x }); }))),
          h('tbody', null, r.items.map(function (i) {
            return h('tr', null, h('td', { text: u.fmtDateTime(i.timestamp) }), h('td', { text: i.pengguna }), h('td', { text: i.aksi }), h('td', { text: i.entitas }), h('td', { class: 'mono', text: u.dash(i.id_referensi) }),
              h('td', { text: u.dash(i.keterangan) }), h('td', null, u.badge(i.status === 'SUKSES' ? 'ok' : 'warn', i.status)));
          })))));
        holder.appendChild(h('div', { class: 'pager' },
          h('button', { class: 'btn btn-sm', type: 'button', text: '‹ Sebelumnya', disabled: r.page <= 1, onclick: function () { logState.page--; load(); } }),
          h('span', { class: 'pager-info', text: 'Halaman ' + r.page + ' dari ' + r.totalPages + ' (' + r.total + ' catatan)' }),
          h('button', { class: 'btn btn-sm', type: 'button', text: 'Berikutnya ›', disabled: r.page >= r.totalPages, onclick: function () { logState.page++; load(); } })));
      }).catch(function (e) { u.clear(holder); holder.appendChild(u.errorBox(e, load)); });
    }
    return load();
  }

  A.show = show;
  S.on('auth:change', function () { if (document.getElementById('view-admin').classList.contains('active')) show(); });
})();
