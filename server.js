/*
 * MDA Калкулатор — сервер без надворешни зависности (чист Node.js).
 * Стартување:  node server.js  →  http://localhost:3000
 * Админ:       http://localhost:3000/admin.html  (лозинка: admin123)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
// Патека на базата: за јавен деплој постави MDA_DB_FILE на монтиран диск (пр. /data/db.json)
const DB_FILE = process.env.MDA_DB_FILE || path.join(ROOT, 'data', 'db.json');
const PUBLIC = path.join(ROOT, 'public');

// ── База (JSON датотека, се создава од seed при прв старт) ──
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
let db;
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log(`✔ База ВЧИТАНА од постоечка датотека: ${DB_FILE} (податоците се зачувани).`);
} else {
  db = JSON.parse(JSON.stringify(require('./data/seed.js'))); // длабока копија на seed
  saveDb();
  console.log(`⚠ Нема постоечка база — СОЗДАДЕНА од seed на: ${DB_FILE}.`);
  console.log(`  Ако ова се појавува по СЕКОЈ редеплој, значи ${path.dirname(DB_FILE)} НЕ е на постојан Railway Volume — измените нема да се чуваат.`);
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// Админ лозинката од околина е авторитативна при јавен деплој
if (process.env.MDA_ADMIN_PASSWORD) {
  db.settings.adminPassword = process.env.MDA_ADMIN_PASSWORD;
} else if (db.settings.adminPassword === 'admin123') {
  console.warn('⚠  Се користи стандардната админ лозинка "admin123". За јавен деплој постави MDA_ADMIN_PASSWORD.');
}

// ── Едноставна токен автентикација за админ ──
const tokens = new Set();
function isAuthed(req) {
  const h = req.headers['authorization'] || '';
  return tokens.has(h.replace('Bearer ', ''));
}
// Споредба во константно време (спречува timing напади врз лозинката)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
// Ограничување на обиди за најава по IP (заштита од brute-force)
const loginAttempts = new Map();
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}
function loginBlocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
  return rec.count >= 8;
}
function noteLoginFail(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, first: Date.now() };
  rec.count++;
  loginAttempts.set(ip, rec);
}

// ── Помошни ──
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('bad json')); }
    });
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.avif': 'image/avif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Јавната конфигурација — без админ лозинка
function publicConfig() {
  const { adminPassword, ...settings } = db.settings;
  return {
    settings,
    inputGroups: db.inputGroups,
    inputs: db.inputs,
    categories: db.categories,
    materials: db.materials,
    windowsDefaults: db.windowsDefaults,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    // ── Health check (за хостинг платформите) ──
    if (p === '/healthz') return json(res, 200, { ok: true });

    // ── API ──
    if (p === '/api/config' && req.method === 'GET') return json(res, 200, publicConfig());

    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (loginBlocked(ip)) return json(res, 429, { error: 'Премногу обиди. Обидете се повторно за 15 минути.' });
      const body = await readBody(req);
      if (body.password && safeEqual(body.password, db.settings.adminPassword)) {
        loginAttempts.delete(ip);
        const token = crypto.randomBytes(24).toString('hex');
        tokens.add(token);
        return json(res, 200, { token });
      }
      noteLoginFail(ip);
      return json(res, 401, { error: 'Погрешна лозинка' });
    }

    // Понуди: зачувување е јавно, листање/бришење е за админ
    if (p === '/api/quotes' && req.method === 'POST') {
      const body = await readBody(req);
      const quote = {
        id: crypto.randomBytes(8).toString('hex'),
        createdAt: new Date().toISOString(),
        client: String(body.client || 'Без име').slice(0, 120),
        inputs: body.inputs || {},
        windows: body.windows || [],
        discountEur: Number(body.discountEur) || 0,
        totalEur: Number(body.totalEur) || 0,
      };
      db.quotes = db.quotes || [];
      db.quotes.unshift(quote);
      saveDb();
      return json(res, 200, { id: quote.id });
    }
    const quoteMatch = p.match(/^\/api\/quotes\/([a-f0-9]+)$/);
    if (quoteMatch && req.method === 'GET') {
      const q = (db.quotes || []).find((x) => x.id === quoteMatch[1]);
      return q ? json(res, 200, q) : json(res, 404, { error: 'not found' });
    }

    // Барања од формуларот „Куќа по мој план" — јавно зачувување
    if (p === '/api/inquiry' && req.method === 'POST') {
      const body = await readBody(req);
      const s = (v, n) => String(v == null ? '' : v).slice(0, n);
      const inquiry = {
        id: crypto.randomBytes(8).toString('hex'),
        createdAt: new Date().toISOString(),
        firstName: s(body.firstName, 80), lastName: s(body.lastName, 80),
        email: s(body.email, 120), phone: s(body.phone, 60),
        location: s(body.location, 160), area: s(body.area, 60),
        has: Array.isArray(body.has) ? body.has.map((x) => s(x, 80)).slice(0, 20) : [],
        budget: s(body.budget, 60), financing: s(body.financing, 60),
        message: s(body.message, 3000),
      };
      if (!inquiry.email && !inquiry.phone) return json(res, 400, { error: 'Потребен е email или телефон' });
      db.inquiries = db.inquiries || [];
      db.inquiries.unshift(inquiry);
      saveDb();
      return json(res, 200, { id: inquiry.id });
    }

    if (p.startsWith('/api/admin/')) {
      if (!isAuthed(req)) return json(res, 401, { error: 'Најавете се' });
      const what = p.slice('/api/admin/'.length);

      if (what === 'quotes' && req.method === 'GET') return json(res, 200, db.quotes || []);
      const delQuote = what.match(/^quotes\/([a-f0-9]+)$/);
      if (delQuote && req.method === 'DELETE') {
        db.quotes = (db.quotes || []).filter((q) => q.id !== delQuote[1]);
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (what === 'inquiries' && req.method === 'GET') return json(res, 200, db.inquiries || []);
      const delInq = what.match(/^inquiries\/([a-f0-9]+)$/);
      if (delInq && req.method === 'DELETE') {
        db.inquiries = (db.inquiries || []).filter((q) => q.id !== delInq[1]);
        saveDb();
        return json(res, 200, { ok: true });
      }

      // Шаблони за ПОНУДА (клуч на рака / сива фаза) — само за админ
      if (what === 'offer' && req.method === 'GET') {
        delete require.cache[require.resolve('./data/offer.js')];
        return json(res, 200, require('./data/offer.js'));
      }

      // Извоз на целата база (за резервна копија / пренос на друг сервер) — без лозинката
      if (what === 'export' && req.method === 'GET') {
        const { adminPassword, ...settings } = db.settings;
        const dump = Object.assign({}, db, { settings });
        const fname = 'mda-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + fname + '"',
        });
        return res.end(JSON.stringify(dump, null, 2));
      }
      // Внес на резервна копија — ја заменува целата база (ја задржува тековната лозинка)
      if (what === 'import' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body || !Array.isArray(body.materials) || !Array.isArray(body.categories) || !Array.isArray(body.inputs)) {
          return json(res, 400, { error: 'Неважечка резервна копија (недостасуваат materials/categories/inputs).' });
        }
        const keepPw = db.settings.adminPassword;
        db = body;
        db.settings = Object.assign({}, body.settings || {}, { adminPassword: keepPw });
        db.quotes = Array.isArray(db.quotes) ? db.quotes : [];
        db.inquiries = Array.isArray(db.inquiries) ? db.inquiries : [];
        saveDb();
        return json(res, 200, { ok: true, materials: db.materials.length });
      }

      // Колекции: PUT ја заменува целата колекција (админот уредува локално и зачувува)
      const collections = ['materials', 'categories', 'inputs', 'windowsDefaults', 'inputGroups'];
      if (collections.includes(what) && req.method === 'PUT') {
        const body = await readBody(req);
        if (!Array.isArray(body)) return json(res, 400, { error: 'Се очекува низа' });
        db[what] = body;
        saveDb();
        return json(res, 200, { ok: true });
      }
      if (what === 'settings' && req.method === 'PUT') {
        const body = await readBody(req);
        const keep = db.settings.adminPassword;
        db.settings = Object.assign({}, db.settings, body);
        if (!body.adminPassword) db.settings.adminPassword = keep;
        saveDb();
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'not found' });
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    // ── Статични датотеки ──
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MDA Калкулатор слуша на ${HOST}:${PORT}`);
  console.log(`База: ${DB_FILE}`);
});
