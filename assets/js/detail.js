/**
 * SIPETA PAGER - detail.js
 * Panel detail bidang tanah (drawer di kanan pada desktop, lembar bawah pada ponsel).
 * Data diambil dari API getLandDetail sehingga selalu mengikuti hak akses pengguna.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var panel = null, body = null, titleEl = null, actionsEl = null;
  var currentId = null, seq = 0;

  function ensure() {
    if (panel) return;
    panel = document.getElementById('detailPanel');
    titleEl = h('h2', { id: 'detailTitle', text: '' });
    body = h('div', { class: 'detail-body' });
    actionsEl = h('div', { class: 'detail-actions' });
    u.clear(panel);
    panel.appendChild(h('header', { class: 'detail-head' }, titleEl,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup panel detail', text: '×', onclick: close })));
    panel.appendChild(body);
    panel.appendChild(actionsEl);
    panel.setAttribute('aria-labelledby', 'detailTitle');
  }

  function row(label, value) {
    var v = value;
    if (v === null || v === undefined || v === '') v = '—';
    return h('div', { class: 'kv' }, h('dt', { text: label }), h('dd', null, v));
  }
  function section(letter, title, rows) {
    return h('section', { class: 'detail-sec' }, h('h3', null, h('span', { class: 'sec-letter', text: letter }), title), h('dl', null, rows));
  }

  function build(d) {
    var l = d.land, staff = S.auth.isStaff(), admin = S.auth.isAdmin();
    var frag = h('div');
    var badges = h('div', { class: 'badge-row' }, u.invBadge(l.status_inventarisasi), u.verBadge(l.status_verifikasi), u.petaBadge(l.status_pemetaan));
    if (l.status_arsip === 'ARSIP') badges.appendChild(u.badge('danger', 'Diarsipkan'));
    frag.appendChild(badges);

    if (!staff) {
      frag.appendChild(section('A', 'Identitas Bidang', [row('ID bidang', l.id_bidang), row('Jenis dokumen', l.jenis_surat)]));
      frag.appendChild(h('div', { class: 'notice' }, 'Informasi pemilik, lokasi, dan ukuran hanya tersedia bagi petugas yang berwenang. ',
        h('button', { class: 'linkbtn', type: 'button', text: 'Masuk', onclick: function () { S.auth.openLogin(); } })));
      return frag;
    }

    frag.appendChild(section('A', 'Identitas Bidang', [
      row('ID bidang', l.id_bidang), row('Nomor surat', l.nomor_surat), row('Jenis dokumen', l.jenis_surat), row('Nomor persil', l.nomor_persil),
      row('Nomor peta bidang', l.nomor_peta_bidang)
    ]));
    frag.appendChild(section('B', 'Informasi Pemilik', [
      row('Nama pemilik', l.nama_pemilik),
      row('NIK', l.nik ? l.nik : null),
      row('Alamat pemilik', admin ? l.alamat_pemilik : 'Hanya ditampilkan untuk administrator')
    ]));
    frag.appendChild(section('C', 'Informasi Lokasi', [
      row('Kelurahan', l.kelurahan), row('Kecamatan', l.kecamatan), row('Kota', l.kota),
      row('RT/RW', (l.rt || l.rw) ? (u.dash(l.rt) + ' / ' + u.dash(l.rw)) : null), row('Alamat objek', l.alamat_objek)
    ]));

    var m = d.metrics, phys = [
      row('Panjang', u.fmtMeter(l.panjang_meter)), row('Lebar', u.fmtMeter(l.lebar_meter)),
      row('Luas dokumen', u.fmtM2(l.luas_dokumen_m2)),
      row('Luas hasil pemetaan', m ? u.fmtM2(l.luas_peta_m2) + ' (' + u.fmtHa(l.luas_peta_m2) + ')' : u.NA),
      row('Keliling hasil pemetaan', m ? u.fmtMeter(m.keliling_m) : u.NA)
    ];
    frag.appendChild(section('D', 'Informasi Fisik', phys));
    var pb = d.perbandingan_luas;
    if (pb) {
      frag.appendChild(h('div', { class: 'compare' },
        h('strong', { text: 'Perbandingan luas' }),
        h('div', { class: 'compare-grid' },
          h('span', { text: 'Dokumen' }), h('b', { text: u.fmtM2(pb.luas_dokumen_m2) }),
          h('span', { text: 'Hasil pemetaan' }), h('b', { text: u.fmtM2(pb.luas_peta_m2) }),
          h('span', { text: 'Selisih' }), h('b', { text: (pb.selisih_m2 > 0 ? '+' : '') + u.fmtNum(pb.selisih_m2, 2) + ' m² (' + (pb.selisih_persen > 0 ? '+' : '') + u.fmtNum(pb.selisih_persen, 2) + '%)' })),
        h('small', { class: 'muted', text: pb.catatan })));
    }
    if (d.geometry && d.geometry.geojson) {
      var polys = S.ml.polygonsOf(d.geometry.geojson);
      var ring = polys.length ? polys[0][0] : [];
      var coords = h('details', { class: 'coords' }, h('summary', { text: 'Koordinat titik batas (' + Math.max(ring.length - 1, 0) + ' titik, urutan bujur, lintang)' }),
        h('ol', null, ring.slice(0, Math.max(ring.length - 1, 0)).map(function (p) { return h('li', { text: p[0].toFixed(7) + ', ' + p[1].toFixed(7) }); })));
      frag.appendChild(coords);
      if (m && m.sisi && m.sisi.length) {
        frag.appendChild(h('details', { class: 'coords' }, h('summary', { text: 'Panjang sisi (' + m.sisi.length + ' sisi)' }),
          h('ol', null, m.sisi.map(function (s) { return h('li', { text: 'Titik ' + s.dari + ' ke ' + s.ke + ': ' + u.fmtNum(s.panjang_m, 2) + ' m' }); }))));
      }
    }
    frag.appendChild(section('E', 'Informasi Administrasi', [
      row('Tanggal surat', u.fmtDate(l.tanggal_surat)), row('Tanggal pendataan', u.fmtDate(l.tanggal_pendataan)),
      row('Penggunaan tanah', l.penggunaan_tanah),
      row('Status inventarisasi', u.invBadge(l.status_inventarisasi)), row('Status verifikasi', u.verBadge(l.status_verifikasi)),
      row('Keterangan', l.keterangan), row('Sumber data', l.sumber_data), row('Petugas pendata', l.petugas_pendata),
      row('Dibuat', u.fmtDateTime(l.created_at)), row('Terakhir diubah', u.fmtDateTime(l.updated_at))
    ]));
    var g = d.geometry;
    frag.appendChild(section('F', 'Informasi Pemetaan', g ? [
      row('Sumber geometri', g.sumber_geometri), row('Tanggal pemetaan', u.fmtDate(g.tanggal_pemetaan)),
      row('Petugas pemetaan', g.petugas_pemetaan), row('Status verifikasi geometri', u.verBadge(g.status_verifikasi_geometri)),
      row('Keterangan geometri', g.keterangan_geometri)
    ] : [h('div', { class: 'kv wide' }, h('dd', { text: 'Bidang ini belum memiliki poligon. Data tetap dapat diinventarisasi; gunakan mode digitasi atau impor GeoJSON untuk menambahkan poligon.' }))]));
    frag.appendChild(h('p', { class: 'disclaimer', text: 'Luas hasil pemetaan dihitung dari poligon di peta dan bukan hasil pengukuran kadastral resmi. Informasi ini bersifat administratif dan bukan bukti hak atas tanah.' }));

    var hist = h('div', { class: 'history' });
    var hbtn = h('button', { class: 'btn btn-sm', type: 'button', text: 'Lihat riwayat perubahan', onclick: function (ev) { loadHistory(l.id_bidang, hist, ev.currentTarget); } });
    frag.appendChild(h('section', { class: 'detail-sec', id: 'detailHistory' }, h('h3', { text: 'Riwayat' }), hbtn, hist));
    return frag;
  }

  function loadHistory(id, holder, btn) {
    u.clear(holder);
    return u.busy(btn, function () {
      return S.api.call('getLandHistory', { id_bidang: id }).then(function (r) {
        if (!r.items.length) { holder.appendChild(u.empty('Belum ada riwayat', 'Perubahan akan tercatat di sini.')); return; }
        holder.appendChild(h('ul', { class: 'timeline' }, r.items.map(function (i) {
          return h('li', null, h('b', { text: i.aksi.replace(/_/g, ' ') }), h('span', { class: 'muted', text: ' · ' + u.fmtDateTime(i.timestamp) + ' · ' + i.pengguna }),
            i.keterangan ? h('div', { text: i.keterangan }) : null);
        })));
      }).catch(function (e) { holder.appendChild(u.errorBox(e)); });
    });
  }

  function actions(d) {
    u.clear(actionsEl);
    var l = d.land;
    if (!S.auth.isStaff()) return;
    var archived = l.status_arsip === 'ARSIP';
    if (!archived) {
      actionsEl.appendChild(h('button', { class: 'btn btn-primary', type: 'button', text: 'Edit data', onclick: function () {
        S.inventory.openForm(l, { onSaved: function () { open(l.id_bidang); } });
      } }));
      if (d.geometry) actionsEl.appendChild(h('button', { class: 'btn', type: 'button', text: 'Lihat di peta', onclick: function () { S.app.go('peta', { focus: l.id_bidang }); } }));
      actionsEl.appendChild(h('button', { class: 'btn', type: 'button', text: d.geometry ? 'Ubah poligon' : 'Gambar poligon', onclick: function () { S.app.go('peta', { digitize: l.id_bidang }); } }));
    }
    if (S.auth.isAdmin()) {
      actionsEl.appendChild(h('button', { class: 'btn ' + (archived ? '' : 'btn-danger-outline'), type: 'button', text: archived ? 'Pulihkan' : 'Arsipkan', onclick: function () { toggleArchive(l, archived); } }));
    }
  }

  function toggleArchive(l, archived) {
    u.confirm({
      title: archived ? 'Pulihkan bidang?' : 'Arsipkan bidang?',
      message: archived ? 'Bidang ' + l.id_bidang + ' akan aktif kembali dan tampil di peta, pencarian, dan statistik.'
        : 'Bidang ' + l.id_bidang + ' akan disembunyikan dari peta, pencarian, dan statistik. Data tidak dihapus dan dapat dipulihkan oleh administrator.',
      okLabel: archived ? 'Pulihkan' : 'Arsipkan', danger: !archived
    }).then(function (ok) {
      if (!ok) return;
      return S.api.call(archived ? 'restoreLand' : 'archiveLand', { id_bidang: l.id_bidang }).then(function () {
        u.toast(archived ? 'Bidang dipulihkan.' : 'Bidang diarsipkan.', 'ok');
        S.emit('data:changed', { id: l.id_bidang });
      }).catch(function (e) { u.toast(e.message, 'err'); });
    });
  }

  function open(id, opts) {
    ensure();
    currentId = id;
    var my = ++seq;
    panel.classList.add('open');
    document.body.classList.add('detail-open');
    titleEl.textContent = 'Bidang tanah ' + id;
    u.clear(body); u.clear(actionsEl);
    body.appendChild(h('div', { class: 'muted pad', text: 'Memuat detail…' }));
    return S.api.call('getLandDetail', { id_bidang: id }).then(function (d) {
      if (my !== seq) return;
      u.clear(body);
      body.appendChild(build(d));
      actions(d);
      if (opts && opts.history) {
        var s = document.getElementById('detailHistory');
        if (s) { s.scrollIntoView({ block: 'nearest' }); var b = s.querySelector('button'); if (b) b.click(); }
      }
      body.scrollTop = 0;
    }).catch(function (e) {
      if (my !== seq) return;
      u.clear(body);
      body.appendChild(u.errorBox(e, function () { open(id, opts); }));
    });
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    document.body.classList.remove('detail-open');
    currentId = null; seq++;
    S.emit('detail:closed');
  }

  S.detail = { open: open, close: close, current: function () { return currentId; } };

  S.on('data:changed', function () { if (currentId) open(currentId); });
  S.on('auth:change', function () { if (currentId) open(currentId); });
})();
