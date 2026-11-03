'use strict';
/**
 * Memuat backend Apps Script ke dalam sandbox Node dengan layanan simulasi dari
 * assets/js/gas-shim.js (shim yang sama dipakai mode demo di browser).
 * Ini BUKAN pengganti uji nyata di Google Apps Script (lihat docs/TESTING.md).
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const shimLib = require('../assets/js/gas-shim.js');

function createEnv(opts) {
  opts = opts || {};
  const env = shimLib.create({ spreadsheetId: 'TEST-SHEET-ID', ownerEmail: 'pemilik@example.test' });
  const sandbox = Object.assign({
    console: { log() {}, error: (m) => env.errors.push(String(m)), warn() {} },
    Date, Math, JSON, Object, Array, String, Number, Error, TypeError, RegExp, parseInt, parseFloat, isFinite, isNaN, encodeURIComponent
  }, env.services);
  const context = vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'apps-script');
  // Urutan alfabet = skenario terburuk untuk ketergantungan antar-file.
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), context, { filename: f }));
  env.ctx = context;
  env.files = files;
  env.props.SPREADSHEET_ID = 'TEST-SHEET-ID';
  env.props.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com';
  env.props.ADMIN_EMAIL = 'admin@example.test';
  env.call = (action, token, params, viaGet) => JSON.parse(JSON.stringify(context.handle_(action, token, params, !!viaGet)));
  env.run = (code) => vm.runInContext(code, context);
  env.login = (email) => {
    const tok = 'g.' + email.replace(/[^a-z0-9]/gi, '') + '.' + Math.random().toString(36).slice(2) + 'xxxxxxxxxxxxxxxx';
    env.addIdToken(tok, email);
    const r = env.call('login', null, { idToken: tok });
    if (!r.success) throw new Error('Login uji gagal: ' + JSON.stringify(r));
    return r.data.token;
  };
  return env;
}

module.exports = { createEnv };
