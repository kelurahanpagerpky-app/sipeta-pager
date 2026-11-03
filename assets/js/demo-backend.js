/* DIHASILKAN OTOMATIS oleh tools/build-demo-backend.js dari apps-script/*.gs - JANGAN DISUNTING. */
/* Hanya dimuat pada MODE DEMO. Tidak ada koneksi ke Google. */
(function (global) {
  'use strict';
  var shim = global.SIPETA_GAS_SHIM_ENV;
  if (!shim) throw new Error("SIPETA_GAS_SHIM_ENV belum dibuat");
  var s = shim.services;
  var Logger = s.Logger, PropertiesService = s.PropertiesService, CacheService = s.CacheService, LockService = s.LockService,
      Utilities = s.Utilities, Session = s.Session, SpreadsheetApp = s.SpreadsheetApp, UrlFetchApp = s.UrlFetchApp, ContentService = s.ContentService;
/* ===== AdminService.gs ===== */
/**
 * SIPETA PAGER - AdminService.gs
 * Pengelolaan pengguna, konfigurasi, dan log aktivitas (khusus administrator),
 * serta konfigurasi publik yang aman.
 */

function getPublicConfig_() {
  var cfg = getConfig_();
  return {
    app: { nama: APP.NAMA, versi: APP.VERSI, kelurahan: APP.KELURAHAN, kecamatan: APP.KECAMATAN, kota: APP.KOTA },
    peta_publik_aktif: cfgBool_(cfg, 'PETA_PUBLIK_AKTIF'),
    jenis_surat: cfgJenis_(cfg),
    warna: {
      LENGKAP: cfg.WARNA_LENGKAP, BELUM_LENGKAP: cfg.WARNA_BELUM_LENGKAP, SHM: cfg.WARNA_SHM,
      SPT: cfg.WARNA_SPT, LAINNYA: cfg.WARNA_LAINNYA, BELUM_VERIFIKASI: cfg.WARNA_BELUM_VERIFIKASI
    }
  };
}

function listUsers_(ctx) {
  var t = readTable_(SHEET.USER);
  return { items: t.rows.map(function (u) {
    return { user_id: u.user_id, nama_pengguna: u.nama_pengguna, email: u.email, role: u.role,
      status_akun: u.status_akun, created_at: u.created_at, last_login: u.last_login };
  }) };
}

function saveUser_(ctx, params) {
  params = params || {};
  var email = cleanText_(params.email).toLowerCase();
  var nama = cleanText_(params.nama_pengguna);
  var role = cleanText_(params.role).toUpperCase();
  var status = cleanText_(params.status_akun).toUpperCase() || STATUS.AKTIF;
  var errors = [];
  if (!isValidEmail_(email)) errors.push('Email tidak valid.');
  if (!nama || nama.length > 100) errors.push('Nama wajib diisi (maksimal 100 karakter).');
  if (!validRole_(role)) errors.push('Role harus ADMINISTRATOR atau PETUGAS.');
  if (status !== STATUS.AKTIF && status !== STATUS.NONAKTIF) errors.push('Status akun harus AKTIF atau NONAKTIF.');
  if (errors.length) throw new AppError('VALIDATION_ERROR', 'Data pengguna tidak valid.', 400, errors);
  return withLock_(function () {
    var t = readTable_(SHEET.USER);
    var existing = null;
    t.rows.forEach(function (u) { if (String(u.email).toLowerCase() === email) existing = u; });
    var wasActiveAdmin = existing && existing.role === ROLE.ADMIN && existing.status_akun === STATUS.AKTIF;
    var willBeActiveAdmin = role === ROLE.ADMIN && status === STATUS.AKTIF;
    if (existing && existing.user_id === ctx.user.user_id && (!willBeActiveAdmin)) {
      throw new AppError('VALIDATION_ERROR', 'Anda tidak dapat menurunkan atau menonaktifkan akun Anda sendiri.', 400);
    }
    if (wasActiveAdmin && !willBeActiveAdmin) {
      var others = t.rows.filter(function (u) {
        return u.user_id !== existing.user_id && u.role === ROLE.ADMIN && u.status_akun === STATUS.AKTIF;
      }).length;
      if (!others) throw new AppError('VALIDATION_ERROR', 'Harus tersisa minimal satu administrator aktif.', 400);
    }
    var obj;
    if (existing) {
      obj = existing;
      obj.nama_pengguna = nama; obj.role = role; obj.status_akun = status;
      updateObject_(SHEET.USER, obj);
    } else {
      var max = 0;
      t.rows.forEach(function (u) { var m = /^USR-(\d+)$/.exec(u.user_id); if (m) max = Math.max(max, parseInt(m[1], 10)); });
      obj = { user_id: 'USR-' + pad_(max + 1, 4), nama_pengguna: nama, email: email, role: role,
        status_akun: status, created_at: nowIso_(), last_login: '' };
      appendObjects_(SHEET.USER, [obj]);
    }
    logActivity_(ctx, existing ? 'UBAH_PENGGUNA' : 'TAMBAH_PENGGUNA', 'PENGGUNA', obj.user_id, 'Role ' + role + ', status ' + status);
    return { user_id: obj.user_id, email: obj.email, role: obj.role, status_akun: obj.status_akun };
  });
}

function getActivityLog_(ctx, params) {
  params = params || {};
  var t = readTable_(SHEET.LOG);
  var users = readTable_(SHEET.USER);
  var names = {};
  users.rows.forEach(function (u) { names[u.user_id] = u.nama_pengguna; });
  var q = cleanText_(params.q).toLowerCase();
  var rows = t.rows.filter(function (l) {
    if (!q) return true;
    return (String(l.aksi) + ' ' + l.entitas + ' ' + l.id_referensi + ' ' + l.keterangan).toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  var pg = clampPage_(params, LIMITS.LOG_PAGE_MAX);
  var start = (pg.page - 1) * pg.size;
  return {
    items: rows.slice(start, start + pg.size).map(function (l) {
      return { timestamp: l.timestamp, pengguna: names[l.user_id] || l.user_id, aksi: l.aksi, entitas: l.entitas,
        id_referensi: l.id_referensi, keterangan: l.keterangan, status: l.status };
    }),
    total: rows.length, page: pg.page, pageSize: pg.size, totalPages: Math.max(1, Math.ceil(rows.length / pg.size))
  };
}

function updateConfig_(ctx, params) {
  var key = params && params.kunci;
  var rule = CONFIG_RULES[key];
  if (!rule) throw new AppError('VALIDATION_ERROR', 'Kunci konfigurasi tidak dikenal atau tidak boleh diubah.', 400);
  var val = cleanText_(params.nilai);
  if (rule.type === 'bool') {
    val = val.toUpperCase();
    if (val !== 'TRUE' && val !== 'FALSE') throw new AppError('VALIDATION_ERROR', 'Nilai harus TRUE atau FALSE.', 400);
  } else if (rule.type === 'color') {
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) throw new AppError('VALIDATION_ERROR', 'Warna harus berformat #RRGGBB.', 400);
  } else if (rule.type === 'int') {
    var n = parseInt(val, 10);
    if (!isFinite(n) || n < rule.min || n > rule.max || String(n) !== val) {
      throw new AppError('VALIDATION_ERROR', 'Nilai harus bilangan bulat ' + rule.min + '-' + rule.max + '.', 400);
    }
  } else if (rule.type === 'list') {
    var list = val.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(function (s) { return s; });
    if (!list.length || list.length > 12 || list.some(function (s) { return !/^[A-Z0-9_]{2,20}$/.test(s); })) {
      throw new AppError('VALIDATION_ERROR', 'Daftar harus berisi 1-12 kode huruf besar/angka (2-20 karakter), dipisah koma.', 400);
    }
    if (list.indexOf('SPT') < 0 || list.indexOf('SHM') < 0) {
      throw new AppError('VALIDATION_ERROR', 'Daftar jenis surat harus tetap memuat SPT dan SHM.', 400);
    }
    val = list.join(',');
  }
  return withLock_(function () {
    var t = readTable_(SHEET.KONF);
    var row = null;
    t.rows.forEach(function (r) { if (r.kunci === key) row = r; });
    if (row) { row.nilai = val; updateObject_(SHEET.KONF, row); }
    else {
      var def = '';
      DEFAULT_CONFIG.forEach(function (d) { if (d[0] === key) def = d[2]; });
      appendObjects_(SHEET.KONF, [{ kunci: key, nilai: val, keterangan: def }]);
    }
    logActivity_(ctx, 'UBAH_KONFIGURASI', 'KONFIGURASI', key, 'Nilai diubah menjadi ' + val);
    bumpCache_();
    return { kunci: key, nilai: val };
  });
}

/* ===== Auth.gs ===== */
/**
 * SIPETA PAGER - Auth.gs
 * Autentikasi: Google Sign-In (ID token diverifikasi di server) -> token sesi acak
 * yang disimpan di CacheService. Role SELALU dibaca dari sheet PENGGUNA,
 * tidak pernah dari parameter yang dikirim browser.
 */

function findUserByEmail_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  var t = readTable_(SHEET.USER);
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i].email).trim().toLowerCase() === e) return t.rows[i];
  }
  return null;
}

function findUserById_(id) {
  var t = readTable_(SHEET.USER);
  for (var i = 0; i < t.rows.length; i++) {
    if (t.rows[i].user_id === id) return t.rows[i];
  }
  return null;
}

function validRole_(r) {
  return r === ROLE.ADMIN || r === ROLE.PETUGAS;
}

/** Membentuk konteks permintaan dari token sesi (bisa kosong = publik). */
function getCtx_(token) {
  var ctx = { authenticated: false, role: ROLE.PUBLIK, user: null, token: null };
  if (token === undefined || token === null || token === '') return ctx;
  if (typeof token !== 'string' || token.length < 32 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new AppError('SESSION_EXPIRED', 'Sesi tidak valid. Silakan masuk kembali.', 401);
  }
  var key = 'sess_' + sha256Hex_(token);
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) throw new AppError('SESSION_EXPIRED', 'Sesi telah berakhir. Silakan masuk kembali.', 401);
  var s;
  try { s = JSON.parse(raw); } catch (e) { s = null; }
  var user = s ? findUserById_(s.uid) : null;
  if (!user || user.status_akun !== STATUS.AKTIF || !validRole_(user.role)) {
    CacheService.getScriptCache().remove(key);
    throw new AppError('SESSION_EXPIRED', 'Akun tidak aktif atau sesi tidak berlaku. Silakan masuk kembali.', 401);
  }
  ctx.authenticated = true;
  ctx.role = user.role;
  ctx.token = token;
  ctx.user = { user_id: user.user_id, nama: user.nama_pengguna, email: user.email, role: user.role };
  return ctx;
}

function requireRole_(ctx, min) {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[min]) {
    if (!ctx.authenticated) throw new AppError('UNAUTHENTICATED', 'Anda harus masuk terlebih dahulu untuk menggunakan fitur ini.', 401);
    throw new AppError('FORBIDDEN', 'Anda tidak memiliki izin untuk tindakan ini.', 403);
  }
}

/** Memverifikasi Google ID token ke endpoint tokeninfo Google. */
function verifyGoogleIdToken_(idToken) {
  var clientId = getProp_('GOOGLE_CLIENT_ID');
  if (!clientId) {
    throw new AppError('NOT_CONFIGURED', 'Google Client ID belum diatur di Script Properties (GOOGLE_CLIENT_ID).', 503);
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) {
    throw new AppError('UNAUTHENTICATED', 'Token Google tidak valid.', 401);
  }
  var resp;
  try {
    resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  } catch (e) {
    throw new AppError('UPSTREAM_ERROR', 'Layanan verifikasi Google tidak dapat dihubungi. Coba lagi.', 502);
  }
  if (resp.getResponseCode() !== 200) {
    throw new AppError('UNAUTHENTICATED', 'Token Google tidak valid atau sudah kedaluwarsa.', 401);
  }
  var info;
  try { info = JSON.parse(resp.getContentText()); } catch (e) { info = null; }
  if (!info || info.aud !== clientId) {
    throw new AppError('UNAUTHENTICATED', 'Token Google tidak ditujukan untuk aplikasi ini.', 401);
  }
  if (info.iss !== 'https://accounts.google.com' && info.iss !== 'accounts.google.com') {
    throw new AppError('UNAUTHENTICATED', 'Penerbit token tidak valid.', 401);
  }
  var exp = parseInt(info.exp, 10);
  if (!exp || exp * 1000 < Date.now()) {
    throw new AppError('UNAUTHENTICATED', 'Token Google sudah kedaluwarsa.', 401);
  }
  if (String(info.email_verified) !== 'true' || !isValidEmail_(info.email)) {
    throw new AppError('UNAUTHENTICATED', 'Email Google belum terverifikasi.', 401);
  }
  return { email: String(info.email).toLowerCase(), name: String(info.name || '') };
}

