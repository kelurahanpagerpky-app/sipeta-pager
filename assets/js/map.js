/**
 * SIPETA PAGER - map.js
 * Peta interaktif (Leaflet): batas wilayah, poligon bidang berwarna, popup/tooltip, pencarian,
 * filter, legenda, dan digitasi (Leaflet Draw). Logika murni ada di maplogic.js.
 * Data peta publik hanya memuat properti minimum; detail diambil dari API sesuai hak akses.
 * Semua teks dipasang sebagai node DOM (bukan string HTML) untuk mencegah XSS.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var u = S.u, h = u.h, ml = S.ml;
  var cfg = window.SIPETA_CONFIG || {};
  var M = (S.map = {});

  var map = null, parcelGroup = null, drawGroup = null, boundaryLayer = null, popup = null;
  var all = [], filters = { jenis: '', inv: '', ver: '', pet: '', rt: '', rw: '' };
  var colorMode = 'kategori', activeId = null;
  var boundaryInfo = null, mapMeta = {};
  var loaded = false, stale = true, loadSeq = 0, searchSeq = 0;
  var detailCache = {};
  var dig = null;
  var els = {};
  var uiBuilt = false, legendCtl = null;
  var pendingFocus = null, pendingDigitize = null;

  /* ====================== Antarmuka ====================== */
  function sel(label, list, onChange, key) {
    var s = h('select', { 'aria-label': label });
    s.appendChild(h('option', { value: '', text: label }));
    list.forEach(function (o) { s.appendChild(h('option', { value: o.value, text: o.label })); });
    s.addEventListener('change', function () { onChange(s.value); });
    if (key) els[key] = s;
    return s;
  }

  function panelSection(title, node, open) {
    return h('details', { class: 'side-sec', open: open !== false }, h('summary', { text: title }), h('div', { class: 'side-sec-body' }, node));
  }

  function buildUI() {
    var root = document.getElementById('view-peta');
    u.clear(root);
    var staff = S.auth.isStaff(), admin = S.auth.isAdmin();
    var jenis = (S.cfg && S.cfg.jenis_surat) || ['SPT', 'SHM', 'LAINNYA'];

    els.q = h('input', { type: 'search', maxlength: '100', 'aria-label': 'Cari bidang tanah', placeholder: staff ? 'ID, nomor surat, nama pemilik, alamat, RT/RW…' : 'ID bidang atau jenis dokumen…' });
    els.q.addEventListener('input', u.debounce(doSearch, 350));
    els.results = h('div', { class: 'search-results', 'aria-live': 'polite' });
    var searchBox = h('div', null, els.q, els.results);

    var fBox = h('div', { class: 'filter-grid' },
      sel('Semua jenis dokumen', jenis.map(function (j) { return { value: j, label: j }; }), function (v) { filters.jenis = v; onFilter(); }, 'fJenis'),
      sel('Semua status data', [{ value: 'LENGKAP', label: 'Data lengkap' }, { value: 'BELUM_LENGKAP', label: 'Data belum lengkap' }], function (v) { filters.inv = v; onFilter(); }, 'fInv'),
      sel('Semua status verifikasi', [{ value: 'SUDAH_DIVERIFIKASI', label: 'Sudah diverifikasi' }, { value: 'BELUM_DIVERIFIKASI', label: 'Belum diverifikasi' }], function (v) { filters.ver = v; onFilter(); }, 'fVer'),
      sel('Semua status pemetaan', [{ value: 'SUDAH_DIPETAKAN', label: 'Sudah dipetakan' }, { value: 'BELUM_DIPETAKAN', label: 'Belum dipetakan' }], function (v) { filters.pet = v; onFilter(); }, 'fPet'));
    if (staff) {
      ['rt', 'rw'].forEach(function (k) {
        var i = h('input', { type: 'text', inputmode: 'numeric', maxlength: '3', placeholder: k.toUpperCase(), 'aria-label': 'Filter ' + k.toUpperCase() });
        i.addEventListener('input', u.debounce(function () { filters[k] = i.value.replace(/\D/g, ''); onFilter(); }, 350));
        els['f' + k] = i;
        fBox.appendChild(i);
      });
    }
    els.count = h('div', { class: 'filter-count', 'aria-live': 'polite' });
    var filterBox = h('div', null, fBox, els.count, h('button', { class: 'btn btn-sm', type: 'button', text: 'Reset filter', onclick: function () { resetFilters(true); } }));

    var modeSel = h('select', { 'aria-label': 'Pewarnaan poligon' },
      h('option', { value: 'kategori', text: 'Warna: jenis dokumen & verifikasi' }), h('option', { value: 'inventarisasi', text: 'Warna: kelengkapan data' }));
    modeSel.addEventListener('change', function () { colorMode = modeSel.value; restyleAll(); updateLegend(); });
    function toggle(label, key, layerFn) {
      return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: function (e) { layerFn(e.target.checked); } }), ' ' + label);
    }
    var viewBox = h('div', { class: 'layer-toggles' },
      toggle('Batas wilayah', 'boundary', function (on) { if (boundaryLayer && map) { if (on) boundaryLayer.addTo(map); else map.removeLayer(boundaryLayer); } }),
      toggle('Poligon bidang tanah', 'parcels', function (on) { if (parcelGroup && map) { if (on) parcelGroup.addTo(map); else map.removeLayer(parcelGroup); } }),
      toggle('Peta dasar OpenStreetMap', 'base', function (on) { if (M._base && map) { if (on) M._base.addTo(map); else map.removeLayer(M._base); } }), modeSel);

    els.boundaryNote = h('div', { class: 'boundary-note' });
    var tools = h('div', { class: 'tool-list' });
    if (staff) {
      tools.appendChild(h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Mode digitasi poligon', onclick: pickLand }));
      tools.appendChild(h('button', { class: 'btn btn-block', type: 'button', text: 'Ekspor GeoJSON (sesuai filter)', onclick: function (e) { exportGeo(e.currentTarget); } }));
    }
    if (admin) {
      tools.appendChild(h('button', { class: 'btn btn-block', type: 'button', text: 'Impor GeoJSON poligon bidang', onclick: function () { S.admin.openGeoJsonImport(); } }));
      tools.appendChild(h('button', { class: 'btn btn-block', type: 'button', text: 'Impor batas wilayah (GeoJSON)', onclick: function () { S.admin.openBoundaryImport(); } }));
    }

    els.side = h('aside', { class: 'map-side', id: 'mapSide', 'aria-label': 'Panel pencarian dan filter peta' },
      panelSection('Pencarian bidang', searchBox, true),
      panelSection('Filter', filterBox, !u.isNarrow()),
      panelSection('Tampilan & layer', viewBox, false),
      panelSection('Batas wilayah', els.boundaryNote, true),
      tools.children.length ? panelSection(staff ? 'Alat petugas' : 'Alat', tools, true) : null);

    els.mapEl = h('div', { id: 'map', role: 'region', 'aria-label': 'Peta bidang tanah' });
    els.overlay = h('div', { class: 'map-overlay', hidden: true });
    els.digPanel = h('div', { class: 'dig-panel', hidden: true, role: 'region', 'aria-label': 'Panel digitasi' });
    els.toggle = h('button', { class: 'map-side-toggle btn', type: 'button', 'aria-controls': 'mapSide', 'aria-expanded': 'false', text: '☰ Cari & filter',
      onclick: function () { var o = els.side.classList.toggle('open'); els.toggle.setAttribute('aria-expanded', o ? 'true' : 'false'); } });
    root.appendChild(h('div', { class: 'map-layout' }, els.side, h('div', { class: 'map-main' }, els.mapEl, els.overlay, els.digPanel, els.toggle)));
    uiBuilt = true;
    map = null; parcelGroup = null; drawGroup = null; boundaryLayer = null; legendCtl = null;
    updateBoundaryNote();
    updateCount();
  }

  function showOverlay(node) { u.clear(els.overlay); els.overlay.appendChild(node); els.overlay.hidden = false; }
  function hideOverlay() { els.overlay.hidden = true; u.clear(els.overlay); }

  /* ====================== Peta ====================== */
  function initMap() {
    if (!window.L) throw new Error('Pustaka peta (Leaflet) tidak termuat. Periksa koneksi internet, lalu muat ulang halaman.');
    map = L.map(els.mapEl, { zoomControl: false }).setView(cfg.MAP_DEFAULT_CENTER || [-2.21, 113.92], cfg.MAP_DEFAULT_ZOOM || 12);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Perbesar', zoomOutTitle: 'Perkecil' }).addTo(map);
    M._base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    var Home = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var b = L.DomUtil.create('button', 'map-home btn');
        b.type = 'button'; b.title = 'Kembali ke tampilan seluruh wilayah'; b.setAttribute('aria-label', 'Kembali ke wilayah Kelurahan Pager');
        b.textContent = '⌂ Wilayah';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', function () { home(); });
        return b;
      }
    });
    new Home().addTo(map);

    legendCtl = L.control({ position: 'bottomleft' });
    legendCtl.onAdd = function () {
      var d = L.DomUtil.create('div', 'map-legend');
      L.DomEvent.disableClickPropagation(d);
      M._legendEl = d;
      return d;
    };
    legendCtl.addTo(map);
    updateLegend();

    parcelGroup = L.featureGroup().addTo(map);
    drawGroup = L.featureGroup().addTo(map);
    popup = L.popup({ maxWidth: 300, minWidth: 220, className: 'sipeta-popup', autoPanPadding: [24, 24] });

    if (L.drawLocal && L.drawLocal.draw && L.drawLocal.draw.handlers && L.drawLocal.draw.handlers.polygon) {
      var p = L.drawLocal.draw.handlers.polygon;
      p.tooltip.start = 'Klik untuk memulai menggambar bidang.';
      p.tooltip.cont = 'Klik untuk menambah titik.';
      p.tooltip.end = 'Klik titik pertama atau tombol "Selesai" untuk menutup bidang.';
      p.error = '<strong>Galat:</strong> garis tidak boleh berpotongan.';
    }
    if (L.Draw && L.Draw.Event) {
      map.on(L.Draw.Event.CREATED, onDrawCreated);
      map.on(L.Draw.Event.DRAWSTOP, onDrawStop);
    }
    map.on('popupclose', function () { if (activeId && !dig) { var prev = activeId; activeId = null; restyleOne(prev); } });
  }

  function updateLegend() {
    if (!M._legendEl) return;
    var el = M._legendEl;
    u.clear(el);
    var items = ml.legend(colorMode, S.cfg && S.cfg.warna);
    var collapsed = el.getAttribute('data-collapsed') === '1' || (el.getAttribute('data-collapsed') === null && u.isNarrow());
    el.setAttribute('data-collapsed', collapsed ? '1' : '0');
    el.appendChild(h('button', { class: 'legend-title', type: 'button', 'aria-expanded': collapsed ? 'false' : 'true', onclick: function () {
      el.setAttribute('data-collapsed', collapsed ? '0' : '1'); updateLegend();
    } }, 'Legenda ' + (collapsed ? '▸' : '▾')));
    if (collapsed) return;
    items.forEach(function (i) { el.appendChild(h('div', { class: 'legend-item' }, h('span', { class: 'legend-swatch', style: 'background:' + i.color }), i.label)); });
    el.appendChild(h('div', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-line' }), 'Batas wilayah'));
    el.appendChild(h('div', { class: 'legend-note', text: 'Warna menunjukkan status administrasi data, bukan kepastian hukum hak atas tanah.' }));
  }

  function styleFor(props, id) {
    var c = ml.colorFor(props, colorMode, S.cfg && S.cfg.warna);
    var active = id === activeId;
    return { color: active ? '#111111' : c, weight: active ? 4 : 2, opacity: 1, fillColor: c, fillOpacity: active ? 0.62 : 0.45 };
  }
  function find(id) { for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function restyleOne(id) { var a = find(id); if (a) a.layer.setStyle(styleFor(a.props, a.id)); }
  function restyleAll() { all.forEach(function (a) { a.layer.setStyle(styleFor(a.props, a.id)); }); }
  function setActive(id) { var prev = activeId; activeId = id; if (prev) restyleOne(prev); if (id) restyleOne(id); }

  function renderParcels(fc) {
    if (!parcelGroup) return;
    parcelGroup.clearLayers();
    all = [];
    (fc.features || []).forEach(function (f) {
      var props = f.properties || {};
      var id = props.id_bidang;
      if (!id) return;
      var layer;
      try { layer = L.geoJSON(f).getLayers()[0]; } catch (e) { return; }
      if (!layer) return;
      layer.setStyle(styleFor(props, id));
      layer.bindTooltip(h('span', { text: id + ' · ' + (props.jenis_surat || '') }), { sticky: true, direction: 'top', opacity: 0.95 });
      layer.on('mouseover', function () { if (id !== activeId) layer.setStyle({ weight: 3, fillOpacity: 0.7 }); if (layer.bringToFront) layer.bringToFront(); });
      layer.on('mouseout', function () { layer.setStyle(styleFor(props, id)); });
      layer.on('click', function (ev) { if (dig) return; L.DomEvent.stopPropagation(ev); openFeature(id, { zoom: false, latlng: ev.latlng }); });
      all.push({ id: id, props: props, layer: layer });
    });
    applyFilters();
  }

  function applyFilters() {
    if (!parcelGroup) return;
    parcelGroup.clearLayers();
    var vis = 0;
    all.forEach(function (a) {
      if (dig && dig.id === a.id) return;
      if (ml.passes(a.props, filters)) { parcelGroup.addLayer(a.layer); vis++; }
    });
    M._visible = vis;
    updateCount();
  }

  function updateCount() {
    if (!els.count) return;
    var n = ml.activeFilterCount(filters);
    var t = 'Menampilkan ' + u.fmtNum(M._visible || 0, 0) + ' dari ' + u.fmtNum(all.length, 0) + ' bidang berpoligon' + (n ? ' (' + n + ' filter aktif)' : '') + '.';
    if (filters.pet === 'BELUM_DIPETAKAN') t += ' Bidang yang belum dipetakan tidak memiliki poligon; lihat daftar hasil pencarian.';
    els.count.textContent = t;
  }

  function onFilter() { applyFilters(); doSearch(); }

  function resetFilters(refreshSearch) {
    filters = { jenis: '', inv: '', ver: '', pet: '', rt: '', rw: '' };
    ['fJenis', 'fInv', 'fVer', 'fPet', 'frt', 'frw'].forEach(function (k) { if (els[k]) els[k].value = ''; });
    applyFilters();
    if (refreshSearch) doSearch();
  }

  function fitBoundsSafe(b, opts) { try { if (b && b.isValid && b.isValid()) { map.fitBounds(b, opts || { padding: [30, 30], maxZoom: 18 }); return true; } } catch (e) { /* abaikan */ } return false; }

  function home() {
    if (!map) return;
    if (boundaryLayer && fitBoundsSafe(boundaryLayer.getBounds())) return;
    if (all.length && parcelGroup && parcelGroup.getLayers().length && fitBoundsSafe(parcelGroup.getBounds(), { padding: [40, 40], maxZoom: 18 })) return;
    map.setView(cfg.MAP_DEFAULT_CENTER || [-2.21, 113.92], cfg.MAP_DEFAULT_ZOOM || 12);
  }

  /* ====================== Batas wilayah ====================== */
  function renderBoundary(res) {
    boundaryInfo = res;
    if (boundaryLayer && map) map.removeLayer(boundaryLayer);
    boundaryLayer = null;
    var b = res && res.boundary;
    if (b && b.geojson) {
      try {
        boundaryLayer = L.geoJSON({ type: 'Feature', properties: {}, geometry: b.geojson }, {
          style: function () { return { color: b.status_verifikasi === 'SUDAH_DIVERIFIKASI' ? '#0b5d3b' : '#8a5a00', weight: 3, dashArray: '9 6', fill: true, fillColor: '#1e6b45', fillOpacity: 0.04, interactive: true }; }
        });
        var label = (b.nama_wilayah || 'Batas wilayah') + (b.status_verifikasi === 'SUDAH_DIVERIFIKASI' ? '' : ' (belum diverifikasi, bukan batas resmi)');
        boundaryLayer.bindTooltip(h('span', { text: label }), { sticky: true });
        boundaryLayer.addTo(map);
        if (boundaryLayer.bringToBack) boundaryLayer.bringToBack();
      } catch (e) { boundaryLayer = null; }
    }
    updateBoundaryNote();
  }

  function updateBoundaryNote() {
    if (!els.boundaryNote) return;
    var n = els.boundaryNote; u.clear(n);
    var b = boundaryInfo && boundaryInfo.boundary;
    if (!boundaryInfo) { n.appendChild(h('span', { class: 'muted', text: 'Memuat batas wilayah…' })); return; }
    if (!b) {
      n.appendChild(h('div', { class: 'notice' }, h('strong', { text: 'Batas wilayah belum tersedia. ' }), boundaryInfo.message || 'Batas wilayah harus diimpor dan diverifikasi terlebih dahulu.'));
      if (S.auth.isAdmin()) n.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Impor batas wilayah', onclick: function () { S.admin.openBoundaryImport(); } }));
      return;
    }
    var ok = b.status_verifikasi === 'SUDAH_DIVERIFIKASI';
    n.appendChild(h('div', { class: ok ? 'notice notice-ok' : 'notice notice-warn' }, h('strong', { text: ok ? 'Batas terverifikasi. ' : 'Batas BELUM diverifikasi. ' }),
      ok ? '' : 'Jangan dianggap sebagai batas resmi.'));
    n.appendChild(h('div', { class: 'small muted' }, 'Nama: ' + u.dash(b.nama_wilayah), h('br'), 'Sumber: ' + u.dash(b.sumber_data), h('br'), 'Tanggal data: ' + u.fmtDate(b.tanggal_data)));
    if (S.auth.isAdmin()) n.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Kelola batas wilayah', onclick: function () { S.admin.openBoundaryImport(b); } }));
  }

  /* ====================== Popup & fokus ====================== */
  function getDetail(id) {
    var c = detailCache[id];
    if (c && Date.now() - c.t < 30000) return Promise.resolve(c.d);
    return S.api.call('getLandDetail', { id_bidang: id }, { silent: true }).then(function (d) { detailCache[id] = { t: Date.now(), d: d }; return d; });
  }

  function buildPopup(props) {
    var id = props.id_bidang;
    var dl = h('dl', { class: 'pop-dl' });
    function r(label, v) { dl.appendChild(h('dt', { text: label })); dl.appendChild(h('dd', null, v === null || v === undefined || v === '' ? '—' : v)); }
    var extra = h('div', { class: 'pop-extra' });
    r('Jenis Dokumen', props.jenis_surat);
    r('Status Inventarisasi', u.label('inv', props.status_inventarisasi));
    r('Status Verifikasi', u.label('ver', props.status_verifikasi));
    r('Status Pemetaan', u.label('peta', props.status_pemetaan));
    var btns = h('div', { class: 'pop-actions' },
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Lihat Detail', onclick: function () { S.detail.open(id); } }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Zoom ke Bidang', onclick: function () { zoomTo(id); } }),
      S.auth.isStaff() ? h('button', { class: 'btn btn-sm', type: 'button', text: 'Lihat Riwayat', onclick: function () { S.detail.open(id, { history: true }); } }) : null,
      h('button', { class: 'btn btn-sm', type: 'button', text: 'Tutup', onclick: function () { map.closePopup(); } }));
    var box = h('div', { class: 'pop' }, h('div', { class: 'pop-title' }, 'BIDANG TANAH ', h('b', { text: id })), dl, extra, btns);

    if (S.auth.isStaff()) {
      extra.appendChild(h('div', { class: 'muted small', text: 'Memuat detail…' }));
      getDetail(id).then(function (d) {
        var l = d.land, dl2 = h('dl', { class: 'pop-dl' });
        function r2(label, v) { dl2.appendChild(h('dt', { text: label })); dl2.appendChild(h('dd', null, v === null || v === undefined || v === '' ? '—' : v)); }
        r2('Nomor Surat', l.nomor_surat); r2('Nama Pemilik', l.nama_pemilik); r2('Lokasi', l.alamat_objek);
        r2('RT/RW', (l.rt || l.rw) ? u.dash(l.rt) + '/' + u.dash(l.rw) : null);
        r2('Luas Dokumen', u.fmtM2(l.luas_dokumen_m2)); r2('Luas Hasil Pemetaan', u.fmtM2(l.luas_peta_m2));
        r2('Panjang', u.fmtMeter(l.panjang_meter)); r2('Lebar', u.fmtMeter(l.lebar_meter));
        r2('Tanggal Pendataan', u.fmtDate(l.tanggal_pendataan));
        r2('Keterangan', l.keterangan && l.keterangan.length > 120 ? l.keterangan.slice(0, 120) + '…' : l.keterangan);
        u.clear(extra); extra.appendChild(dl2);
        if (popup && popup.isOpen && popup.isOpen()) popup.update();
      }, function (e) {
        u.clear(extra); extra.appendChild(h('div', { class: 'small err', text: 'Detail tidak dapat dimuat: ' + e.message }));
      });
    }
    return box;
  }

  function openFeature(id, o) {
    o = o || {};
    var a = find(id);
    if (!a) { u.toast('Bidang ' + id + ' belum memiliki poligon di peta.', 'warn'); return false; }
    if (ml.activeFilterCount(filters) && !ml.passes(a.props, filters)) { resetFilters(false); u.toast('Filter peta direset agar bidang tampil.', 'info'); }
    setActive(id);
    if (o.zoom !== false) fitBoundsSafe(a.layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
    var ll = o.latlng || a.layer.getBounds().getCenter();
    popup.setLatLng(ll).setContent(buildPopup(a.props)).openOn(map);
    return true;
  }

  function zoomTo(id) { var a = find(id); if (a) fitBoundsSafe(a.layer.getBounds(), { padding: [60, 60], maxZoom: 19 }); }

  /* ====================== Pencarian ====================== */
  function doSearch() {
    if (!els.results) return;
    var q = els.q.value.trim();
    var fc = ml.activeFilterCount(filters);
    var my = ++searchSeq;
    u.clear(els.results);
    if (!q && !fc) { els.results.appendChild(h('div', { class: 'muted small', text: 'Ketik kata kunci atau pilih filter untuk menampilkan daftar bidang.' })); return; }
    els.results.appendChild(h('div', { class: 'muted small', text: 'Mencari…' }));
    var params = Object.assign({ q: q, pageSize: 20 }, ml.apiFilters(filters));
    S.api.call('searchLand', params, { silent: true }).then(function (r) {
      if (my !== searchSeq) return;
      u.clear(els.results);
      els.results.appendChild(h('div', { class: 'small', text: u.fmtNum(r.total, 0) + ' bidang ditemukan' + (r.total > r.items.length ? ' (menampilkan ' + r.items.length + ' teratas)' : '') }));
      if (!r.items.length) { els.results.appendChild(u.empty('Tidak ada hasil', 'Coba kata kunci lain atau reset filter.')); return; }
      els.results.appendChild(h('ul', { class: 'result-list' }, r.items.map(function (it) {
        var mapped = it.status_pemetaan === 'SUDAH_DIPETAKAN';
        return h('li', null, h('button', { class: 'result-item', type: 'button', onclick: function () { onResult(it); } },
          h('span', { class: 'mono', text: it.id_bidang }), h('span', { class: 'result-line', text: ml.resultLine(it, S.auth.isStaff()) }),
          mapped ? null : u.badge('muted', 'Belum ada poligon')));
      })));
    }).catch(function (e) {
      if (my !== searchSeq) return;
      u.clear(els.results);
      els.results.appendChild(u.errorBox(e, doSearch));
    });
  }

  function onResult(it) {
    if (u.isNarrow()) { els.side.classList.remove('open'); els.toggle.setAttribute('aria-expanded', 'false'); }
    if (it.status_pemetaan === 'SUDAH_DIPETAKAN' && find(it.id_bidang)) { openFeature(it.id_bidang); return; }
    u.toast('Bidang ' + it.id_bidang + ' belum memiliki poligon. Detail data tetap dapat dilihat.', 'warn');
    S.detail.open(it.id_bidang);
  }

  /* ====================== Muat data ====================== */
  function loadAll() {
    var my = ++loadSeq;
    hideOverlay();
    return Promise.all([S.api.call('getBoundary', {}), S.api.call('getPublicMapData', {})]).then(function (res) {
      if (my !== loadSeq) return;
      detailCache = {};
      mapMeta = res[1] || {};
      renderBoundary(res[0]);
      renderParcels(res[1]);
      loaded = true; stale = false;
      if (res[1].restricted) {
        showOverlay(h('div', { class: 'notice' }, h('strong', { text: 'Peta bidang tanah dinonaktifkan untuk umum. ' }), res[1].message || '',
          ' ', h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Masuk', onclick: function () { S.auth.openLogin(); } })));
      } else if (res[1].truncated) {
        u.toast('Peta hanya menampilkan sebagian bidang (batas ' + (res[1].features || []).length + '). Gunakan filter untuk mempersempit.', 'warn');
      } else if (!(res[1].features || []).length) {
        showOverlay(h('div', { class: 'notice notice-soft' }, h('strong', { text: 'Belum ada poligon bidang tanah. ' }), 'Data tanpa poligon tetap dapat diinventarisasi. Poligon ditambahkan melalui mode digitasi atau impor GeoJSON.', ' ',
          h('button', { class: 'btn btn-sm', type: 'button', text: '×', 'aria-label': 'Tutup pesan', onclick: hideOverlay })));
      }
      home();
    }).catch(function (e) {
      if (my !== loadSeq) return;
      showOverlay(u.errorBox(e, function () { loadAll(); }));
    });
  }

  /* ====================== Ekspor ====================== */
  function exportGeo(btn) {
    var p = ml.apiFilters(filters); p.format = 'geojson'; p.q = els.q.value.trim();
    return u.busy(btn, function () {
      return S.api.call('exportLandData', p).then(function (r) {
        u.download(r.filename, r.mimeType, r.content);
        u.toast('Ekspor GeoJSON selesai: ' + r.jumlah + ' poligon.', 'ok');
      }).catch(function (e) { u.toast(e.message, 'err'); });
    });
  }

  /* ====================== Digitasi ====================== */
  function pickLand() {
    if (!S.auth.isStaff()) { u.toast('Digitasi hanya untuk petugas.', 'err'); return; }
    if (!window.L || !L.Draw) { u.toast('Pustaka digitasi (Leaflet Draw) tidak termuat. Muat ulang halaman.', 'err'); return; }
    var list = h('div', { class: 'pick-list' });
    var q = h('input', { type: 'search', placeholder: 'Cari bidang (ID, nomor surat, nama)…', 'aria-label': 'Cari bidang untuk didigitasi', maxlength: '100' });
    var only = h('input', { type: 'checkbox', checked: true });
    var dlg;
    var run = function () {
      u.clear(list); list.appendChild(h('div', { class: 'muted small', text: 'Memuat…' }));
      var p = { q: q.value.trim(), pageSize: 30 }; if (only.checked) p.status_pemetaan = 'BELUM_DIPETAKAN';
      S.api.call('searchLand', p, { silent: true }).then(function (r) {
        u.clear(list);
        if (!r.items.length) { list.appendChild(u.empty('Tidak ada bidang', only.checked ? 'Semua bidang sudah memiliki poligon, atau hilangkan centang untuk menampilkan semuanya.' : 'Tidak ada hasil.')); return; }
        r.items.forEach(function (it) {
          list.appendChild(h('button', { class: 'result-item', type: 'button', onclick: function () { dlg.close(); startDigitize(it.id_bidang); } },
            h('span', { class: 'mono', text: it.id_bidang }), h('span', { class: 'result-line', text: ml.resultLine(it, true) }),
            it.status_pemetaan === 'SUDAH_DIPETAKAN' ? u.badge('ok', 'Ubah poligon') : u.badge('muted', 'Belum ada poligon')));
        });
      }).catch(function (e) { u.clear(list); list.appendChild(u.errorBox(e, run)); });
    };
    q.addEventListener('input', u.debounce(run, 350));
    only.addEventListener('change', run);
    dlg = u.modal({ title: 'Pilih bidang yang akan didigitasi', size: 'md',
      body: h('div', null, h('p', { class: 'muted small', text: 'Poligon hanya dapat dihubungkan ke bidang yang sudah ada di inventarisasi. Tambahkan datanya dahulu di halaman Inventarisasi jika belum ada.' }),
        q, h('label', { class: 'check' }, only, ' Hanya yang belum memiliki poligon'), list),
      buttons: [{ label: 'Batal', onClick: function (c) { c(null); } }] });
    run();
  }

  function startDigitize(id) {
    if (!S.auth.isStaff()) { u.toast('Digitasi hanya untuk petugas.', 'err'); return Promise.resolve(); }
    if (!window.L || !L.Draw) { u.toast('Pustaka digitasi (Leaflet Draw) tidak termuat. Muat ulang halaman.', 'err'); return Promise.resolve(); }
    return stopDigitize(false).then(function () {
      return S.api.call('getLandDetail', { id_bidang: id });
    }).then(function (d) {
      S.detail.close(); map.closePopup();
      dig = { id: id, land: d.land, existing: d.geometry && d.geometry.geojson, layer: null, handler: null, dirty: false, mode: 'idle', errors: [] };
      applyFilters();
      drawGroup.clearLayers();
      var g = dig.existing;
      if (g && g.type === 'Polygon') { makeEditable(g.coordinates, false); fitBoundsSafe(dig.layer.getBounds(), { padding: [80, 80], maxZoom: 19 }); }
      else if (g && g.type === 'MultiPolygon') { dig.mode = 'multi'; var tmp = L.geoJSON({ type: 'Feature', properties: {}, geometry: g }, { style: { color: '#d81b60', weight: 3, fillOpacity: 0.15 }, interactive: false }); drawGroup.addLayer(tmp); fitBoundsSafe(tmp.getBounds(), { padding: [80, 80], maxZoom: 19 }); }
      else startDrawing();
      renderDigPanel();
    }).catch(function (e) { dig = null; u.toast(e.message, 'err'); });
  }

  function makeEditable(coords, dirty) {
    var poly = L.polygon(coords.map(ml.toLatLngs), { color: '#d81b60', weight: 3, fillColor: '#d81b60', fillOpacity: 0.2 });
    drawGroup.addLayer(poly);
    if (poly.editing) { poly.editing.enable(); }
    poly.on('edit editdrag', function () { if (dig) { dig.dirty = true; renderMetrics(); } });
    dig.layer = poly; dig.mode = 'edit'; dig.dirty = !!dirty;
  }

  function startDrawing() {
    if (!dig) return;
    if (dig.handler) { try { dig.handler.disable(); } catch (e) { /* abaikan */ } }
    dig.handler = new L.Draw.Polygon(map, { allowIntersection: false, showArea: false, drawError: { color: '#d32f2f', timeout: 2500 }, shapeOptions: { color: '#d81b60', weight: 3, fillColor: '#d81b60', fillOpacity: 0.2 } });
    dig.handler.enable();
    dig.mode = 'drawing';
  }

  function onDrawCreated(e) {
    if (!dig) return;
    if (dig.layer) { drawGroup.removeLayer(dig.layer); dig.layer = null; }
    var poly = e.layer;
    drawGroup.addLayer(poly);
    if (poly.editing) poly.editing.enable();
    poly.on('edit editdrag', function () { if (dig) { dig.dirty = true; renderMetrics(); } });
    dig.layer = poly; dig.handler = null; dig.mode = 'edit'; dig.dirty = true;
    renderDigPanel();
  }

  function onDrawStop() {
    if (!dig) return;
    if (dig.mode === 'drawing' && !dig.layer) { dig.handler = null; dig.mode = 'idle'; renderDigPanel(); }
  }

  function currentGeometry() { return dig && dig.layer ? dig.layer.toGeoJSON().geometry : null; }

  function renderMetrics() {
    if (!dig || !els.digMetrics) return;
    var g = currentGeometry(), box = els.digMetrics;
    u.clear(box);
    if (!g) return;
    var errs = ml.validateGeometry(g);
    dig.errors = errs;
    var m = ml.metrics(g);
    if (errs.length) box.appendChild(h('div', { class: 'form-errors', role: 'alert' }, errs.map(function (x) { return h('div', { text: x }); })));
    if (m) {
      box.appendChild(h('dl', { class: 'pop-dl' },
        h('dt', { text: 'Luas hasil pemetaan' }), h('dd', { text: u.fmtNum(m.luas_m2, 2) + ' m² (' + u.fmtNum(m.luas_ha, 4) + ' ha)' }),
        h('dt', { text: 'Keliling' }), h('dd', { text: u.fmtNum(m.keliling_m, 2) + ' m' }),
        h('dt', { text: 'Jumlah titik' }), h('dd', { text: String(m.titik) })));
      var polys = ml.polygonsOf(g), ring = polys[0] ? polys[0][0] : [];
      box.appendChild(h('details', { class: 'coords' }, h('summary', { text: 'Koordinat titik (bujur, lintang)' }),
        h('ol', null, ring.slice(0, Math.max(ring.length - 1, 0)).map(function (p) { return h('li', { text: p[0].toFixed(7) + ', ' + p[1].toFixed(7) }); }))));
      box.appendChild(h('details', { class: 'coords' }, h('summary', { text: 'Panjang tiap sisi' }),
        h('ol', null, m.sisi.map(function (s) { return h('li', { text: 'Titik ' + s.dari + ' ke ' + s.ke + ': ' + u.fmtNum(s.panjang_m, 2) + ' m' }); }))));
    }
    if (els.digSave) els.digSave.disabled = errs.length > 0;
  }

  function renderDigPanel() {
    var p = els.digPanel;
    if (!dig) { p.hidden = true; u.clear(p); return; }
    p.hidden = false; u.clear(p);
    p.appendChild(h('div', { class: 'dig-head' }, h('strong', { text: 'Digitasi ' + dig.id }), h('small', { class: 'muted', text: u.dash(dig.land.nomor_surat) + ' · ' + u.dash(dig.land.jenis_surat) })));
    var hint = h('div', { class: 'dig-hint small' });
    var actions = h('div', { class: 'dig-actions' });
    els.digMetrics = h('div', { class: 'dig-metrics' });
    els.digSave = null;
    if (dig.mode === 'drawing') {
      hint.textContent = 'Klik pada peta untuk menambah titik batas. Tekan "Selesai" bila titik sudah cukup (minimal 3).';
      actions.appendChild(h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Selesai', onclick: function () { if (dig.handler && dig.handler.completeShape) dig.handler.completeShape(); } }));
      actions.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Hapus titik terakhir', onclick: function () { if (dig.handler && dig.handler.deleteLastVertex) dig.handler.deleteLastVertex(); } }));
    } else if (dig.mode === 'edit') {
      hint.textContent = 'Seret titik untuk mengubah bentuk, seret titik tengah untuk menambah titik, klik titik untuk menghapusnya.';
      els.digSave = h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Simpan geometri', onclick: function (e) { saveDig(e.currentTarget); } });
      actions.appendChild(els.digSave);
      actions.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Gambar ulang', onclick: function () { redraw(); } }));
    } else if (dig.mode === 'multi') {
      hint.textContent = 'Geometri berupa MultiPolygon dan tidak dapat diedit di peta. Gambar ulang sebagai satu poligon, atau impor ulang melalui GeoJSON.';
      actions.appendChild(h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Gambar ulang', onclick: function () { redraw(); } }));
    } else {
      hint.textContent = 'Belum ada poligon. Mulai menggambar bidang di peta.';
      actions.appendChild(h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Mulai menggambar', onclick: function () { startDrawing(); renderDigPanel(); } }));
    }
    actions.appendChild(h('button', { class: 'btn btn-sm', type: 'button', text: 'Batalkan', onclick: function () { cancelDig(); } }));
    p.appendChild(hint); p.appendChild(actions); p.appendChild(els.digMetrics);
    p.appendChild(h('p', { class: 'disclaimer small', text: 'Luas dihitung dari poligon di layar dan disebut "Luas hasil pemetaan". Digitasi layar bukan pengukuran batas tanah secara resmi.' }));
    renderMetrics();
  }

  function redraw() {
    if (!dig) return;
    if (dig.layer) { drawGroup.removeLayer(dig.layer); dig.layer = null; }
    drawGroup.clearLayers();
    dig.dirty = true; dig.mode = 'idle';
    startDrawing(); renderDigPanel();
  }

  function saveDig(btn) {
    var g = currentGeometry();
    if (!g) return;
    var errs = ml.validateGeometry(g);
    if (errs.length) { renderMetrics(); u.toast('Geometri belum valid: ' + errs[0], 'err'); return; }
    return u.busy(btn, function () {
      return S.api.call('saveGeometry', { id_bidang: dig.id, geojson: g, sumber_geometri: 'Digitasi layar' }).then(function (r) {
        u.toast('Geometri tersimpan. Luas hasil pemetaan: ' + u.fmtNum(r.metrics.luas_m2, 2) + ' m².', 'ok');
        var id = dig.id;
        dig.dirty = false;
        return stopDigitize(true).then(function () { S.emit('data:changed', { id: id, geometry: true }); S.detail.open(id); });
      }).catch(function (e) { u.toast(e.message, 'err'); if (e.details) u.toast(String(e.details[0]), 'err'); });
    });
  }

  function cancelDig() {
    if (!dig) return;
    if (dig.dirty) {
      u.confirm({ title: 'Batalkan digitasi?', message: 'Perubahan yang belum disimpan akan hilang.', okLabel: 'Ya, batalkan', danger: true }).then(function (ok) { if (ok) stopDigitize(true); });
    } else stopDigitize(true);
  }

  /** Menghentikan digitasi. Mengembalikan Promise agar bisa dirantai. */
  function stopDigitize() {
    if (!dig) return Promise.resolve();
    try { if (dig.handler) dig.handler.disable(); } catch (e) { /* abaikan */ }
    try { if (dig.layer && dig.layer.editing) dig.layer.editing.disable(); } catch (e2) { /* abaikan */ }
    if (drawGroup) drawGroup.clearLayers();
    dig = null;
    renderDigPanel();
    applyFilters();
    return Promise.resolve();
  }

  /* ====================== Siklus hidup ====================== */
  function ensure() {
    if (!uiBuilt) buildUI();
    if (!map) {
      try { initMap(); }
      catch (e) { showOverlay(u.errorBox({ code: 'MAP_LIBRARY', message: e.message }, function () { uiBuilt = false; M.show(); })); return false; }
      loaded = false;   // peta baru: data poligon dan batas harus digambar ulang
    }
    return true;
  }

  M.show = function (params) {
    if (!ensure()) return;
    setTimeout(function () { if (map) map.invalidateSize(); }, 60);
    var go = function () {
      if (pendingFocus) { var f = pendingFocus; pendingFocus = null; openFeature(f); }
      if (pendingDigitize) { var d = pendingDigitize; pendingDigitize = null; startDigitize(d); }
    };
    if (params && params.focus) pendingFocus = params.focus;
    if (params && params.digitize) pendingDigitize = params.digitize;
    if (!loaded || stale) { loadAll().then(go); } else go();
  };

  M.focus = function (id) { pendingFocus = id; };
  M.invalidate = function () { if (map) map.invalidateSize(); };

  S.on('data:changed', function () { stale = true; detailCache = {}; if (document.getElementById('view-peta').classList.contains('active') && map && !dig) loadAll(); });
  S.on('auth:change', function () {
    var wasMap = !!map;
    stopDigitize();
    if (map) { try { map.remove(); } catch (e) { /* abaikan */ } }
    map = null; uiBuilt = false; loaded = false; stale = true; all = []; boundaryInfo = null; M._legendEl = null;
    if (wasMap && document.getElementById('view-peta').classList.contains('active')) M.show();
  });
  window.addEventListener('resize', u.debounce(function () { if (map) map.invalidateSize(); }, 200));
})();
