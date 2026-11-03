/**
 * SIPETA PAGER - reports.js
 * Laporan rekapitulasi dari data aktual (getReport), ekspor CSV, dan cetak lewat browser.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var seq = 0, last = null;

  function table(head, rows, foot) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data-table report-table' },
      h('thead', null, h('tr', null, head.map(function (c) { return h('th', { scope: 'col', class: c.num ? 'num' : '', text: c.label }); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c, i) { return h('td', { class: head[i].num ? 'num' : '', 'data-label': head[i].label, text: c }); })); })),
      foot ? h('tfoot', null, h('tr', null, foot.map(function (c, i) { return h('td', { class: head[i].num ? 'num' : '', text: c }); }))) : null));
  }

  function rtLabel(r) { return (r.rt || r.rw) ? 'RT ' + u.dash(r.rt) + ' / RW ' + u.dash(r.rw) : 'Tanpa RT/RW'; }
  var N0 = function (n) { return u.fmtNum(n, 0); };

  function csvOf(r) {
    var rows = [['LAPORAN INVENTARISASI TANAH - SIPETA PAGER'], ['Kelurahan Pager, Kecamatan Rakumpit, Kota Palangka Raya'], ['Dibuat', r.generated_at], [],
      ['REKAPITULASI UMUM'], ['Total bidang', r.total], ['Total luas menurut dokumen (m2)', r.luas_dokumen_m2], ['Total luas hasil pemetaan (m2)', r.luas_peta_m2], [],
      ['PER JENIS DOKUMEN'], ['Jenis', 'Jumlah', 'Luas dokumen (m2)', 'Luas hasil pemetaan (m2)', 'Sudah dipetakan', 'Data lengkap']];
    r.per_jenis.forEach(function (x) { rows.push([x.jenis, x.jumlah, x.luas_dokumen_m2, x.luas_peta_m2, x.dipetakan, x.lengkap]); });
    rows.push([], ['PER RT/RW'], ['RT', 'RW', 'Jumlah', 'Luas dokumen (m2)', 'Luas hasil pemetaan (m2)', 'Sudah dipetakan', 'Data lengkap']);
    r.per_rtrw.forEach(function (x) { rows.push([x.rt, x.rw, x.jumlah, x.luas_dokumen_m2, x.luas_peta_m2, x.dipetakan, x.lengkap]); });
    rows.push([], ['STATUS KELENGKAPAN DATA'], ['Lengkap', r.kelengkapan.lengkap], ['Belum lengkap', r.kelengkapan.belum_lengkap],
      [], ['STATUS PEMETAAN'], ['Sudah dipetakan', r.pemetaan.sudah], ['Belum dipetakan', r.pemetaan.belum],
      [], ['STATUS VERIFIKASI ADMINISTRATIF'], ['Sudah diverifikasi', r.verifikasi.sudah], ['Belum diverifikasi', r.verifikasi.belum], [], [r.catatan]);
    return u.toCsv(rows);
  }

  function render(root, r) {
    last = r;
    u.clear(root);
    var user = S.auth.user();
    root.appendChild(h('div', { class: 'page-head no-print-gap' },
      h('h1', { text: 'Laporan Inventarisasi' }),
      h('p', { class: 'muted', text: 'Rekapitulasi dihitung dari data aktual di database.' }),
      h('div', { class: 'toolbar-row toolbar-actions no-print' },
        h('button', { class: 'btn', type: 'button', text: 'Ekspor CSV', onclick: function () { u.download('laporan-sipeta-pager-' + r.generated_at.substring(0, 10) + '.csv', 'text/csv', csvOf(r)); u.toast('Laporan diekspor.', 'ok'); } }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Cetak laporan', onclick: function () { window.print(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Muat ulang', onclick: show }))));
    root.appendChild(h('div', { class: 'print-only print-head' },
      h('strong', { text: 'SIPETA PAGER - Laporan Inventarisasi Tanah' }), h('div', { text: 'Kelurahan Pager, Kecamatan Rakumpit, Kota Palangka Raya' }),
      h('div', { text: 'Dicetak: ' + u.fmtDateTime(new Date().toISOString()) + (user ? ' oleh ' + user.nama : '') })));
    if (r.total === 0) root.appendChild(h('div', { class: 'notice' }, h('strong', { text: 'Data belum tersedia. ' }), 'Belum ada bidang tanah yang diinventarisasi.'));

    var spt = r.per_jenis.filter(function (x) { return x.jenis === 'SPT'; })[0], shm = r.per_jenis.filter(function (x) { return x.jenis === 'SHM'; })[0];
    root.appendChild(h('section', { class: 'report-sec' }, h('h2', { text: '1. Rekapitulasi umum' }),
      h('div', { class: 'stat-grid stat-grid-sm' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: N0(r.total) }), h('div', { class: 'stat-label', text: 'Total bidang' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: N0(spt ? spt.jumlah : 0) }), h('div', { class: 'stat-label', text: 'Rekap SPT' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: N0(shm ? shm.jumlah : 0) }), h('div', { class: 'stat-label', text: 'Rekap SHM' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: u.fmtNum(r.luas_dokumen_m2, 2) }), h('div', { class: 'stat-label', text: 'Luas menurut dokumen (m²)' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: u.fmtNum(r.luas_peta_m2, 2) }), h('div', { class: 'stat-label', text: 'Luas hasil pemetaan (m²)' })))));

    var jenisHead = [{ label: 'Jenis dokumen' }, { label: 'Jumlah', num: 1 }, { label: 'Luas dokumen (m²)', num: 1 }, { label: 'Luas hasil pemetaan (m²)', num: 1 }, { label: 'Sudah dipetakan', num: 1 }, { label: 'Data lengkap', num: 1 }];
    root.appendChild(h('section', { class: 'report-sec' }, h('h2', { text: '2. Rekapitulasi per jenis dokumen' }),
      r.per_jenis.length ? table(jenisHead, r.per_jenis.map(function (x) { return [x.jenis, N0(x.jumlah), u.fmtNum(x.luas_dokumen_m2, 2), u.fmtNum(x.luas_peta_m2, 2), N0(x.dipetakan), N0(x.lengkap)]; }),
        ['Total', N0(r.total), u.fmtNum(r.luas_dokumen_m2, 2), u.fmtNum(r.luas_peta_m2, 2), N0(r.pemetaan.sudah), N0(r.kelengkapan.lengkap)]) : u.empty('Belum ada data')));

    var rtHead = [{ label: 'RT/RW' }, { label: 'Jumlah', num: 1 }, { label: 'Luas dokumen (m²)', num: 1 }, { label: 'Luas hasil pemetaan (m²)', num: 1 }, { label: 'Sudah dipetakan', num: 1 }, { label: 'Data lengkap', num: 1 }];
    root.appendChild(h('section', { class: 'report-sec' }, h('h2', { text: '3. Rekapitulasi per RT/RW' }),
      r.per_rtrw.length ? table(rtHead, r.per_rtrw.map(function (x) { return [rtLabel(x), N0(x.jumlah), u.fmtNum(x.luas_dokumen_m2, 2), u.fmtNum(x.luas_peta_m2, 2), N0(x.dipetakan), N0(x.lengkap)]; })) : u.empty('Belum ada data')));

    var sHead = [{ label: 'Status' }, { label: 'Jumlah', num: 1 }];
    root.appendChild(h('section', { class: 'report-sec three-col' },
      h('div', null, h('h2', { text: '4. Kelengkapan data' }), table(sHead, [['Lengkap', N0(r.kelengkapan.lengkap)], ['Belum lengkap', N0(r.kelengkapan.belum_lengkap)]])),
      h('div', null, h('h2', { text: '5. Status pemetaan' }), table(sHead, [['Sudah dipetakan', N0(r.pemetaan.sudah)], ['Belum dipetakan', N0(r.pemetaan.belum)]])),
      h('div', null, h('h2', { text: '6. Verifikasi administratif' }), table(sHead, [['Sudah diverifikasi', N0(r.verifikasi.sudah)], ['Belum diverifikasi', N0(r.verifikasi.belum)]]))));
    root.appendChild(h('p', { class: 'disclaimer', text: r.catatan + ' Status verifikasi bersifat administratif dan bukan kepastian hukum hak atas tanah.' }));
    root.appendChild(h('p', { class: 'muted small', text: 'Dibuat: ' + u.fmtDateTime(r.generated_at) }));
  }

  function show() {
    var root = document.getElementById('view-laporan');
    var my = ++seq;
    if (!S.auth.isStaff()) {
      u.clear(root);
      root.appendChild(h('div', { class: 'page-head' }, h('h1', { text: 'Laporan Inventarisasi' })));
      root.appendChild(u.errorBox({ code: 'UNAUTHENTICATED', message: 'Laporan hanya tersedia bagi petugas. Silakan masuk. Ringkasan jumlah data dapat dilihat pada Dashboard.' }));
      return Promise.resolve();
    }
    if (!root.firstChild) root.appendChild(h('div', { class: 'muted pad', text: 'Menyusun laporan…' }));
    return S.api.call('getReport', {}, { silent: true }).then(function (r) { if (my === seq) render(root, r); }).catch(function (e) {
      if (my !== seq) return;
      u.clear(root); root.appendChild(h('div', { class: 'page-head' }, h('h1', { text: 'Laporan Inventarisasi' }))); root.appendChild(u.errorBox(e, show));
    });
  }

  S.reports = { show: show, _csv: csvOf };
  S.on('data:changed', function () { if (document.getElementById('view-laporan').classList.contains('active')) show(); });
  S.on('auth:change', function () { if (document.getElementById('view-laporan').classList.contains('active')) show(); });
})();