function login_(ctx, params) {
  var idToken = params && params.idToken;
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) {
    throw new AppError('VALIDATION_ERROR', 'Token Google tidak dikirim atau tidak valid.', 400);
  }
  rateCheck_('loginfail', RATE.LOGIN_FAIL_MAX);
  var info;
  try {
    info = verifyGoogleIdToken_(idToken);
  } catch (e) {
    if (e instanceof AppError && e.code !== 'NOT_CONFIGURED') rateHit_('loginfail', RATE.LOGIN_FAIL_MAX, RATE.LOGIN_FAIL_SEC);
    throw e;
  }
  var user = findUserByEmail_(info.email);
  if (!user || user.status_akun !== STATUS.AKTIF || !validRole_(user.role)) {
    rateHit_('loginfail', RATE.LOGIN_FAIL_MAX, RATE.LOGIN_FAIL_SEC);
    logActivity_(null, 'LOGIN', 'PENGGUNA', '', 'Percobaan masuk ditolak: akun tidak terdaftar/nonaktif (' + info.email + ')', 'GAGAL');
    throw new AppError('FORBIDDEN', 'Akun Google ini belum terdaftar atau tidak aktif. Hubungi administrator kelurahan.', 403);
  }
  var cfg = getConfig_();
  var hours = cfgInt_(cfg, 'SESSION_JAM', 6, 1, 6);
  var token = randomToken_();
  var ttl = hours * 3600;
  CacheService.getScriptCache().put('sess_' + sha256Hex_(token), JSON.stringify({ uid: user.user_id }), ttl);
  withLock_(function () {
    var fresh = findUserById_(user.user_id);
    if (fresh) { fresh.last_login = nowIso_(); updateObject_(SHEET.USER, fresh); }
  });
  var c2 = { user: { user_id: user.user_id } };
  logActivity_(c2, 'LOGIN', 'PENGGUNA', user.user_id, 'Masuk berhasil', 'SUKSES');
  return {
    token: token,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    user: { user_id: user.user_id, nama: user.nama_pengguna, email: user.email, role: user.role }
  };
}

function logout_(ctx) {
  if (ctx.token) CacheService.getScriptCache().remove('sess_' + sha256Hex_(ctx.token));
  return { loggedOut: true };
}

function getCurrentUser_(ctx) {
  if (!ctx.authenticated) return { authenticated: false, role: ROLE.PUBLIK, user: null };
  return { authenticated: true, role: ctx.role, user: ctx.user };
}

/* ===== Code.gs ===== */
/**
 * SIPETA PAGER - Code.gs
 * Titik masuk Web App (doGet/doPost) dan router aksi.
 *
 * Kontrak:
 *  - POST dengan Content-Type text/plain (menghindari preflight CORS) berisi JSON:
 *      { "action": "searchLand", "token": "<token sesi, opsional>", "params": { ... } }
 *  - GET hanya untuk aksi baca publik tanpa token: ?action=healthCheck
 *  - Respons selalu JSON: { success, message, data } atau { success:false, message, errorCode, details? }
 *  - Hak akses SELALU diperiksa di sini; role tidak pernah dibaca dari permintaan.
 */

/**
 * Tabel aksi. min = role minimum, write = operasi tulis (dibatasi laju),
 * get = boleh lewat GET (hanya aksi publik tanpa token).
 */
var _actionsMemo = null;

/** Dibangun saat dipanggil (bukan di level atas) agar tidak bergantung pada urutan pemuatan file. */
function actions_() {
  if (_actionsMemo) return _actionsMemo;
  _actionsMemo = buildActions_();
  return _actionsMemo;
}

function buildActions_() { return {
  healthCheck:       { min: ROLE.PUBLIK,  get: true,  fn: function (ctx, p) { return healthCheck_(); } },
  getPublicConfig:   { min: ROLE.PUBLIK,  get: true,  fn: function (ctx, p) { return getPublicConfig_(); } },
  getBoundary:       { min: ROLE.PUBLIK,  get: true,  fn: function (ctx, p) { return getBoundary_(ctx); } },
  getPublicMapData:  { min: ROLE.PUBLIK,  get: true,  fn: function (ctx, p) { return getPublicMapData_(ctx); } },
  getDashboardStats: { min: ROLE.PUBLIK,  get: true,  fn: function (ctx, p) { return getDashboardStats_(ctx); } },
  login:             { min: ROLE.PUBLIK,  noAuth: true, fn: function (ctx, p) { return login_(ctx, p); } },
  logout:            { min: ROLE.PUBLIK,  fn: function (ctx, p) { return logout_(ctx); } },
  getCurrentUser:    { min: ROLE.PUBLIK,  fn: function (ctx, p) { return getCurrentUser_(ctx); } },
  searchLand:        { min: ROLE.PUBLIK,  fn: function (ctx, p) { return searchLand_(ctx, p); } },
  getLandDetail:     { min: ROLE.PUBLIK,  fn: function (ctx, p) { return getLandDetail_(ctx, p); } },
  getReport:         { min: ROLE.PETUGAS, fn: function (ctx, p) { return getReport_(ctx); } },
  getLandHistory:    { min: ROLE.PETUGAS, fn: function (ctx, p) { return getLandHistory_(ctx, p); } },
  exportLandData:    { min: ROLE.PETUGAS, fn: function (ctx, p) { return exportLandData_(ctx, p); } },
  createLand:        { min: ROLE.PETUGAS, write: true, fn: function (ctx, p) { return createLand_(ctx, p); } },
  updateLand:        { min: ROLE.PETUGAS, write: true, fn: function (ctx, p) { return updateLand_(ctx, p); } },
  saveGeometry:      { min: ROLE.PETUGAS, write: true, fn: function (ctx, p) { return saveGeometry_(ctx, p); } },
  archiveLand:       { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return archiveLand_(ctx, p); } },
  restoreLand:       { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return restoreLand_(ctx, p); } },
  importGeoJSON:     { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return importGeoJSON_(ctx, p); } },
  importCSV:         { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return importCSV_(ctx, p); } },
  importBoundary:    { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return importBoundary_(ctx, p); } },
  setBoundaryStatus: { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return setBoundaryStatus_(ctx, p); } },
  listUsers:         { min: ROLE.ADMIN,   fn: function (ctx, p) { return listUsers_(ctx); } },
  saveUser:          { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return saveUser_(ctx, p); } },
  getActivityLog:    { min: ROLE.ADMIN,   fn: function (ctx, p) { return getActivityLog_(ctx, p); } },
  updateConfig:      { min: ROLE.ADMIN,   write: true, fn: function (ctx, p) { return updateConfig_(ctx, p); } }
}; }

function healthCheck_() {
  var out = { app: APP.NAMA, versi: APP.VERSI, waktu: nowIso_(), konfigurasi: { spreadsheet: false, database: false, google_client_id: false } };
  out.konfigurasi.google_client_id = !!getProp_('GOOGLE_CLIENT_ID');
  if (!getProp_('SPREADSHEET_ID')) return out;
  out.konfigurasi.spreadsheet = true;
  try {
    var ss = getSpreadsheet_();
    out.konfigurasi.database = Object.keys(HEADERS).every(function (n) { return !!ss.getSheetByName(n); });
  } catch (e) { out.konfigurasi.spreadsheet = false; }
  return out;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function okBody_(data) {
  return { success: true, message: 'Data berhasil diproses', data: data === undefined ? {} : data };
}

function errBody_(err) {
  if (err instanceof AppError) {
    var b = { success: false, message: err.message, errorCode: err.code };
    if (err.details !== null && err.details !== undefined) b.details = err.details;
    return b;
  }
  console.error('Galat internal: ' + (err && err.stack ? err.stack : err));
  return { success: false, message: 'Terjadi kesalahan pada server. Silakan coba lagi atau hubungi administrator.', errorCode: 'INTERNAL_ERROR' };
}

/** Pemrosesan inti, dapat diuji tanpa lapisan HTTP. */
function handle_(action, token, params, viaGet) {
  resetMemo_();
  try {
    var table = actions_();
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(table, action)) {
      throw new AppError('UNKNOWN_ACTION', 'Aksi tidak dikenal.', 404);
    }
    var def = table[action];
    if (viaGet && !def.get) throw new AppError('METHOD_NOT_ALLOWED', 'Aksi ini harus dikirim dengan metode POST.', 405);
    if (params !== undefined && params !== null && !isPlainObject_(params)) {
      throw new AppError('VALIDATION_ERROR', 'Parameter harus berupa objek.', 400);
    }
    params = params || {};
    var ctx = def.noAuth ? { authenticated: false, role: ROLE.PUBLIK, user: null, token: null } : getCtx_(token);
    requireRole_(ctx, def.min);
    if (def.write) rateHit_('w_' + ctx.user.user_id, RATE.WRITE_MAX, RATE.WRITE_SEC);
    return okBody_(def.fn(ctx, params));
  } catch (err) {
    return errBody_(err);
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  return jsonOut_(handle_(p.action || 'healthCheck', null, {}, true));
}

function doPost(e) {
  var body;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw.length) throw new AppError('VALIDATION_ERROR', 'Isi permintaan kosong.', 400);
    if (raw.length > LIMITS.BODY_CHARS) throw new AppError('LIMIT_EXCEEDED', 'Ukuran permintaan terlalu besar.', 413);
    try { body = JSON.parse(raw); } catch (x) { throw new AppError('VALIDATION_ERROR', 'Isi permintaan bukan JSON yang valid.', 400); }
    if (!isPlainObject_(body)) throw new AppError('VALIDATION_ERROR', 'Isi permintaan tidak valid.', 400);
  } catch (err) {
    return jsonOut_(errBody_(err));
  }
  return jsonOut_(handle_(body.action, body.token, body.params, false));
}

/* ===== Config.gs ===== */
/**
 * SIPETA PAGER - Config.gs
 * Konstanta, struktur sheet, konfigurasi bawaan, dan kelas AppError.
 * File ini TIDAK berisi rahasia. Rahasia (Spreadsheet ID, Google Client ID,
 * email administrator awal) disimpan di Script Properties.
 *
 * Catatan: jangan menjalankan kode yang memanggil file lain pada level atas
 * (top-level) karena urutan pemuatan file di Apps Script tidak dijamin.
 */

var APP = {
  NAMA: 'SIPETA PAGER',
  VERSI: '1.0.0',
  KELURAHAN: 'Pager',
  KECAMATAN: 'Rakumpit',
  KOTA: 'Palangka Raya',
  PROVINSI: 'Kalimantan Tengah'
};

var SHEET = {
  BIDANG: 'BIDANG_TANAH',
  GEOM: 'GEOMETRI_BIDANG',
  BATAS: 'BATAS_WILAYAH',
  USER: 'PENGGUNA',
  LOG: 'LOG_AKTIVITAS',
  KONF: 'KONFIGURASI'
};

var ROLE = { ADMIN: 'ADMINISTRATOR', PETUGAS: 'PETUGAS', PUBLIK: 'PUBLIK' };
var ROLE_RANK = { PUBLIK: 0, PETUGAS: 1, ADMINISTRATOR: 2 };

var STATUS = {
  LENGKAP: 'LENGKAP',
  BELUM_LENGKAP: 'BELUM_LENGKAP',
  DIVERIFIKASI: 'SUDAH_DIVERIFIKASI',
  BELUM_DIVERIFIKASI: 'BELUM_DIVERIFIKASI',
  DIPETAKAN: 'SUDAH_DIPETAKAN',
  BELUM_DIPETAKAN: 'BELUM_DIPETAKAN',
  AKTIF: 'AKTIF',
  NONAKTIF: 'NONAKTIF',
  ARSIP: 'ARSIP'
};

