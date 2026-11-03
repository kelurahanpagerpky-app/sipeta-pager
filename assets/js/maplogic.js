/**
 * SIPETA PAGER - maplogic.js
 * Logika peta yang MURNI (tanpa DOM/Leaflet) sehingga dapat diuji di Node.
 *  - warna & legenda, filter fitur, validasi poligon di sisi klien, perhitungan luas/keliling.
 * Perhitungan memakai Turf.js bila tersedia, dan rumus bola yang sama (R = 6.378.137 m) bila tidak.
 * Hasil akhir yang disimpan tetap dihitung ulang oleh backend.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var ml = (S.ml = {});
  var R = 6378137;
  var IDN = { minLon: 90, maxLon: 145, minLat: -12, maxLat: 8 };

  ml.DEFAULT_COLORS = {
    LENGKAP: '#2e7d32', BELUM_LENGKAP: '#f9a825', SHM: '#1565c0', SPT: '#ef6c00', LAINNYA: '#6a1b9a', BELUM_VERIFIKASI: '#757575'
  };

  ml.colors = function (cfgColors) {
    var o = {};
    Object.keys(ml.DEFAULT_COLORS).forEach(function (k) {
      o[k] = cfgColors && /^#[0-9a-fA-F]{6}$/.test(cfgColors[k] || '') ? cfgColors[k] : ml.DEFAULT_COLORS[k];
    });
    return o;
  };

  /** mode: 'kategori' (jenis + verifikasi) atau 'inventarisasi' (kelengkapan data). */
  ml.colorFor = function (props, mode, colors) {
    var c = ml.colors(colors);
    if (mode === 'inventarisasi') return props.status_inventarisasi === 'LENGKAP' ? c.LENGKAP : c.BELUM_LENGKAP;
    if (props.status_verifikasi !== 'SUDAH_DIVERIFIKASI') return c.BELUM_VERIFIKASI;
    if (props.jenis_surat === 'SHM') return c.SHM;
    if (props.jenis_surat === 'SPT') return c.SPT;
    return c.LAINNYA;
  };

  ml.legend = function (mode, colors) {
    var c = ml.colors(colors);
    if (mode === 'inventarisasi') {
      return [{ color: c.LENGKAP, label: 'Data inventarisasi lengkap' }, { color: c.BELUM_LENGKAP, label: 'Data belum lengkap' }];
    }
    return [
      { color: c.SHM, label: 'SHM, terverifikasi administratif' },
      { color: c.SPT, label: 'SPT, terverifikasi administratif' },
      { color: c.LAINNYA, label: 'Dokumen lain, terverifikasi administratif' },
      { color: c.BELUM_VERIFIKASI, label: 'Data belum diverifikasi' }
    ];
  };

  /** f: {jenis, inv, ver, pet, rt, rw}. Kosong = tidak difilter. */
  ml.passes = function (p, f) {
    if (!p) return false;
    if (f.jenis && p.jenis_surat !== f.jenis) return false;
    if (f.inv && p.status_inventarisasi !== f.inv) return false;
    if (f.ver && p.status_verifikasi !== f.ver) return false;
    if (f.pet && p.status_pemetaan !== f.pet) return false;
    if (f.rt && String(p.rt) !== String(f.rt)) return false;
    if (f.rw && String(p.rw) !== String(f.rw)) return false;
    return true;
  };

  ml.activeFilterCount = function (f) {
    return ['jenis', 'inv', 'ver', 'pet', 'rt', 'rw'].filter(function (k) { return !!f[k]; }).length;
  };

  /** Parameter filter untuk API searchLand/exportLandData. */
  ml.apiFilters = function (f) {
    var o = {};
    if (f.jenis) o.jenis_surat = f.jenis;
    if (f.inv) o.status_inventarisasi = f.inv;
    if (f.ver) o.status_verifikasi = f.ver;
    if (f.pet) o.status_pemetaan = f.pet;
    if (f.rt) o.rt = f.rt;
    if (f.rw) o.rw = f.rw;
    return o;
  };

  /* ---------- Geometri ---------- */
  function rad(d) { return d * Math.PI / 180; }
  function haversine(a, b) {
    var dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function ringArea(ring) {
    var sum = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var p1 = ring[i], p2 = ring[i + 1];
      sum += rad(p2[0] - p1[0]) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
    }
    return Math.abs(sum * R * R / 2);
  }
  ml.polygonsOf = function (g) {
    if (!g) return [];
    if (g.type === 'Feature') g = g.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    return [];
  };

  function dist(a, b) {
    if (window.turf && window.turf.distance) {
      try { return window.turf.distance(a, b, { units: 'meters' }); } catch (e) { /* pakai rumus sendiri */ }
    }
    return haversine(a, b);
  }
  function areaOf(g) {
    if (window.turf && window.turf.area) {
      try { return window.turf.area({ type: 'Feature', properties: {}, geometry: g }); } catch (e) { /* pakai rumus sendiri */ }
    }
    var polys = ml.polygonsOf(g), a = 0;
    polys.forEach(function (rings) {
      var x = ringArea(rings[0]);
      for (var i = 1; i < rings.length; i++) x -= ringArea(rings[i]);
      a += Math.max(x, 0);
    });
    return a;
  }

  /** Luas (m², ha), keliling, jumlah titik, dan panjang tiap sisi pada batas luar poligon pertama. */
  ml.metrics = function (g) {
    var polys = ml.polygonsOf(g);
    if (!polys.length) return null;
    var perim = 0, pts = 0;
    polys.forEach(function (rings) {
      rings.forEach(function (ring) {
        for (var i = 0; i < ring.length - 1; i++) perim += dist(ring[i], ring[i + 1]);
        pts += ring.length - 1;
      });
    });
    var sides = [], outer = polys[0][0];
    for (var i = 0; i < outer.length - 1; i++) sides.push({ dari: i + 1, ke: (i + 2 > outer.length - 1 ? 1 : i + 2), panjang_m: dist(outer[i], outer[i + 1]) });
    var area = areaOf(g);
    return {
      luas_m2: Math.round(area * 100) / 100, luas_ha: Math.round(area / 10000 * 10000) / 10000,
      keliling_m: Math.round(perim * 100) / 100, titik: pts, sisi: sides
    };
  };

  function orient(a, b, c) { var v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return v > 0 ? 1 : (v < 0 ? -1 : 0); }
  function onSeg(a, b, c) { return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]); }
  function segX(p1, p2, p3, p4) {
    var o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSeg(p1, p2, p3)) return true;
    if (o2 === 0 && onSeg(p1, p2, p4)) return true;
    if (o3 === 0 && onSeg(p3, p4, p1)) return true;
    if (o4 === 0 && onSeg(p3, p4, p2)) return true;
    return false;
  }
  function selfIntersects(ring) {
    var n = ring.length - 1;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        if (j === i + 1) continue;
        if (i === 0 && j === n - 1) continue;
        if (segX(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
      }
    }
    return false;
  }

  /** Validasi awal di klien. Mengembalikan daftar pesan galat ([] = lolos). Backend tetap memvalidasi ulang. */
  ml.validateGeometry = function (g) {
    var errors = [];
    if (g && g.type === 'Feature') g = g.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return ['Geometri harus berupa Polygon atau MultiPolygon.'];
    var polys = ml.polygonsOf(g);
    if (!polys.length) return ['Geometri kosong.'];
    polys.forEach(function (rings, pi) {
      rings.forEach(function (ring, ri) {
        var label = 'Poligon ' + (pi + 1) + (ri ? ' (lubang ' + ri + ')' : '');
        if (!Array.isArray(ring) || ring.length < 4) { errors.push(label + ': minimal 3 titik berbeda.'); return; }
        for (var i = 0; i < ring.length; i++) {
          var p = ring[i];
          if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) { errors.push(label + ': titik ke-' + (i + 1) + ' tidak valid.'); return; }
          if (p[0] < IDN.minLon || p[0] > IDN.maxLon || p[1] < IDN.minLat || p[1] > IDN.maxLat) { errors.push(label + ': koordinat di luar wilayah Indonesia (periksa urutan [bujur, lintang]).'); return; }
        }
        var f = ring[0], l = ring[ring.length - 1];
        if (f[0] !== l[0] || f[1] !== l[1]) errors.push(label + ': ring belum tertutup.');
        else if (ringArea(ring) < 0.01) errors.push(label + ': luas nol (titik segaris).');
        else if (ring.length <= 1500 && selfIntersects(ring)) errors.push(label + ': garis saling berpotongan.');
      });
    });
    return errors;
  };

  /** GeoJSON [lon,lat] -> larik [lat,lon] untuk Leaflet. */
  ml.toLatLngs = function (ring) { return ring.map(function (p) { return [p[1], p[0]]; }); };

  /** Ambil geometri batas dari Feature / FeatureCollection (1 fitur) / geometri langsung. */
  ml.extractSingleGeometry = function (obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Isi berkas bukan objek GeoJSON.');
    if (obj.type === 'FeatureCollection') {
      if (!Array.isArray(obj.features) || obj.features.length !== 1) throw new Error('Batas wilayah harus berisi tepat 1 fitur (ditemukan ' + (obj.features ? obj.features.length : 0) + ').');
      return obj.features[0];
    }
    if (obj.type === 'Feature' || obj.type === 'Polygon' || obj.type === 'MultiPolygon') return obj;
    throw new Error('Tipe GeoJSON tidak didukung: ' + obj.type);
  };

  /** Mengolah teks hasil pencarian menjadi ringkasan baris daftar. */
  ml.resultLine = function (it, isStaff) {
    var parts = [it.jenis_surat];
    if (isStaff) { if (it.nomor_surat) parts.push(it.nomor_surat); if (it.nama_pemilik) parts.push(it.nama_pemilik); }
    return parts.filter(Boolean).join(' · ');
  };
})();
