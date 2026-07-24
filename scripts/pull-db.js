#!/usr/bin/env node
/*
 * Ја симнува ЖИВАТА база од продукција (Railway) во локалниот data/db.json.
 *
 *   node scripts/pull-db.js https://твојот-сајт.up.railway.app [ЛОЗИНКА]
 *   MDA_URL=https://… MDA_ADMIN_PASSWORD=… node scripts/pull-db.js
 *
 * Прави резервна копија од постоечкиот локален db.json пред да го замени,
 * и ја ЗАДРЖУВА локалната админ лозинка (извозот не ја содржи).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const url = process.argv[2] || process.env.MDA_URL;
const pass = process.argv[3] || process.env.MDA_ADMIN_PASSWORD;

if (!url || !pass) {
  console.error('Употреба: node scripts/pull-db.js <URL> <ЛОЗИНКА>');
  console.error('   или:  MDA_URL=… MDA_ADMIN_PASSWORD=… node scripts/pull-db.js');
  process.exit(1);
}

const base = url.replace(/\/+$/, '');
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function request(method, urlStr, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = lib.request(
      { method, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  console.log('→ Најава на ' + base + ' …');
  const login = await request('POST', base + '/api/login', { body: { password: pass } });
  if (login.status !== 200) {
    console.error(`✖ Најавата не успеа (HTTP ${login.status}). ${login.body.slice(0, 200)}`);
    process.exit(1);
  }
  const token = JSON.parse(login.body).token;

  console.log('→ Се симнува базата …');
  const exp = await request('GET', base + '/api/admin/export', { token });
  if (exp.status !== 200) {
    console.error(`✖ Извозот не успеа (HTTP ${exp.status}). Дали серверот е ажуриран?`);
    process.exit(1);
  }
  let live;
  try { live = JSON.parse(exp.body); } catch { console.error('✖ Одговорот не е валиден JSON.'); process.exit(1); }
  if (!Array.isArray(live.materials) || !Array.isArray(live.categories) || !Array.isArray(live.inputs)) {
    console.error('✖ Неочекуван формат (недостасуваат materials/categories/inputs).');
    process.exit(1);
  }

  // Задржи ја локалната админ лозинка — извозот намерно не ја содржи
  let localPass = 'admin123';
  if (fs.existsSync(DB_FILE)) {
    try {
      const cur = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (cur.settings && cur.settings.adminPassword) localPass = cur.settings.adminPassword;
    } catch { /* оштетен локален фајл — игнорирај */ }
    const bak = DB_FILE.replace(/\.json$/, '') + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    fs.copyFileSync(DB_FILE, bak);
    console.log('→ Резервна копија: ' + path.basename(bak));
  }
  live.settings = Object.assign({}, live.settings, { adminPassword: localPass });

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(live, null, 2));

  const days = live.analytics && live.analytics.daily ? Object.keys(live.analytics.daily).length : 0;
  console.log('\n✔ Живата база е снимена во data/db.json');
  console.log(`   материјали: ${live.materials.length}  категории: ${live.categories.length}  параметри: ${live.inputs.length}`);
  console.log(`   понуди: ${(live.quotes || []).length}  барања: ${(live.inquiries || []).length}  денови аналитика: ${days}`);
  console.log('\n   Стартувај локално:  node server.js');
  console.log('   Локална админ лозинка: непроменета (' + (localPass === 'admin123' ? 'admin123' : 'како порано') + ')');
})().catch((e) => { console.error('✖ Грешка: ' + e.message); process.exit(1); });