/** Header setiap sheet. Urutan kolom = urutan di spreadsheet. */
var HEADERS = {
  BIDANG_TANAH: [
    'id_bidang', 'nomor_surat', 'jenis_surat', 'nama_pemilik', 'nik', 'alamat_pemilik',
    'alamat_objek', 'kelurahan', 'kecamatan', 'kota', 'rt', 'rw', 'panjang_meter',
    'lebar_meter', 'luas_dokumen_m2', 'luas_peta_m2', 'tanggal_surat', 'tanggal_pendataan',
    'penggunaan_tanah', 'status_inventarisasi', 'status_verifikasi', 'status_pemetaan',
    'nomor_persil', 'nomor_peta_bidang', 'keterangan', 'sumber_data', 'petugas_pendata',
    'created_at', 'updated_at', 'status_arsip'
  ],
  GEOMETRI_BIDANG: [
    'id_bidang', 'geojson', 'sumber_geometri', 'tanggal_pemetaan', 'petugas_pemetaan',
    'status_verifikasi_geometri', 'keterangan_geometri', 'updated_at'
  ],
  BATAS_WILAYAH: [
    'id_batas', 'nama_wilayah', 'tingkat_administrasi', 'geojson', 'sumber_data',
    'tanggal_data', 'status_verifikasi', 'keterangan'
  ],
  PENGGUNA: ['user_id', 'nama_pengguna', 'email', 'role', 'status_akun', 'created_at', 'last_login'],
  LOG_AKTIVITAS: ['id_log', 'timestamp', 'user_id', 'aksi', 'entitas', 'id_referensi', 'keterangan', 'status'],
  KONFIGURASI: ['kunci', 'nilai', 'keterangan']
};

/** Kolom bertipe angka. Semua kolom lain disimpan sebagai teks (mencegah rumus/auto-format). */
var NUMERIC_COLUMNS = ['panjang_meter', 'lebar_meter', 'luas_dokumen_m2', 'luas_peta_m2'];
var DATE_COLUMNS = ['tanggal_surat', 'tanggal_pendataan', 'tanggal_pemetaan', 'tanggal_data'];

var LIMITS = {
  GEOJSON_CHARS: 48000,        // batas 50.000 karakter per sel Google Sheets
  PAGE_MAX: 100,
  PAGE_MAX_PUBLIK: 25,
  IMPORT_CSV_ROWS: 500,
  IMPORT_GEO_FEATURES: 100,
  MAP_FEATURES: 5000,
  EXPORT_ROWS: 5000,
  BODY_CHARS: 4000000,
  LOG_PAGE_MAX: 100,
  MAX_POLYGONS: 50,
  MAX_RING_POINTS: 5000,
  SELFCHECK_POINTS: 1500
};

var RATE = {
  LOGIN_FAIL_MAX: 60, LOGIN_FAIL_SEC: 300,
  WRITE_MAX: 200, WRITE_SEC: 600,
  EXPORT_MAX: 15, EXPORT_SEC: 3600
};

/** Konfigurasi bawaan: [kunci, nilai, keterangan]. Hanya data non-rahasia. */
var DEFAULT_CONFIG = [
  ['PETA_PUBLIK_AKTIF', 'FALSE', 'TRUE = pengunjung publik boleh melihat poligon bidang dan mencari ID/jenis dokumen. Bawaan FALSE (aman).'],
  ['JENIS_SURAT', 'SPT,SHM,LAINNYA', 'Daftar jenis dokumen yang diizinkan, dipisah koma, huruf besar.'],
  ['WARNA_LENGKAP', '#2e7d32', 'Warna poligon: data inventarisasi lengkap.'],
  ['WARNA_BELUM_LENGKAP', '#f9a825', 'Warna poligon: data belum lengkap.'],
  ['WARNA_SHM', '#1565c0', 'Warna poligon: SHM yang sudah diverifikasi administratif.'],
  ['WARNA_SPT', '#ef6c00', 'Warna poligon: SPT yang sudah diverifikasi administratif.'],
  ['WARNA_LAINNYA', '#6a1b9a', 'Warna poligon: jenis dokumen lain yang sudah diverifikasi.'],
  ['WARNA_BELUM_VERIFIKASI', '#757575', 'Warna poligon: data belum diverifikasi.'],
  ['SESSION_JAM', '6', 'Masa berlaku sesi masuk (1-6 jam).']
];

/** Aturan validasi nilai konfigurasi yang boleh diubah administrator. */
var CONFIG_RULES = {
  PETA_PUBLIK_AKTIF: { type: 'bool' },
  JENIS_SURAT: { type: 'list' },
  WARNA_LENGKAP: { type: 'color' },
  WARNA_BELUM_LENGKAP: { type: 'color' },
  WARNA_SHM: { type: 'color' },
  WARNA_SPT: { type: 'color' },
  WARNA_LAINNYA: { type: 'color' },
  WARNA_BELUM_VERIFIKASI: { type: 'color' },
  SESSION_JAM: { type: 'int', min: 1, max: 6 }
};

/** Galat terkontrol: pesan aman ditampilkan kepada pengguna. */
function AppError(code, message, status, details) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.status = status || 400;
  this.details = details === undefined ? null : details;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var _cfgMemo = null;

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function resetMemo_() {
  _cfgMemo = null;
  _ssMemo = null;
  _sheetMemo = {};
}

/** Membaca konfigurasi (sheet KONFIGURASI + bawaan). Di-cache. */
function getConfig_() {
  if (_cfgMemo) return _cfgMemo;
  var key = 'cfg_' + cacheVer_();
  var cached = cacheGet_(key);
  if (cached) {
    _cfgMemo = JSON.parse(cached);
    return _cfgMemo;
  }
  var cfg = {};
  DEFAULT_CONFIG.forEach(function (d) { cfg[d[0]] = d[1]; });
  var t = readTable_(SHEET.KONF);
  t.rows.forEach(function (r) {
    if (r.kunci) cfg[String(r.kunci)] = String(r.nilai);
  });
  cachePut_(key, JSON.stringify(cfg), 300);
  _cfgMemo = cfg;
  return cfg;
}

function cfgBool_(cfg, key) {
  return String(cfg[key]).toUpperCase() === 'TRUE';
}

function cfgJenis_(cfg) {
  return String(cfg.JENIS_SURAT || 'SPT,SHM,LAINNYA').split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s) { return s; });
}

function cfgInt_(cfg, key, def, min, max) {
  var n = parseInt(cfg[key], 10);
  if (!isFinite(n)) n = def;
  return Math.max(min, Math.min(max, n));
}

/* ===== Database.gs ===== */
/**
 * SIPETA PAGER - Database.gs
 * Akses Google Sheets: pembacaan/penulisan batch, ID, log, inisialisasi.
 * Frontend tidak pernah mengakses spreadsheet secara langsung.
 */

var _ssMemo = null;
var _sheetMemo = {};

function getSpreadsheet_() {
  if (_ssMemo) return _ssMemo;
  var id = getProp_('SPREADSHEET_ID');
  if (!id) {
    throw new AppError('NOT_CONFIGURED', 'Spreadsheet belum dikonfigurasi. Isi Script Property SPREADSHEET_ID.', 503);
  }
  try {
    _ssMemo = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new AppError('NOT_CONFIGURED', 'Spreadsheet tidak dapat dibuka. Periksa SPREADSHEET_ID dan izin akun pemilik skrip.', 503);
  }
  return _ssMemo;
}

function getSheet_(name) {
  if (_sheetMemo[name]) return _sheetMemo[name];
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) {
    throw new AppError('NOT_INITIALIZED', 'Sheet ' + name + ' belum dibuat. Jalankan fungsi initDatabase() di editor Apps Script.', 503);
  }
  _sheetMemo[name] = sh;
  return sh;
}

function normalizeCell_(v, header) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (DATE_COLUMNS.indexOf(header) >= 0) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return v.toISOString();
  }
  return v;
}

function checkHeader_(name, first) {
  var H = HEADERS[name];
  for (var i = 0; i < H.length; i++) {
    if (String(first[i] === undefined ? '' : first[i]).trim() !== H[i]) {
      throw new AppError('NOT_INITIALIZED', 'Struktur sheet ' + name + ' tidak sesuai. Periksa header kolom atau jalankan initDatabase().', 503);
    }
  }
}

/** Membaca seluruh tabel secara batch. Setiap objek membawa _row (nomor baris sheet). */
function readTable_(name) {
  var sh = getSheet_(name);
  var H = HEADERS[name];
  var last = sh.getLastRow();
  var rows = [];
  if (last < 1) {
    throw new AppError('NOT_INITIALIZED', 'Sheet ' + name + ' kosong. Jalankan initDatabase().', 503);
  }
  var vals = sh.getRange(1, 1, last, H.length).getValues();
  checkHeader_(name, vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (r[0] === '' || r[0] === null || r[0] === undefined) continue;
    var o = { _row: i + 1 };
    for (var c = 0; c < H.length; c++) o[H[c]] = normalizeCell_(r[c], H[c]);
    rows.push(o);
  }
  return { sheet: sh, headers: H, rows: rows };
}

function objToRow_(name, obj) {
  var H = HEADERS[name];
  return H.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (NUMERIC_COLUMNS.indexOf(h) >= 0) return (typeof v === 'number' && isFinite(v)) ? v : '';
    return typeof v === 'string' ? v : String(v);
  });
}

function ensureRows_(sh, neededLastRow) {
  var max = sh.getMaxRows();
  if (neededLastRow > max) sh.insertRowsAfter(max, neededLastRow - max);
}

function appendObjects_(name, objs) {
  if (!objs.length) return;
  var sh = getSheet_(name);
  var H = HEADERS[name];
  var start = sh.getLastRow() + 1;
  if (start < 2) start = 2;
  ensureRows_(sh, start + objs.length - 1);
  sh.getRange(start, 1, objs.length, H.length).setValues(objs.map(function (o) { return objToRow_(name, o); }));
}

function updateObject_(name, obj) {
  var sh = getSheet_(name);
  var H = HEADERS[name];
  if (!obj._row) throw new Error('Baris tidak diketahui');
  sh.getRange(obj._row, 1, 1, H.length).setValues([objToRow_(name, obj)]);
}

/** Menimpa seluruh isi data (baris 2 dst) dengan daftar objek. Dipanggil di dalam lock. */
function rewriteTable_(name, objs) {
  var sh = getSheet_(name);
  var H = HEADERS[name];
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, H.length).clearContent();
  if (!objs.length) return;
  ensureRows_(sh, objs.length + 1);
  sh.getRange(2, 1, objs.length, H.length).setValues(objs.map(function (o) { return objToRow_(name, o); }));
}

