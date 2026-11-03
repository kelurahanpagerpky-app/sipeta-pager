/**
 * SIPETA PAGER - demo.js
 * MODE DEMO: menjalankan backend ASLI (assets/js/demo-backend.js, dihasilkan dari apps-script/*.gs)
 * di dalam browser dengan spreadsheet simulasi di memori. Tidak ada koneksi ke Google, dan tidak ada
 * data yang ditulis ke spreadsheet produksi. Semua data hilang saat halaman dimuat ulang.
 */
(function () {
  'use strict';
  var S = (window.SIPETA = window.SIPETA || {});
  var demo = (S.demo = {});
  var ready = null;
  var backend = null;

  var DEMO_TOKENS = {
    ADMINISTRATOR: { id: 'demo.administrator.tokendemo0001', email: 'admin.demo@example.invalid' },
    PETUGAS: { id: 'demo.petugas.tokendemo00000002', email: 'petugas.demo@example.invalid' }
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Berkas ' + src + ' gagal dimuat.')); };
      document.head.appendChild(s);
    });
  }

  function must(res, what) {
    if (!res || !res.success) throw new Error('Penyiapan demo gagal pada ' + what + ': ' + (res && res.message));
    return res.data;
  }

  function seed() {
    var data = window.SIPETA_DEMO_DATA;
    if (!data) throw new Error('demo-data.js tidak termuat.');
    var env = window.SIPETA_GAS_SHIM_ENV;
    Object.keys(DEMO_TOKENS).forEach(function (r) { env.addIdToken(DEMO_TOKENS[r].id, DEMO_TOKENS[r].email, { name: r === 'ADMINISTRATOR' ? 'Administrator Demo' : 'Petugas Demo' }); });
    var h = backend.handle;
    var login = must(h('login', null, { idToken: DEMO_TOKENS.ADMINISTRATOR.id }), 'login');
    var t = login.token;
    must(h('saveUser', t, { email: DEMO_TOKENS.PETUGAS.email, nama_pengguna: 'Petugas Demo', role: 'PETUGAS' }), 'pengguna');
    must(h('updateConfig', t, { kunci: 'PETA_PUBLIK_AKTIF', nilai: 'TRUE' }), 'konfigurasi');
    var imp = must(h('importCSV', t, { csv: data.csv, mode: 'commit' }), 'impor CSV');
    if (imp.invalid) throw new Error('Data demo CSV memiliki baris tidak valid.');
    data.verifiedIds.forEach(function (id) {
      var d = must(h('getLandDetail', t, { id_bidang: id }), 'detail ' + id);
      must(h('updateLand', t, { id_bidang: id, expected_updated_at: d.land.updated_at, land: { status_verifikasi: 'SUDAH_DIVERIFIKASI' } }), 'verifikasi ' + id);
    });
    var geo = must(h('importGeoJSON', t, { featureCollection: data.parcels, mode: 'commit', sumber_geometri: 'DATA DEMO (fiktif)' }), 'impor poligon');
    if (geo.invalid) throw new Error('Poligon demo tidak valid.');
    var f = data.boundary.features[0];
    must(h('importBoundary', t, {
      geojson: f, nama_wilayah: f.properties.nama_wilayah, sumber_data: f.properties.sumber_data, status_verifikasi: 'BELUM_DIVERIFIKASI',
      keterangan: 'DATA DEMO. Area contoh, bukan batas administrasi Kelurahan Pager.'
    }), 'batas');
    h('logout', t, {});
  }

  function init() {
    if (ready) return ready;
    ready = Promise.resolve().then(function () {
      if (!window.SIPETA_GAS_SHIM) return loadScript('assets/js/gas-shim.js');
    }).then(function () {
      var env = window.SIPETA_GAS_SHIM.create({ spreadsheetId: 'DEMO-SHEET', ownerEmail: 'pemilik.demo@example.invalid' });
      env.props.SPREADSHEET_ID = 'DEMO-SHEET';
      env.props.GOOGLE_CLIENT_ID = 'demo-client.invalid';
      env.props.ADMIN_EMAIL = DEMO_TOKENS.ADMINISTRATOR.email;
      window.SIPETA_GAS_SHIM_ENV = env;
      return loadScript('assets/js/demo-data.js');
    }).then(function () {
      return loadScript('assets/js/demo-backend.js');
    }).then(function () {
      backend = window.SIPETA_DEMO_BACKEND;
      backend.initDatabase();
      seed();
    });
    return ready;
  }

  demo.init = init;
  demo.idTokenFor = function (role) { return DEMO_TOKENS[role] ? DEMO_TOKENS[role].id : null; };

  demo.handle = function (action, token, params) {
    return init().then(function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var res = backend.handle(action, token, params, false);
          resolve(JSON.parse(JSON.stringify(res)));
        }, 40);
      });
    }, function (e) {
      return { success: false, errorCode: 'DEMO_INIT_FAILED', message: 'Mode demo gagal disiapkan: ' + e.message };
    });
  };
})();
