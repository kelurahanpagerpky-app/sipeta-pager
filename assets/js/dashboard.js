/**
 * SIPETA PAGER - dashboard.js
 * Statistik dihitung oleh backend (getDashboardStats); tidak ada angka statis di frontend.
 * Grafik memakai Chart.js; bila pustaka gagal dimuat, grafik diganti diagram batang HTML.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h;
  var charts = [];
  var seq = 0;

  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* abaikan */ } }); charts = []; }

  function card(label, value, kind, hint) {
    return h('div', { class: 'stat stat-' + (kind || 'plain') },
      h('div', { class: 'stat-value', text: u.fmtNum(value, 0) }), h('div', { class: 'stat-label', text: label }), hint ? h('div', { class: 'stat-hint', text: hint }) : null);
  }

  /** Diagram batang HTML sederhana (cadangan dan akses pembaca layar). */
  function barList(items, color) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return h('ul', { class: 'barlist' }, items.map(function (i) {
      return h('li', null, h('span', { class: 'barlist-label', text: i.label }),
        h('span', { class: 'barlist-track' }, h('span', { class: 'barlist-fill', style: 'width:' + Math.round(i.value / max * 100) + '%;background:' + (i.color || color || '#1e6b45') })),
        h('span', { class: 'barlist-val', text: u.fmtNum(i.value, 0) }));
    }));
  }

  function chartBox(title, items, type, colors, emptyText) {
    var box = h('figure', { class: 'chartbox' }, h('figcaption', { text: title }));
    var total = items.reduce(function (a, i) { return a + i.value; }, 0);
    if (!items.length || total === 0) { box.appendChild(u.empty('Belum ada data', emptyText || 'Grafik muncul setelah data diinventarisasi.')); return box; }
    if (window.Chart) {
      var canvas = h('canvas', { role: 'img', 'aria-label': title + ': ' + items.map(function (i) { return i.label + ' ' + i.value; }).join(', ') });
      box.appendChild(h('div', { class: 'chart-canvas' }, canvas));
      try {
        var cfg = type === 'doughnut' ? {
          type: 'doughnut',
          data: { labels: items.map(function (i) { return i.label; }), datasets: [{ data: items.map(function (i) { return i.value; }), backgroundColor: items.map(function (i, k) { return colors[k] || '#1e6b45'; }), borderWidth: 2, borderColor: '#fff' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        } : {
          type: 'bar',
          data: { labels: items.map(function (i) { return i.label; }), datasets: [{ label: 'Jumlah bidang', data: items.map(function (i) { return i.value; }), backgroundColor: items.map(function (i, k) { return colors[k] || '#1e6b45'; }), borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        };
        charts.push(new window.Chart(canvas, cfg));
        box.appendChild(h('details', { class: 'chart-data' }, h('summary', { text: 'Lihat data dalam daftar' }), barList(items)));
        return box;
      } catch (e) { u.clear(box); box.appendChild(h('figcaption', { text: title })); }
    }
    box.appendChild(barList(items));
    return box;
  }

  function render(root, d) {
    var col = S.ml.colors(S.cfg && S.cfg.warna);
    destroyCharts();
    u.clear(root);
    root.appendChild(h('div', { class: 'page-head' },
      h('h1', { text: 'Dashboard' }),
      h('p', { class: 'muted', text: 'Ringkasan inventarisasi tanah Kelurahan Pager, Kecamatan Rakumpit, Kota Palangka Raya.' })));
    if (d.total === 0) {
      root.appendChild(h('div', { class: 'notice' }, h('strong', { text: 'Data belum tersedia. ' }), 'Belum ada bidang tanah yang diinventarisasi. Semua angka di bawah bernilai nol sampai data ditambahkan oleh petugas.'));
    }
    root.appendChild(h('div', { class: 'stat-grid' },
      card('Total bidang tanah', d.total, 'main'),
      card('Data SPT', d.spt, 'spt'), card('Data SHM', d.shm, 'shm'),
      card('Sudah dipetakan', d.dipetakan, 'ok'), card('Belum memiliki poligon', d.belum_dipetakan, 'muted'),
      card('Data belum lengkap', d.belum_lengkap, 'warn'), card('Perlu diverifikasi', d.perlu_verifikasi, 'info')));

    var jenisColors = d.per_jenis.map(function (j) { return j.jenis === 'SHM' ? col.SHM : j.jenis === 'SPT' ? col.SPT : col.LAINNYA; });
    var invItems = d.per_status_inventarisasi.map(function (s) { return { label: u.label('inv', s.status), value: s.jumlah }; });
    var rtItems = d.per_rtrw.map(function (r) { return { label: (r.rt || r.rw) ? 'RT ' + u.dash(r.rt) + '/RW ' + u.dash(r.rw) : 'Tanpa RT/RW', value: r.jumlah }; });
    var grid = h('div', { class: 'chart-grid' },
      chartBox('Bidang berdasarkan jenis surat', d.per_jenis.map(function (j) { return { label: j.jenis, value: j.jumlah }; }), 'bar', jenisColors),
      chartBox('Bidang berdasarkan status inventarisasi', invItems, 'doughnut', [col.LENGKAP, col.BELUM_LENGKAP]),
      chartBox('Distribusi berdasarkan RT/RW', rtItems, 'bar', [], 'Distribusi muncul setelah RT/RW diisi pada data bidang.'));
    root.appendChild(grid);
    root.appendChild(h('p', { class: 'muted small', text: 'Diperbarui: ' + u.fmtDateTime(d.generated_at) + '. Status verifikasi bersifat administratif dan bukan kepastian hukum hak atas tanah.' }));
  }

  function show() {
    var root = document.getElementById('view-dashboard');
    var my = ++seq;
    if (!root.firstChild) root.appendChild(h('div', { class: 'muted pad', text: 'Memuat statistik…' }));
    return S.api.call('getDashboardStats', {}, { silent: true }).then(function (d) {
      if (my !== seq) return;
      render(root, d);
    }).catch(function (e) {
      if (my !== seq) return;
      destroyCharts(); u.clear(root);
      root.appendChild(h('div', { class: 'page-head' }, h('h1', { text: 'Dashboard' })));
      root.appendChild(u.errorBox(e, show));
    });
  }

  S.dashboard = { show: show };
  S.on('data:changed', function () { if (document.getElementById('view-dashboard').classList.contains('active')) show(); });
})();