/** Mengalokasikan ID berurutan PGR-000001 dst. Harus dipanggil di dalam lock. */
function allocateIds_(count, landRows) {
  var props = PropertiesService.getScriptProperties();
  var counter = parseInt(props.getProperty('ID_COUNTER') || '0', 10) || 0;
  var max = 0;
  landRows.forEach(function (r) {
    var m = /^PGR-(\d{6,})$/.exec(String(r.id_bidang));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  var next = Math.max(counter, max);
  var ids = [];
  for (var i = 0; i < count; i++) {
    next++;
    ids.push('PGR-' + pad_(next, 6));
  }
  props.setProperty('ID_COUNTER', String(next));
  return ids;
}

/** Mencatat aktivitas. Tidak pernah menyimpan token, kata sandi, atau nilai data pribadi. */
function logActivity_(ctx, aksi, entitas, idRef, ket, status) {
  try {
    var o = {
      id_log: Utilities.getUuid(),
      timestamp: nowIso_(),
      user_id: ctx && ctx.user ? ctx.user.user_id : '-',
      aksi: aksi,
      entitas: entitas,
      id_referensi: idRef || '',
      keterangan: String(ket || '').substring(0, 300),
      status: status || 'SUKSES'
    };
    appendObjects_(SHEET.LOG, [o]);
  } catch (e) {
    console.error('Gagal mencatat log: ' + (e && e.message ? e.message : e));
  }
}

/* ---------- Inisialisasi (dijalankan manual dari editor Apps Script) ---------- */

function initDatabase() {
  var ss = getSpreadsheet_();
  var report = [];
  Object.keys(HEADERS).forEach(function (name) {
    var H = HEADERS[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      report.push('Sheet dibuat: ' + name);
    }
    var first = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, H.length).getValues()[0] : [];
    var empty = first.every(function (c) { return c === '' || c === null || c === undefined; });
    if (empty) {
      sh.getRange(1, 1, 1, H.length).setValues([H]);
      report.push('Header ditulis: ' + name);
    } else {
      var same = H.every(function (h, i) { return String(first[i]).trim() === h; });
      if (!same) report.push('PERINGATAN: header ' + name + ' tidak sesuai. Perbaiki secara manual.');
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, H.length).setFontWeight('bold').setBackground('#1e6b45').setFontColor('#ffffff');
    H.forEach(function (h, i) {
      var fmt = NUMERIC_COLUMNS.indexOf(h) >= 0 ? '0.00' : '@';
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(fmt);
    });
  });
  _sheetMemo = {};

  // Konfigurasi bawaan (hanya kunci yang belum ada)
  var cfg = readTable_(SHEET.KONF);
  var have = {};
  cfg.rows.forEach(function (r) { have[r.kunci] = true; });
  var add = [];
  DEFAULT_CONFIG.forEach(function (d) {
    if (!have[d[0]]) add.push({ kunci: d[0], nilai: d[1], keterangan: d[2] });
  });
  if (add.length) {
    appendObjects_(SHEET.KONF, add);
    report.push('Konfigurasi bawaan ditambahkan: ' + add.length);
  }

  // Administrator awal
  var adminEmail = (getProp_('ADMIN_EMAIL') || '').trim().toLowerCase();
  if (!adminEmail) {
    try { adminEmail = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { adminEmail = ''; }
  }
  if (isValidEmail_(adminEmail)) {
    var users = readTable_(SHEET.USER);
    var exists = users.rows.some(function (u) { return String(u.email).toLowerCase() === adminEmail; });
    if (!exists) {
      appendObjects_(SHEET.USER, [{
        user_id: 'USR-0001', nama_pengguna: 'Administrator', email: adminEmail,
        role: ROLE.ADMIN, status_akun: STATUS.AKTIF, created_at: nowIso_(), last_login: ''
      }]);
      report.push('Administrator awal dibuat: ' + adminEmail);
    }
  } else {
    report.push('PERINGATAN: ADMIN_EMAIL belum diatur. Tambahkan administrator manual di sheet PENGGUNA.');
  }
  bumpCache_();
  report.push('initDatabase selesai.');
  Logger.log(report.join('\n'));
  return report;
}

/** Uji koneksi dari editor Apps Script. */
function testKoneksi() {
  var out = [];
  var ss = getSpreadsheet_();
  out.push('Spreadsheet: ' + ss.getName());
  Object.keys(HEADERS).forEach(function (name) {
    var t = readTable_(name);
    out.push(name + ': ' + t.rows.length + ' baris data');
  });
  out.push('GOOGLE_CLIENT_ID: ' + (getProp_('GOOGLE_CLIENT_ID') ? 'terisi' : 'BELUM DIISI'));
  Logger.log(out.join('\n'));
  return out;
}

/* ===== GeometryService.gs ===== */
/**
 * SIPETA PAGER - GeometryService.gs
 * Validasi GeoJSON, perhitungan luas/keliling (WGS84), penyimpanan geometri bidang,
 * impor GeoJSON, dan pengelolaan batas wilayah.
 *
 * Luas dihitung dengan rumus bola (R = 6378137 m), sama dengan Turf.js,
 * dan disebut "Luas hasil pemetaan" - BUKAN hasil pengukuran kadastral resmi.
 */

var EARTH_R = 6378137;
var IDN_BOUNDS = { minLon: 90, maxLon: 145, minLat: -12, maxLat: 8 };

function rad_(d) { return d * Math.PI / 180; }

function extractGeometry_(g) {
  if (!isPlainObject_(g)) return null;
  if (g.type === 'Feature') return isPlainObject_(g.geometry) ? g.geometry : null;
  return g;
}

/** Normalisasi satu ring. Mengembalikan {ring, errors}. */
function normalizeRing_(ring, label) {
  var errors = [];
  if (!Array.isArray(ring)) return { ring: null, errors: [label + ': ring harus berupa daftar koordinat.'] };
  if (ring.length > LIMITS.MAX_RING_POINTS) return { ring: null, errors: [label + ': jumlah titik melebihi ' + LIMITS.MAX_RING_POINTS + '.'] };
  var out = [];
  for (var i = 0; i < ring.length; i++) {
    var p = ring[i];
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) {
      return { ring: null, errors: [label + ': titik ke-' + (i + 1) + ' bukan koordinat [bujur, lintang] yang valid.'] };
    }
    var lon = p[0], lat = p[1];
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { ring: null, errors: [label + ': koordinat di luar rentang valid (bujur -180..180, lintang -90..90).'] };
    }
    if (lon < IDN_BOUNDS.minLon || lon > IDN_BOUNDS.maxLon || lat < IDN_BOUNDS.minLat || lat > IDN_BOUNDS.maxLat) {
      return { ring: null, errors: [label + ': koordinat berada di luar wilayah Indonesia. GeoJSON memakai urutan [bujur, lintang]; periksa apakah urutannya tertukar atau bukan WGS84.'] };
    }
    var pt = [round_(lon, 7), round_(lat, 7)];
    var prev = out[out.length - 1];
    if (prev && prev[0] === pt[0] && prev[1] === pt[1]) continue;
    out.push(pt);
  }
  if (out.length >= 2 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push([out[0][0], out[0][1]]);
  }
  if (out.length < 4) return { ring: null, errors: [label + ': poligon minimal memiliki 3 titik berbeda.'] };
  if (Math.abs(ringArea_(out)) < 0.01) return { ring: null, errors: [label + ': luas poligon nol (titik segaris).'] };
  if (out.length <= LIMITS.SELFCHECK_POINTS && ringSelfIntersects_(out)) {
    return { ring: null, errors: [label + ': garis poligon saling berpotongan atau menyentuh diri sendiri.'] };
  }
  return { ring: out, errors: errors };
}

function orient_(a, b, c) {
  var v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return v > 0 ? 1 : (v < 0 ? -1 : 0);
}

function onSeg_(a, b, c) {
  return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) &&
         Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
}

function segIntersect_(p1, p2, p3, p4) {
  var o1 = orient_(p1, p2, p3), o2 = orient_(p1, p2, p4), o3 = orient_(p3, p4, p1), o4 = orient_(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg_(p1, p2, p3)) return true;
  if (o2 === 0 && onSeg_(p1, p2, p4)) return true;
  if (o3 === 0 && onSeg_(p3, p4, p1)) return true;
  if (o4 === 0 && onSeg_(p3, p4, p2)) return true;
  return false;
}

function ringSelfIntersects_(ring) {
  var n = ring.length - 1; // jumlah segmen
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      if (segIntersect_(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

/** Normalisasi & validasi Polygon/MultiPolygon. Mengembalikan {geometry, errors}. */
function normalizePolygonGeometry_(input) {
  var g = extractGeometry_(input);
  if (!g || typeof g.type !== 'string') return { geometry: null, errors: ['Geometri tidak ditemukan dalam GeoJSON.'] };
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
    return { geometry: null, errors: ['Tipe geometri harus Polygon atau MultiPolygon (diterima: ' + String(g.type).substring(0, 30) + ').'] };
  }
  var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!Array.isArray(polys) || !polys.length) return { geometry: null, errors: ['Koordinat geometri kosong.'] };
  if (polys.length > LIMITS.MAX_POLYGONS) return { geometry: null, errors: ['Jumlah poligon melebihi ' + LIMITS.MAX_POLYGONS + '.'] };
  var outPolys = [], errors = [];
  for (var pi = 0; pi < polys.length; pi++) {
    var rings = polys[pi];
    if (!Array.isArray(rings) || !rings.length) { errors.push('Poligon ke-' + (pi + 1) + ' kosong.'); continue; }
    var outRings = [];
    for (var ri = 0; ri < rings.length; ri++) {
      var label = 'Poligon ' + (pi + 1) + (ri === 0 ? ' (batas luar)' : ' (lubang ' + ri + ')');
      var r = normalizeRing_(rings[ri], label);
      if (r.errors.length) { errors = errors.concat(r.errors); break; }
      outRings.push(r.ring);
    }
    if (outRings.length === rings.length) outPolys.push(outRings);
    if (errors.length >= 5) break;
  }
  if (errors.length) return { geometry: null, errors: errors };
  var geometry = g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: outPolys[0] }
    : { type: 'MultiPolygon', coordinates: outPolys };
  return { geometry: geometry, errors: [] };
}

function ringArea_(ring) {
  var sum = 0;
  for (var i = 0; i < ring.length - 1; i++) {
    var p1 = ring[i], p2 = ring[i + 1];
    sum += rad_(p2[0] - p1[0]) * (2 + Math.sin(rad_(p1[1])) + Math.sin(rad_(p2[1])));
  }
  return Math.abs(sum * EARTH_R * EARTH_R / 2);
}

function polygonArea_(rings) {
  var a = ringArea_(rings[0]);
  for (var i = 1; i < rings.length; i++) a -= ringArea_(rings[i]);
  return Math.max(a, 0);
}

function haversine_(a, b) {
  var dLat = rad_(b[1] - a[1]), dLon = rad_(b[0] - a[0]);
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(rad_(a[1])) * Math.cos(rad_(b[1])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function ringLength_(ring) {
  var s = 0;
  for (var i = 0; i < ring.length - 1; i++) s += haversine_(ring[i], ring[i + 1]);
  return s;
}

function geometryMetrics_(geometry) {
  var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  var area = 0, perim = 0, pts = 0;
  polys.forEach(function (rings) {
    area += polygonArea_(rings);
    rings.forEach(function (r) { perim += ringLength_(r); pts += r.length - 1; });
  });
  return { luas_m2: round_(area, 2), luas_ha: round_(area / 10000, 4), keliling_m: round_(perim, 2), jumlah_titik: pts };
}

/* ---------- Penyimpanan geometri bidang ---------- */

function parseGeometryJson_(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

function geometryRowToObj_(row) {
  return {
    geojson: parseGeometryJson_(row.geojson),
    sumber_geometri: row.sumber_geometri,
    tanggal_pemetaan: row.tanggal_pemetaan,
    petugas_pemetaan: row.petugas_pemetaan,
    status_verifikasi_geometri: row.status_verifikasi_geometri,
    keterangan_geometri: row.keterangan_geometri,
    updated_at: row.updated_at
  };
}

function validGeomVerif_(v) {
  return v === STATUS.DIVERIFIKASI || v === STATUS.BELUM_DIVERIFIKASI;
}

function saveGeometry_(ctx, params) {
  var id = checkLandId_(params && params.id_bidang);
  var norm = normalizePolygonGeometry_(params.geojson);
  if (norm.errors.length) throw new AppError('INVALID_GEOJSON', 'GeoJSON tidak valid.', 400, norm.errors);
  var text = JSON.stringify(norm.geometry);
  if (text.length > LIMITS.GEOJSON_CHARS) {
    throw new AppError('INVALID_GEOJSON', 'Geometri terlalu besar untuk satu sel spreadsheet (' + text.length + ' karakter, batas ' + LIMITS.GEOJSON_CHARS + '). Sederhanakan jumlah titik.', 400);
  }
  var sumber = cleanText_(params.sumber_geometri) || 'Digitasi layar';
  var ket = cleanText_(params.keterangan_geometri);
  if (sumber.length > 100) throw new AppError('VALIDATION_ERROR', 'Sumber geometri maksimal 100 karakter.', 400);
  if (ket.length > 500) throw new AppError('VALIDATION_ERROR', 'Keterangan geometri maksimal 500 karakter.', 400);
  var metrics = geometryMetrics_(norm.geometry);
  return withLock_(function () {
    var lands = readTable_(SHEET.BIDANG);
    var land = findLandRow_(lands.rows, id);
    if (!land || land.status_arsip === STATUS.ARSIP) throw new AppError('NOT_FOUND', 'Bidang tanah tidak ditemukan atau sudah diarsipkan.', 404);
    var g = readTable_(SHEET.GEOM);
    var now = nowIso_();
    var existing = null;
    for (var i = 0; i < g.rows.length; i++) if (g.rows[i].id_bidang === id) { existing = g.rows[i]; break; }
    var obj = existing || { id_bidang: id };
    obj.geojson = text;
    obj.sumber_geometri = sumber;
    obj.tanggal_pemetaan = todayDate_();
    obj.petugas_pemetaan = ctx.user.nama;
    obj.keterangan_geometri = ket;
    var setVerif = ctx.role === ROLE.ADMIN && validGeomVerif_(params.status_verifikasi_geometri);
    obj.status_verifikasi_geometri = setVerif ? params.status_verifikasi_geometri : STATUS.BELUM_DIVERIFIKASI;
    obj.updated_at = now;
    if (existing) updateObject_(SHEET.GEOM, obj); else appendObjects_(SHEET.GEOM, [obj]);
    land.luas_peta_m2 = metrics.luas_m2;
    land.status_pemetaan = STATUS.DIPETAKAN;
    land.updated_at = now;
    updateObject_(SHEET.BIDANG, land);
    logActivity_(ctx, existing ? 'UBAH_GEOMETRI' : 'TAMBAH_GEOMETRI', 'GEOMETRI', id,
      'Sumber: ' + sumber + '; luas peta ' + metrics.luas_m2 + ' m2');
    bumpCache_();
    return { id_bidang: id, metrics: metrics, land_updated_at: now, geometry: geometryRowToObj_(obj) };
  });
}

/** Impor FeatureCollection. Setiap Feature wajib punya properties.id_bidang yang sudah ada. */
function importGeoJSON_(ctx, params) {
  var fc = params && params.featureCollection;
  var mode = params && params.mode === 'commit' ? 'commit' : 'preview';
  if (!isPlainObject_(fc) || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    throw new AppError('INVALID_GEOJSON', 'File harus berupa GeoJSON FeatureCollection.', 400);
  }
  if (!fc.features.length) throw new AppError('INVALID_GEOJSON', 'FeatureCollection tidak berisi fitur.', 400);
  if (fc.features.length > LIMITS.IMPORT_GEO_FEATURES) {
    throw new AppError('LIMIT_EXCEEDED', 'Maksimal ' + LIMITS.IMPORT_GEO_FEATURES + ' fitur per permintaan.', 400);
  }
  var sumber = cleanText_(params.sumber_geometri) || 'Impor GeoJSON';
  if (sumber.length > 100) throw new AppError('VALIDATION_ERROR', 'Sumber geometri maksimal 100 karakter.', 400);
  var lands = readTable_(SHEET.BIDANG);
  var byId = {};
  lands.rows.forEach(function (r) { byId[r.id_bidang] = r; });
  var report = { total: fc.features.length, valid: 0, invalid: 0, errors: [], items: [] };
  var good = [];
  var seen = {};
  fc.features.forEach(function (f, idx) {
    var id = f && f.properties && typeof f.properties.id_bidang === 'string' ? f.properties.id_bidang.trim() : '';
    function bad(msg) {
      report.invalid++;
      report.errors.push({ index: idx + 1, id_bidang: id, message: msg });
    }
    if (!id || !/^PGR-\d{6,}$/.test(id)) return bad('properties.id_bidang tidak ada atau formatnya salah.');
    if (seen[id]) return bad('ID muncul lebih dari sekali dalam file.');
    seen[id] = true;
    var land = byId[id];
    if (!land || land.status_arsip === STATUS.ARSIP) return bad('ID bidang tidak ditemukan di database.');
    var norm = normalizePolygonGeometry_(f);
    if (norm.errors.length) return bad(norm.errors[0]);
    var text = JSON.stringify(norm.geometry);
    if (text.length > LIMITS.GEOJSON_CHARS) return bad('Geometri terlalu besar (' + text.length + ' karakter).');
    var m = geometryMetrics_(norm.geometry);
    good.push({ id: id, text: text, metrics: m });
    report.valid++;
    report.items.push({ id_bidang: id, luas_m2: m.luas_m2, keliling_m: m.keliling_m });
  });
  report.mode = mode;
  report.saved = 0;
  if (mode === 'preview' || !good.length) return report;

  return withLock_(function () {
    var landsT = readTable_(SHEET.BIDANG);
    var geoT = readTable_(SHEET.GEOM);
    var geoById = {};
    geoT.rows.forEach(function (r) { geoById[r.id_bidang] = r; });
    var landById = {};
    landsT.rows.forEach(function (r) { landById[r.id_bidang] = r; });
    var now = nowIso_();
    var today = todayDate_();
    good.forEach(function (it) {
      var land = landById[it.id];
      if (!land || land.status_arsip === STATUS.ARSIP) return;
      var o = geoById[it.id];
      if (!o) { o = { id_bidang: it.id }; geoT.rows.push(o); geoById[it.id] = o; }
      o.geojson = it.text;
      o.sumber_geometri = sumber;
      o.tanggal_pemetaan = today;
      o.petugas_pemetaan = ctx.user.nama;
      o.status_verifikasi_geometri = STATUS.BELUM_DIVERIFIKASI;
      o.keterangan_geometri = '';
      o.updated_at = now;
      land.luas_peta_m2 = it.metrics.luas_m2;
      land.status_pemetaan = STATUS.DIPETAKAN;
      land.updated_at = now;
      report.saved++;
    });
    rewriteTable_(SHEET.GEOM, geoT.rows);
    rewriteTable_(SHEET.BIDANG, landsT.rows);
    logActivity_(ctx, 'IMPOR_GEOJSON', 'GEOMETRI', '', report.saved + ' geometri disimpan, ' + report.invalid + ' ditolak');
    bumpCache_();
    return report;
  });
}

/* ---------- Data peta ringan (tanpa data pribadi) ---------- */

function getPublicMapData_(ctx) {
  var cfg = getConfig_();
  if (!ctx.authenticated && !cfgBool_(cfg, 'PETA_PUBLIK_AKTIF')) {
    return { type: 'FeatureCollection', features: [], restricted: true, truncated: false,
      message: 'Peta bidang tanah untuk umum dinonaktifkan. Masuk sebagai petugas untuk melihat poligon bidang.' };
  }
  var key = 'map_' + cacheVer_() + (ctx.authenticated ? '_a' : '_p');
  var cached = cacheGet_(key);
  if (cached) return JSON.parse(cached);
  var lands = readTable_(SHEET.BIDANG);
  var geo = readTable_(SHEET.GEOM);
  var landById = {};
  lands.rows.forEach(function (r) { if (r.status_arsip !== STATUS.ARSIP) landById[r.id_bidang] = r; });
  var features = [], truncated = false;
  for (var i = 0; i < geo.rows.length; i++) {
    var gr = geo.rows[i];
    var land = landById[gr.id_bidang];
    if (!land) continue;
    var geom = parseGeometryJson_(gr.geojson);
    if (!geom) continue;
    if (features.length >= LIMITS.MAP_FEATURES) { truncated = true; break; }
    var props = {
      id_bidang: land.id_bidang,
      jenis_surat: land.jenis_surat,
      status_inventarisasi: land.status_inventarisasi,
      status_verifikasi: land.status_verifikasi,
      status_pemetaan: land.status_pemetaan
    };
    if (ctx.authenticated) { props.rt = land.rt; props.rw = land.rw; }
    features.push({ type: 'Feature', id: land.id_bidang, properties: props, geometry: geom });
  }
  var out = { type: 'FeatureCollection', features: features, restricted: false, truncated: truncated, generated_at: nowIso_() };
  cachePut_(key, JSON.stringify(out), 300);
  return out;
}

/* ---------- Batas wilayah ---------- */

function boundaryRowToObj_(r) {
  return {
    id_batas: r.id_batas, nama_wilayah: r.nama_wilayah, tingkat_administrasi: r.tingkat_administrasi,
    geojson: parseGeometryJson_(r.geojson), sumber_data: r.sumber_data, tanggal_data: r.tanggal_data,
    status_verifikasi: r.status_verifikasi, keterangan: r.keterangan
  };
}

function getBoundary_(ctx) {
  var t = readTable_(SHEET.BATAS);
  var rows = t.rows.filter(function (r) { return r.tingkat_administrasi === 'KELURAHAN'; });
  if (!ctx.authenticated) rows = rows.filter(function (r) { return r.status_verifikasi === STATUS.DIVERIFIKASI; });
  if (!rows.length) {
    return { boundary: null, message: ctx.authenticated
      ? 'Batas wilayah Kelurahan Pager belum diimpor. Administrator perlu mengimpor GeoJSON batas resmi.'
      : 'Batas wilayah resmi belum tersedia atau belum diverifikasi.' };
  }
  var b = boundaryRowToObj_(rows[rows.length - 1]);
  return { boundary: b, message: null };
}

function importBoundary_(ctx, params) {
  var norm = normalizePolygonGeometry_(params && params.geojson);
  if (norm.errors.length) throw new AppError('INVALID_GEOJSON', 'GeoJSON batas wilayah tidak valid.', 400, norm.errors);
  var text = JSON.stringify(norm.geometry);
  if (text.length > LIMITS.GEOJSON_CHARS) {
    throw new AppError('INVALID_GEOJSON', 'Geometri batas terlalu besar (' + text.length + ' karakter, batas ' + LIMITS.GEOJSON_CHARS + '). Sederhanakan garis batas (mis. dengan mapshaper.org) lalu impor ulang.', 400);
  }
  var nama = cleanText_(params.nama_wilayah) || 'Kelurahan Pager';
  var sumber = cleanText_(params.sumber_data);
  var ket = cleanText_(params.keterangan);
  var tgl = cleanText_(params.tanggal_data);
  if (nama.length > 100 || sumber.length > 200 || ket.length > 500) {
    throw new AppError('VALIDATION_ERROR', 'Nama (maks 100), sumber (maks 200), atau keterangan (maks 500) terlalu panjang.', 400);
  }
  if (!sumber) throw new AppError('VALIDATION_ERROR', 'Sumber data batas wilayah wajib diisi.', 400);
  if (tgl && !isValidDate_(tgl)) throw new AppError('VALIDATION_ERROR', 'Tanggal data harus berformat YYYY-MM-DD.', 400);
  var status = params.status_verifikasi === STATUS.DIVERIFIKASI ? STATUS.DIVERIFIKASI : STATUS.BELUM_DIVERIFIKASI;
  return withLock_(function () {
    var t = readTable_(SHEET.BATAS);
    var existing = null;
    t.rows.forEach(function (r) { if (r.tingkat_administrasi === 'KELURAHAN') existing = r; });
    var obj = existing || { id_batas: 'BTS-' + pad_(t.rows.length + 1, 4), tingkat_administrasi: 'KELURAHAN' };
    obj.nama_wilayah = nama;
    obj.geojson = text;
    obj.sumber_data = sumber;
    obj.tanggal_data = tgl || todayDate_();
    obj.status_verifikasi = status;
    obj.keterangan = ket;
    if (existing) updateObject_(SHEET.BATAS, obj); else appendObjects_(SHEET.BATAS, [obj]);
    logActivity_(ctx, 'IMPOR_BATAS', 'BATAS', obj.id_batas, 'Batas wilayah diimpor; status ' + status);
    bumpCache_();
    return { id_batas: obj.id_batas, status_verifikasi: status, metrics: geometryMetrics_(norm.geometry) };
  });
}

function setBoundaryStatus_(ctx, params) {
  var status = params && params.status_verifikasi;
  if (status !== STATUS.DIVERIFIKASI && status !== STATUS.BELUM_DIVERIFIKASI) {
    throw new AppError('VALIDATION_ERROR', 'Status verifikasi tidak valid.', 400);
  }
  return withLock_(function () {
    var t = readTable_(SHEET.BATAS);
    var row = null;
    t.rows.forEach(function (r) { if (r.id_batas === params.id_batas) row = r; });
    if (!row) throw new AppError('NOT_FOUND', 'Batas wilayah tidak ditemukan.', 404);
    row.status_verifikasi = status;
    updateObject_(SHEET.BATAS, row);
    logActivity_(ctx, 'UBAH_VERIFIKASI', 'BATAS', row.id_batas, 'Status batas: ' + status);
    bumpCache_();
    return { id_batas: row.id_batas, status_verifikasi: status };
  });
}

/* ===== LandService.gs ===== */
/**
 * SIPETA PAGER - LandService.gs
 * CRUD bidang tanah, pencarian, statistik, laporan, impor/ekspor CSV, riwayat.
 * Semua pemeriksaan hak akses dan validasi dilakukan di sini (backend).
 */

var LAND_INPUT_FIELDS = [
  'nomor_surat', 'jenis_surat', 'nama_pemilik', 'nik', 'alamat_pemilik', 'alamat_objek',
  'kelurahan', 'kecamatan', 'kota', 'rt', 'rw', 'panjang_meter', 'lebar_meter',
  'luas_dokumen_m2', 'tanggal_surat', 'tanggal_pendataan', 'penggunaan_tanah',
  'nomor_persil', 'nomor_peta_bidang', 'keterangan', 'sumber_data'
];
var LAND_TEXT_MAX = {
  nomor_surat: 100, nama_pemilik: 150, alamat_pemilik: 300, alamat_objek: 300,
  kelurahan: 80, kecamatan: 80, kota: 80, penggunaan_tanah: 100, nomor_persil: 60,
  nomor_peta_bidang: 60, keterangan: 1000, sumber_data: 200
};
var LAND_NUM_MAX = { panjang_meter: 100000, lebar_meter: 100000, luas_dokumen_m2: 1000000000 };
var LAND_DATE_FIELDS = ['tanggal_surat', 'tanggal_pendataan'];
var LAND_REQUIRED = ['jenis_surat', 'nama_pemilik'];
var COMPLETENESS_FIELDS = ['nomor_surat', 'jenis_surat', 'nama_pemilik', 'nik', 'alamat_objek', 'rt', 'rw', 'luas_dokumen_m2', 'tanggal_surat'];
var PUBLIC_LAND_FIELDS = ['id_bidang', 'jenis_surat', 'status_inventarisasi', 'status_verifikasi', 'status_pemetaan'];
var LAND_LABELS = {
  nomor_surat: 'Nomor surat', jenis_surat: 'Jenis surat', nama_pemilik: 'Nama pemilik', nik: 'NIK',
  alamat_pemilik: 'Alamat pemilik', alamat_objek: 'Alamat objek', rt: 'RT', rw: 'RW',
  panjang_meter: 'Panjang', lebar_meter: 'Lebar', luas_dokumen_m2: 'Luas dokumen',
  tanggal_surat: 'Tanggal surat', tanggal_pendataan: 'Tanggal pendataan'
};

/* ---------- Validasi ---------- */

function checkLandId_(id) {
  if (typeof id !== 'string' || !/^PGR-\d{6,}$/.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'ID bidang tidak valid.', 400);
  }
  return id;
}

function findLandRow_(rows, id) {
  for (var i = 0; i < rows.length; i++) if (rows[i].id_bidang === id) return rows[i];
  return null;
}

function isValidDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  var y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2100) return false;
  var dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Memvalidasi masukan bidang. opts.partial = true untuk pembaruan.
 * Mengembalikan {clean, errors}. Field di luar daftar diabaikan (tidak dapat disuntikkan).
 */
function validateLandInput_(input, cfg, opts) {
  var partial = !!(opts && opts.partial);
  var clean = {}, errors = [];
  if (!isPlainObject_(input)) return { clean: clean, errors: ['Data bidang tidak dikirim.'] };
  var jenisOk = cfgJenis_(cfg);
  LAND_INPUT_FIELDS.forEach(function (f) {
    var present = Object.prototype.hasOwnProperty.call(input, f);
    if (!present) {
      if (!partial && LAND_REQUIRED.indexOf(f) >= 0) errors.push(LAND_LABELS[f] + ' wajib diisi.');
      return;
    }
    var raw = input[f];
    if (raw !== null && raw !== undefined && typeof raw === 'object') { errors.push((LAND_LABELS[f] || f) + ' tidak valid.'); return; }
    if (LAND_NUM_MAX[f] !== undefined) {
      var n = toNum_(raw);
      if (n !== null && isNaN(n)) { errors.push(LAND_LABELS[f] + ' harus berupa angka.'); return; }
      if (n !== null && (n < 0 || n > LAND_NUM_MAX[f])) { errors.push(LAND_LABELS[f] + ' di luar rentang yang diizinkan.'); return; }
      clean[f] = n === null ? null : round_(n, 2);
      return;
    }
    var s = cleanText_(raw);
    if (LAND_REQUIRED.indexOf(f) >= 0 && s === '') { errors.push(LAND_LABELS[f] + ' wajib diisi.'); return; }
    if (f === 'jenis_surat') {
      s = s.toUpperCase();
      if (jenisOk.indexOf(s) < 0) { errors.push('Jenis surat harus salah satu dari: ' + jenisOk.join(', ') + '.'); return; }
    } else if (f === 'nik') {
      s = s.replace(/[\s.-]/g, '');
      if (s !== '' && !/^\d{16}$/.test(s)) { errors.push('NIK harus 16 digit angka.'); return; }
    } else if (f === 'rt' || f === 'rw') {
      if (s !== '') {
        if (!/^\d{1,3}$/.test(s)) { errors.push(f.toUpperCase() + ' harus berupa angka (maksimal 3 digit).'); return; }
        s = String(parseInt(s, 10));
      }
    } else if (LAND_DATE_FIELDS.indexOf(f) >= 0) {
      if (s !== '' && !isValidDate_(s)) { errors.push(LAND_LABELS[f] + ' harus berformat YYYY-MM-DD dan tanggal yang valid.'); return; }
    } else if (LAND_TEXT_MAX[f] !== undefined && s.length > LAND_TEXT_MAX[f]) {
      errors.push((LAND_LABELS[f] || f) + ' maksimal ' + LAND_TEXT_MAX[f] + ' karakter.');
      return;
    }
    clean[f] = s;
  });
  return { clean: clean, errors: errors };
}

function hasValue_(v) {
  return !(v === '' || v === null || v === undefined);
}

function computeCompleteness_(land) {
  for (var i = 0; i < COMPLETENESS_FIELDS.length; i++) {
    var v = land[COMPLETENESS_FIELDS[i]];
    if (!hasValue_(v)) return STATUS.BELUM_LENGKAP;
    if (COMPLETENESS_FIELDS[i] === 'luas_dokumen_m2' && !(Number(v) > 0)) return STATUS.BELUM_LENGKAP;
  }
  return STATUS.LENGKAP;
}

function findDuplicates_(rows, nomor, jenis, exceptId) {
  var n = String(nomor || '').trim().toLowerCase();
  if (!n) return [];
  var ids = [];
  rows.forEach(function (r) {
    if (r.status_arsip === STATUS.ARSIP || r.id_bidang === exceptId) return;
    if (String(r.nomor_surat).trim().toLowerCase() === n && r.jenis_surat === jenis) ids.push(r.id_bidang);
  });
  return ids;
}

/* ---------- Proyeksi data sesuai role ---------- */

function maskNik_(nik) {
  var s = String(nik || '');
  if (s.length < 8) return s ? '••••' : '';
  return s.substring(0, 4) + new Array(s.length - 7).join('•') + s.substring(s.length - 4);
}

function numOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function projectLand_(row, role) {
  var o = {};
  if (role === ROLE.PUBLIK) {
    PUBLIC_LAND_FIELDS.forEach(function (f) { o[f] = row[f]; });
    return o;
  }
  HEADERS.BIDANG_TANAH.forEach(function (h) { o[h] = row[h]; });
  ['panjang_meter', 'lebar_meter', 'luas_dokumen_m2', 'luas_peta_m2'].forEach(function (f) { o[f] = numOrNull_(row[f]); });
  if (role === ROLE.PETUGAS) {
    o.nik = maskNik_(row.nik);
    o.alamat_pemilik = null;
  }
  return o;
}

/** Item daftar: tidak pernah memuat NIK maupun alamat pemilik. */
function listItem_(row, role) {
  var o = projectLand_(row, role);
  delete o.nik;
  delete o.alamat_pemilik;
  return o;
}

/* ---------- Buat / ubah / arsip ---------- */

function buildNewLand_(clean, id, ctx, cfg) {
  var now = nowIso_();
  var land = { id_bidang: id };
  LAND_INPUT_FIELDS.forEach(function (f) { land[f] = clean[f] === undefined ? '' : clean[f]; });
  land.kelurahan = land.kelurahan || APP.KELURAHAN;
  land.kecamatan = land.kecamatan || APP.KECAMATAN;
  land.kota = land.kota || APP.KOTA;
  land.tanggal_pendataan = land.tanggal_pendataan || todayDate_();
  land.luas_peta_m2 = '';
  land.status_inventarisasi = computeCompleteness_(land);
  land.status_verifikasi = STATUS.BELUM_DIVERIFIKASI;
  land.status_pemetaan = STATUS.BELUM_DIPETAKAN;
  land.petugas_pendata = ctx.user.nama;
  land.created_at = now;
  land.updated_at = now;
  land.status_arsip = STATUS.AKTIF;
  return land;
}

function createLand_(ctx, params) {
  var cfg = getConfig_();
  var v = validateLandInput_(params && params.land, cfg, { partial: false });
  if (v.errors.length) throw new AppError('VALIDATION_ERROR', 'Data bidang tidak valid.', 400, v.errors);
  return withLock_(function () {
    var t = readTable_(SHEET.BIDANG);
    var dup = findDuplicates_(t.rows, v.clean.nomor_surat, v.clean.jenis_surat, null);
    if (dup.length && !(params && params.abaikan_duplikat === true)) {
      throw new AppError('DUPLICATE', 'Nomor surat yang sama sudah tercatat pada bidang ' + dup.join(', ') + '.', 409, { id_bidang: dup });
    }
    var id = allocateIds_(1, t.rows)[0];
    var land = buildNewLand_(v.clean, id, ctx, cfg);
    appendObjects_(SHEET.BIDANG, [land]);
    logActivity_(ctx, 'TAMBAH', 'BIDANG', id, 'Bidang tanah baru dibuat');
    bumpCache_();
    return { land: projectLand_(land, ctx.role) };
  });
}

function updateLand_(ctx, params) {
  var id = checkLandId_(params && params.id_bidang);
  var cfg = getConfig_();
  var expected = params.expected_updated_at;
  if (typeof expected !== 'string' || !expected) {
    throw new AppError('VALIDATION_ERROR', 'Versi data (expected_updated_at) wajib dikirim untuk mencegah konflik pembaruan.', 400);
  }
  var input = isPlainObject_(params.land) ? JSON.parse(JSON.stringify(params.land)) : null;
  if (!input) throw new AppError('VALIDATION_ERROR', 'Data bidang tidak dikirim.', 400);
  var newVerif = null;
  if (Object.prototype.hasOwnProperty.call(input, 'status_verifikasi')) {
    if (ctx.role === ROLE.ADMIN) {
      if (!validGeomVerif_(input.status_verifikasi)) throw new AppError('VALIDATION_ERROR', 'Status verifikasi tidak valid.', 400);
      newVerif = input.status_verifikasi;
    }
    delete input.status_verifikasi;
  }
  if (ctx.role !== ROLE.ADMIN) {
    ['nik', 'alamat_pemilik'].forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(input, f)) {
        var s = cleanText_(input[f]);
        if (s === '' || /[•*]/.test(s)) delete input[f];   // petugas tidak melihat nilai asli; kosong = tidak diubah
      }
    });
  }
  var v = validateLandInput_(input, cfg, { partial: true });
  if (v.errors.length) throw new AppError('VALIDATION_ERROR', 'Data bidang tidak valid.', 400, v.errors);
  return withLock_(function () {
    var t = readTable_(SHEET.BIDANG);
    var land = findLandRow_(t.rows, id);
    if (!land) throw new AppError('NOT_FOUND', 'Bidang tanah tidak ditemukan.', 404);
    if (land.status_arsip === STATUS.ARSIP) throw new AppError('ARCHIVED', 'Bidang ini sudah diarsipkan. Pulihkan terlebih dahulu sebelum mengubah.', 409);
    if (land.updated_at !== expected) {
      throw new AppError('CONFLICT', 'Data telah diubah oleh pengguna lain. Muat ulang data lalu ulangi perubahan Anda.', 409, { current_updated_at: land.updated_at });
    }
    var changed = [];
    Object.keys(v.clean).forEach(function (f) {
      var oldV = land[f], newV = v.clean[f];
      var same = NUMERIC_COLUMNS.indexOf(f) >= 0 ? numOrNull_(oldV) === numOrNull_(newV) : String(oldV === undefined || oldV === null ? '' : oldV) === String(newV === null ? '' : newV);
      if (!same) changed.push(f);
    });
    var nomor = changed.indexOf('nomor_surat') >= 0 || changed.indexOf('jenis_surat') >= 0;
    if (nomor && !(params.abaikan_duplikat === true)) {
      var merged = { nomor_surat: v.clean.nomor_surat !== undefined ? v.clean.nomor_surat : land.nomor_surat, jenis_surat: v.clean.jenis_surat !== undefined ? v.clean.jenis_surat : land.jenis_surat };
      var dup = findDuplicates_(t.rows, merged.nomor_surat, merged.jenis_surat, id);
      if (dup.length) throw new AppError('DUPLICATE', 'Nomor surat yang sama sudah tercatat pada bidang ' + dup.join(', ') + '.', 409, { id_bidang: dup });
    }
    var verifChanged = newVerif !== null && newVerif !== land.status_verifikasi;
    if (!changed.length && !verifChanged) return { land: projectLand_(land, ctx.role), changed: [], unchanged: true };
    changed.forEach(function (f) { land[f] = v.clean[f] === null ? '' : v.clean[f]; });
    var resetNote = '';
    if (ctx.role !== ROLE.ADMIN && land.status_verifikasi === STATUS.DIVERIFIKASI && changed.some(function (f) { return f !== 'keterangan'; })) {
      land.status_verifikasi = STATUS.BELUM_DIVERIFIKASI;
      resetNote = ' (verifikasi direset karena data diubah petugas)';
    }
    if (verifChanged) land.status_verifikasi = newVerif;
    land.status_inventarisasi = computeCompleteness_(land);
    land.updated_at = nowIso_();
    updateObject_(SHEET.BIDANG, land);
    if (changed.length) logActivity_(ctx, 'UBAH', 'BIDANG', id, 'Field diubah: ' + changed.join(', ') + resetNote);
    if (verifChanged) logActivity_(ctx, 'UBAH_VERIFIKASI', 'BIDANG', id, 'Status verifikasi: ' + newVerif);
    bumpCache_();
    return { land: projectLand_(land, ctx.role), changed: changed, verifikasi_direset: !!resetNote };
  });
}

function setArchive_(ctx, params, archive) {
  var id = checkLandId_(params && params.id_bidang);
  var alasan = cleanText_(params && params.alasan);
  if (alasan.length > 200) throw new AppError('VALIDATION_ERROR', 'Alasan maksimal 200 karakter.', 400);
  return withLock_(function () {
    var t = readTable_(SHEET.BIDANG);
    var land = findLandRow_(t.rows, id);
    if (!land) throw new AppError('NOT_FOUND', 'Bidang tanah tidak ditemukan.', 404);
    var isArch = land.status_arsip === STATUS.ARSIP;
    if (archive && isArch) throw new AppError('CONFLICT', 'Bidang sudah diarsipkan.', 409);
    if (!archive && !isArch) throw new AppError('CONFLICT', 'Bidang tidak dalam keadaan diarsipkan.', 409);
    land.status_arsip = archive ? STATUS.ARSIP : STATUS.AKTIF;
    land.updated_at = nowIso_();
    updateObject_(SHEET.BIDANG, land);
    logActivity_(ctx, archive ? 'ARSIP' : 'PULIHKAN', 'BIDANG', id, alasan ? 'Alasan: ' + alasan : '');
    bumpCache_();
    return { id_bidang: id, status_arsip: land.status_arsip, updated_at: land.updated_at };
  });
}

function archiveLand_(ctx, params) { return setArchive_(ctx, params, true); }
function restoreLand_(ctx, params) { return setArchive_(ctx, params, false); }

/* ---------- Detail ---------- */

function getLandDetail_(ctx, params) {
  var id = checkLandId_(params && params.id_bidang);
  var t = readTable_(SHEET.BIDANG);
  var land = findLandRow_(t.rows, id);
  if (!land || (land.status_arsip === STATUS.ARSIP && ctx.role !== ROLE.ADMIN)) {
    throw new AppError('NOT_FOUND', 'Bidang tanah tidak ditemukan.', 404);
  }
  if (ctx.role === ROLE.PUBLIK) {
    var cfg = getConfig_();
    if (!cfgBool_(cfg, 'PETA_PUBLIK_AKTIF')) throw new AppError('UNAUTHENTICATED', 'Masuk terlebih dahulu untuk melihat detail bidang.', 401);
    return { land: projectLand_(land, ROLE.PUBLIK), geometry: null, metrics: null, perbandingan_luas: null };
  }
  var out = { land: projectLand_(land, ctx.role), geometry: null, metrics: null, perbandingan_luas: null };
  var g = readTable_(SHEET.GEOM);
  for (var i = 0; i < g.rows.length; i++) {
    if (g.rows[i].id_bidang === id) {
      out.geometry = geometryRowToObj_(g.rows[i]);
      if (out.geometry.geojson) out.metrics = geometryMetrics_(out.geometry.geojson);
      break;
    }
  }
  var d = numOrNull_(land.luas_dokumen_m2), p = numOrNull_(land.luas_peta_m2);
  if (d !== null && p !== null && d > 0) {
    out.perbandingan_luas = {
      luas_dokumen_m2: d, luas_peta_m2: p,
      selisih_m2: round_(p - d, 2), selisih_persen: round_((p - d) / d * 100, 2),
      catatan: 'Perbandingan ini adalah informasi administratif dan bukan penetapan batas atau bukti sengketa.'
    };
  }
  return out;
}

/* ---------- Pencarian & filter ---------- */

function clampPage_(params, maxSize) {
  var page = parseInt(params.page, 10);
  var size = parseInt(params.pageSize, 10);
  if (!isFinite(page) || page < 1) page = 1;
  if (!isFinite(size) || size < 1) size = 25;
  return { page: page, size: Math.min(size, maxSize) };
}

function filterLands_(rows, params, ctx) {
  var auth = ctx.role !== ROLE.PUBLIK;
  var q = cleanText_(params.q).toLowerCase();
  var tokens = q ? q.split(/\s+/).filter(function (x) { return x; }).slice(0, 6) : [];
  var fields = auth
    ? ['id_bidang', 'nomor_surat', 'jenis_surat', 'nama_pemilik', 'alamat_objek', 'rt', 'rw', 'status_inventarisasi']
    : ['id_bidang', 'jenis_surat'];
  var includeArch = ctx.role === ROLE.ADMIN && params.includeArchived === true;
  var f = {
    jenis: cleanText_(params.jenis_surat).toUpperCase(),
    inv: cleanText_(params.status_inventarisasi),
    ver: cleanText_(params.status_verifikasi),
    pet: cleanText_(params.status_pemetaan),
    rt: auth ? cleanText_(params.rt) : '',
    rw: auth ? cleanText_(params.rw) : ''
  };
  return rows.filter(function (r) {
    if (r.status_arsip === STATUS.ARSIP && !includeArch) return false;
    if (f.jenis && r.jenis_surat !== f.jenis) return false;
    if (f.inv && r.status_inventarisasi !== f.inv) return false;
    if (f.ver && r.status_verifikasi !== f.ver) return false;
    if (f.pet && r.status_pemetaan !== f.pet) return false;
    if (f.rt && String(r.rt) !== f.rt) return false;
    if (f.rw && String(r.rw) !== f.rw) return false;
    if (tokens.length) {
      var hay = fields.map(function (k) { return String(r[k] === undefined ? '' : r[k]).toLowerCase(); }).join(' | ');
      for (var i = 0; i < tokens.length; i++) if (hay.indexOf(tokens[i]) < 0) return false;
    }
    return true;
  });
}

function sortLands_(rows, params, ctx) {
  var auth = ctx.role !== ROLE.PUBLIK;
  var allowed = auth
    ? ['id_bidang', 'nomor_surat', 'jenis_surat', 'nama_pemilik', 'alamat_objek', 'luas_dokumen_m2', 'luas_peta_m2', 'status_inventarisasi', 'status_verifikasi', 'status_pemetaan', 'updated_at']
    : ['id_bidang', 'jenis_surat', 'status_inventarisasi', 'status_verifikasi', 'status_pemetaan'];
  var by = allowed.indexOf(params.sortBy) >= 0 ? params.sortBy : 'id_bidang';
  var dir = params.sortDir === 'desc' ? -1 : 1;
  var numeric = NUMERIC_COLUMNS.indexOf(by) >= 0;
  rows.sort(function (a, b) {
    var x = a[by], y = b[by];
    if (numeric) { x = numOrNull_(x); y = numOrNull_(y); if (x === null) x = -1; if (y === null) y = -1; return (x - y) * dir; }
    x = String(x === undefined ? '' : x).toLowerCase(); y = String(y === undefined ? '' : y).toLowerCase();
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return a.id_bidang < b.id_bidang ? -1 : 1;
  });
  return rows;
}

function searchLand_(ctx, params) {
  params = params || {};
  if (ctx.role === ROLE.PUBLIK) {
    var cfg = getConfig_();
    if (!cfgBool_(cfg, 'PETA_PUBLIK_AKTIF')) {
      throw new AppError('UNAUTHENTICATED', 'Pencarian bidang tanah hanya tersedia bagi petugas. Silakan masuk.', 401);
    }
  }
  var t = readTable_(SHEET.BIDANG);
  var rows = sortLands_(filterLands_(t.rows, params, ctx), params, ctx);
  var pg = clampPage_(params, ctx.role === ROLE.PUBLIK ? LIMITS.PAGE_MAX_PUBLIK : LIMITS.PAGE_MAX);
  var total = rows.length;
  var start = (pg.page - 1) * pg.size;
  return {
    items: rows.slice(start, start + pg.size).map(function (r) { return listItem_(r, ctx.role); }),
    total: total, page: pg.page, pageSize: pg.size, totalPages: Math.max(1, Math.ceil(total / pg.size))
  };
}

/* ---------- Statistik & laporan ---------- */

function countBy_(rows, keyFn) {
  var m = {};
  rows.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + 1; });
  return m;
}

function rtrwKey_(r) { return (r.rt || '') + '|' + (r.rw || ''); }

function getDashboardStats_(ctx) {
  var key = 'stat_' + cacheVer_();
  var cached = cacheGet_(key);
  if (cached) return JSON.parse(cached);
  var t = readTable_(SHEET.BIDANG);
  var rows = t.rows.filter(function (r) { return r.status_arsip !== STATUS.ARSIP; });
  var byJenis = countBy_(rows, function (r) { return r.jenis_surat || 'TIDAK_DIISI'; });
  var rtrw = countBy_(rows, rtrwKey_);
  var out = {
    total: rows.length,
    spt: byJenis.SPT || 0,
    shm: byJenis.SHM || 0,
    dipetakan: rows.filter(function (r) { return r.status_pemetaan === STATUS.DIPETAKAN; }).length,
    belum_dipetakan: rows.filter(function (r) { return r.status_pemetaan !== STATUS.DIPETAKAN; }).length,
    belum_lengkap: rows.filter(function (r) { return r.status_inventarisasi !== STATUS.LENGKAP; }).length,
    perlu_verifikasi: rows.filter(function (r) { return r.status_verifikasi !== STATUS.DIVERIFIKASI; }).length,
    per_jenis: Object.keys(byJenis).sort().map(function (k) { return { jenis: k, jumlah: byJenis[k] }; }),
    per_status_inventarisasi: [
      { status: STATUS.LENGKAP, jumlah: rows.filter(function (r) { return r.status_inventarisasi === STATUS.LENGKAP; }).length },
      { status: STATUS.BELUM_LENGKAP, jumlah: rows.filter(function (r) { return r.status_inventarisasi !== STATUS.LENGKAP; }).length }
    ],
    per_rtrw: Object.keys(rtrw).sort().map(function (k) {
      var p = k.split('|');
      return { rt: p[0], rw: p[1], jumlah: rtrw[k] };
    }),
    generated_at: nowIso_()
  };
  cachePut_(key, JSON.stringify(out), 120);
  return out;
}

function getReport_(ctx) {
  var t = readTable_(SHEET.BIDANG);
  var rows = t.rows.filter(function (r) { return r.status_arsip !== STATUS.ARSIP; });
  function sum(list, f) { return round_(list.reduce(function (a, r) { return a + (numOrNull_(r[f]) || 0); }, 0), 2); }
  function group(keyFn, labelFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); (m[k] = m[k] || []).push(r); });
    return Object.keys(m).sort().map(function (k) {
      var l = m[k];
      var o = labelFn(k);
      o.jumlah = l.length;
      o.luas_dokumen_m2 = sum(l, 'luas_dokumen_m2');
      o.luas_peta_m2 = sum(l, 'luas_peta_m2');
      o.dipetakan = l.filter(function (r) { return r.status_pemetaan === STATUS.DIPETAKAN; }).length;
      o.lengkap = l.filter(function (r) { return r.status_inventarisasi === STATUS.LENGKAP; }).length;
      return o;
    });
  }
  function count(f, v) { return rows.filter(function (r) { return r[f] === v; }).length; }
  return {
    generated_at: nowIso_(),
    total: rows.length,
    luas_dokumen_m2: sum(rows, 'luas_dokumen_m2'),
    luas_peta_m2: sum(rows, 'luas_peta_m2'),
    per_jenis: group(function (r) { return r.jenis_surat || 'TIDAK_DIISI'; }, function (k) { return { jenis: k }; }),
    per_rtrw: group(rtrwKey_, function (k) { var p = k.split('|'); return { rt: p[0], rw: p[1] }; }),
    kelengkapan: { lengkap: count('status_inventarisasi', STATUS.LENGKAP), belum_lengkap: rows.length - count('status_inventarisasi', STATUS.LENGKAP) },
    pemetaan: { sudah: count('status_pemetaan', STATUS.DIPETAKAN), belum: rows.length - count('status_pemetaan', STATUS.DIPETAKAN) },
    verifikasi: { sudah: count('status_verifikasi', STATUS.DIVERIFIKASI), belum: rows.length - count('status_verifikasi', STATUS.DIVERIFIKASI) },
    catatan: 'Luas hasil pemetaan adalah hasil perhitungan dari poligon peta, bukan pengukuran kadastral resmi.'
  };
}

/* ---------- Riwayat ---------- */

function getLandHistory_(ctx, params) {
  var id = checkLandId_(params && params.id_bidang);
  var logs = readTable_(SHEET.LOG);
  var users = readTable_(SHEET.USER);
  var names = {};
  users.rows.forEach(function (u) { names[u.user_id] = u.nama_pengguna; });
  var items = logs.rows.filter(function (l) {
    return l.id_referensi === id && (l.entitas === 'BIDANG' || l.entitas === 'GEOMETRI');
  }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; }).slice(0, 100).map(function (l) {
    return { timestamp: l.timestamp, pengguna: names[l.user_id] || '-', aksi: l.aksi, keterangan: l.keterangan, status: l.status };
  });
  return { id_bidang: id, items: items };
}

/* ---------- Ekspor ---------- */

function exportLandData_(ctx, params) {
  params = params || {};
  rateHit_('exp_' + ctx.user.user_id, RATE.EXPORT_MAX, RATE.EXPORT_SEC);
  var format = params.format === 'geojson' ? 'geojson' : 'csv';
  var t = readTable_(SHEET.BIDANG);
  var rows = sortLands_(filterLands_(t.rows, params, ctx), params, ctx);
  if (rows.length > LIMITS.EXPORT_ROWS) {
    throw new AppError('LIMIT_EXCEEDED', 'Data melebihi ' + LIMITS.EXPORT_ROWS + ' baris. Persempit filter sebelum mengekspor.', 400);
  }
  var stamp = nowIso_().substring(0, 10);
  if (format === 'geojson') {
    var g = readTable_(SHEET.GEOM);
    var geoById = {};
    g.rows.forEach(function (r) { geoById[r.id_bidang] = r; });
    var feats = [];
    rows.forEach(function (r) {
      var gr = geoById[r.id_bidang];
      var geom = gr ? parseGeometryJson_(gr.geojson) : null;
      if (!geom) return;
      feats.push({ type: 'Feature', properties: { id_bidang: r.id_bidang, nomor_surat: r.nomor_surat, jenis_surat: r.jenis_surat, status_verifikasi: r.status_verifikasi }, geometry: geom });
    });
    logActivity_(ctx, 'EKSPOR', 'BIDANG', '', 'Ekspor GeoJSON: ' + feats.length + ' bidang');
    return { filename: 'sipeta-pager-bidang-' + stamp + '.geojson', mimeType: 'application/geo+json',
      content: JSON.stringify({ type: 'FeatureCollection', features: feats }), jumlah: feats.length };
  }
  var cols = HEADERS.BIDANG_TANAH.slice();
  if (ctx.role !== ROLE.ADMIN) cols = cols.filter(function (c) { return c !== 'nik' && c !== 'alamat_pemilik'; });
  var lines = [cols.join(',')];
  rows.forEach(function (r) { lines.push(cols.map(function (c) { return csvEscape_(r[c]); }).join(',')); });
  logActivity_(ctx, 'EKSPOR', 'BIDANG', '', 'Ekspor CSV: ' + rows.length + ' baris' + (ctx.role === ROLE.ADMIN ? ' (termasuk data pribadi)' : ''));
  return { filename: 'sipeta-pager-bidang-' + stamp + '.csv', mimeType: 'text/csv', content: lines.join('\r\n'), jumlah: rows.length };
}

/* ---------- Impor CSV (administrator) ---------- */

function importCSV_(ctx, params) {
  var text = params && params.csv;
  var mode = params && params.mode === 'commit' ? 'commit' : 'preview';
  if (typeof text !== 'string' || !text.trim()) throw new AppError('VALIDATION_ERROR', 'Isi CSV kosong.', 400);
  if (text.length > 1500000) throw new AppError('LIMIT_EXCEEDED', 'File CSV terlalu besar.', 400);
  var table = parseCsv_(text);
  if (table.length < 2) throw new AppError('VALIDATION_ERROR', 'CSV harus memiliki baris header dan minimal satu baris data.', 400);
  var header = table[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var ignored = header.filter(function (h) { return h && LAND_INPUT_FIELDS.indexOf(h) < 0; });
  var dataRows = table.slice(1);
  if (dataRows.length > LIMITS.IMPORT_CSV_ROWS) {
    throw new AppError('LIMIT_EXCEEDED', 'Maksimal ' + LIMITS.IMPORT_CSV_ROWS + ' baris per impor.', 400);
  }
  if (header.indexOf('jenis_surat') < 0 || header.indexOf('nama_pemilik') < 0) {
    throw new AppError('VALIDATION_ERROR', 'Header CSV wajib memuat kolom jenis_surat dan nama_pemilik.', 400);
  }
  var cfg = getConfig_();
  var existing = readTable_(SHEET.BIDANG).rows;
  var report = { mode: mode, total: dataRows.length, valid: 0, invalid: 0, errors: [], kolom_diabaikan: ignored, saved: 0 };
  var goodClean = [];
  var seen = {};
  dataRows.forEach(function (cells, idx) {
    var obj = {};
    header.forEach(function (h, i) { if (LAND_INPUT_FIELDS.indexOf(h) >= 0) obj[h] = cells[i] === undefined ? '' : cells[i]; });
    var v = validateLandInput_(obj, cfg, { partial: false });
    var msg = v.errors.length ? v.errors[0] : '';
    if (!msg && v.clean.nomor_surat) {
      var k = v.clean.jenis_surat + '|' + v.clean.nomor_surat.toLowerCase();
      if (seen[k]) msg = 'Nomor surat ganda di dalam file.';
      else if (!(params.abaikan_duplikat === true) && findDuplicates_(existing, v.clean.nomor_surat, v.clean.jenis_surat, null).length) msg = 'Nomor surat sudah ada di database.';
      seen[k] = true;
    }
    if (msg) { report.invalid++; report.errors.push({ baris: idx + 2, message: msg }); return; }
    report.valid++;
    goodClean.push(v.clean);
  });
  if (mode === 'preview' || !goodClean.length) return report;
  return withLock_(function () {
    var t = readTable_(SHEET.BIDANG);
    var ids = allocateIds_(goodClean.length, t.rows);
    var objs = goodClean.map(function (c, i) { return buildNewLand_(c, ids[i], ctx, cfg); });
    appendObjects_(SHEET.BIDANG, objs);
    report.saved = objs.length;
    logActivity_(ctx, 'IMPOR_CSV', 'BIDANG', '', report.saved + ' bidang ditambahkan, ' + report.invalid + ' baris ditolak');
    bumpCache_();
    return report;
  });
}

/* ===== Util.gs ===== */
/**
 * SIPETA PAGER - Util.gs
 * Fungsi bantu umum: waktu, teks, angka, CSV, hash, rate limit, cache.
 */

function nowIso_() {
  return new Date().toISOString();
}

function todayDate_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function pad_(n, w) {
  var s = String(n);
  while (s.length < w) s = '0' + s;
  return s;
}

function isPlainObject_(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Membersihkan karakter kontrol dan spasi tepi. Tidak memotong teks. */
function cleanText_(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

/** Mengubah ke angka. Kosong -> null. Tidak valid -> NaN. */
function toNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function round_(n, d) {
  var f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function csvEscape_(v) {
  if (v === null || v === undefined) return '';
  var isNum = typeof v === 'number';
  var s = String(v);
  if (!isNum && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // cegah CSV/formula injection
  if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Parser CSV (mendukung tanda kutip, CRLF, pemisah koma atau titik koma). */
function parseCsv_(text) {
  text = String(text || '').replace(/^﻿/, '');
  var firstLine = text.split(/\r?\n/)[0] || '';
  var delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  var rows = [], row = [], field = '', inQ = false, i = 0, ch;
  while (i < text.length) {
    ch = text.charAt(i);
    if (inQ) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (inQ) throw new AppError('VALIDATION_ERROR', 'CSV tidak valid: tanda kutip tidak tertutup.', 400);
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function isValidEmail_(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* ---------- Cache (dengan pemecahan nilai besar) ---------- */

function cacheVer_() {
  return getProp_('CACHE_VER') || '0';
}

function bumpCache_() {
  PropertiesService.getScriptProperties().setProperty('CACHE_VER', Utilities.getUuid().substring(0, 8));
  _cfgMemo = null;
}

function cachePut_(key, str, ttlSec) {
  try {
    var c = CacheService.getScriptCache();
    var CH = 30000;
    var n = Math.max(1, Math.ceil(str.length / CH));
    var obj = {};
    obj[key + ':n'] = String(n);
    for (var i = 0; i < n; i++) obj[key + ':' + i] = str.substr(i * CH, CH);
    c.putAll(obj, Math.min(ttlSec || 300, 21600));
  } catch (e) { /* cache bersifat opsional */ }
}

function cacheGet_(key) {
  try {
    var c = CacheService.getScriptCache();
    var n = parseInt(c.get(key + ':n') || '0', 10);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + ':' + i);
    var got = c.getAll(keys);
    var out = '';
    for (var j = 0; j < n; j++) {
      var part = got[key + ':' + j];
      if (part === undefined || part === null) return null;
      out += part;
    }
    return out;
  } catch (e) { return null; }
}

/* ---------- Pembatasan laju ---------- */

function rateCheck_(key, max) {
  var v = parseInt(CacheService.getScriptCache().get('rl_' + key) || '0', 10);
  if (v >= max) throw new AppError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.', 429);
}

function rateHit_(key, max, sec) {
  var c = CacheService.getScriptCache();
  var v = parseInt(c.get('rl_' + key) || '0', 10) + 1;
  c.put('rl_' + key, String(v), Math.min(sec, 21600));
  if (v > max) throw new AppError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.', 429);
}

/* ---------- Penguncian ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new AppError('BUSY', 'Server sedang sibuk memproses permintaan lain. Silakan coba lagi.', 503);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

  global.SIPETA_DEMO_BACKEND = { handle: handle_, initDatabase: initDatabase, doPost: doPost, doGet: doGet };
})(window);
