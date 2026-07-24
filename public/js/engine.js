/*
 * MDA пресметковен мотор.
 * Безбеден парсер/евалуатор за формули: броеви, + - * / ( ), унарен минус,
 * променливи (влезни параметри), qty("КОД") и total("КОД") за други ставки,
 * и функции min/max/round/ceil/floor/abs.
 * Работи и во Node (module.exports) и во прелистувач (window.MDAEngine).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MDAEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ── Токенизација ──
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        const num = src.slice(i, j);
        if ((num.match(/\./g) || []).length > 1) throw new Error('Неважечки број: ' + num);
        tokens.push({ t: 'num', v: parseFloat(num) });
        i = j;
        continue;
      }
      if (/[A-Za-z_Ѐ-ӿ]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_Ѐ-ӿ]/.test(src[j])) j++;
        tokens.push({ t: 'id', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const q = ch;
        let j = i + 1;
        while (j < src.length && src[j] !== q) j++;
        if (j >= src.length) throw new Error('Незатворен стринг');
        tokens.push({ t: 'str', v: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      if ('+-*/(),'.includes(ch)) { tokens.push({ t: ch }); i++; continue; }
      throw new Error('Неважечки знак: "' + ch + '"');
    }
    return tokens;
  }

  // ── Парсирање (рекурзивно спуштање) → AST ──
  function parse(src) {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (t) => {
      const tok = next();
      if (!tok || tok.t !== t) throw new Error('Се очекува "' + t + '"');
      return tok;
    };

    function expr() {
      let node = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t;
        node = { op, l: node, r: term() };
      }
      return node;
    }
    function term() {
      let node = unary();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        const op = next().t;
        node = { op, l: node, r: unary() };
      }
      return node;
    }
    function unary() {
      if (peek() && peek().t === '-') { next(); return { op: 'neg', l: unary() }; }
      if (peek() && peek().t === '+') { next(); return unary(); }
      return atom();
    }
    function atom() {
      const tok = next();
      if (!tok) throw new Error('Недовршен израз');
      if (tok.t === 'num') return { op: 'num', v: tok.v };
      if (tok.t === '(') {
        const node = expr();
        expect(')');
        return node;
      }
      if (tok.t === 'id') {
        if (peek() && peek().t === '(') {
          next();
          const args = [];
          if (peek() && peek().t !== ')') {
            for (;;) {
              if (peek() && peek().t === 'str') args.push({ op: 'str', v: next().v });
              else args.push(expr());
              if (peek() && peek().t === ',') { next(); continue; }
              break;
            }
          }
          expect(')');
          return { op: 'call', name: tok.v, args };
        }
        return { op: 'var', name: tok.v };
      }
      throw new Error('Неочекуван токен');
    }

    const node = expr();
    if (pos < tokens.length) throw new Error('Вишок текст по изразот');
    return node;
  }

  const MATH_FNS = {
    min: (a) => Math.min(...a), max: (a) => Math.max(...a),
    round: (a) => Math.round(a[0]), ceil: (a) => Math.ceil(a[0]),
    floor: (a) => Math.floor(a[0]), abs: (a) => Math.abs(a[0]),
  };

  function evalAst(node, ctx) {
    switch (node.op) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'neg': return -evalAst(node.l, ctx);
      case '+': return evalAst(node.l, ctx) + evalAst(node.r, ctx);
      case '-': return evalAst(node.l, ctx) - evalAst(node.r, ctx);
      case '*': return evalAst(node.l, ctx) * evalAst(node.r, ctx);
      case '/': {
        const d = evalAst(node.r, ctx);
        return d === 0 ? 0 : evalAst(node.l, ctx) / d;
      }
      case 'var': {
        if (!(node.name in ctx.vars)) throw new Error('Непозната променлива: ' + node.name);
        return ctx.vars[node.name];
      }
      case 'call': {
        const args = node.args.map((a) => evalAst(a, ctx));
        if (node.name === 'qty') return ctx.qty(String(args[0]));
        if (node.name === 'total') return ctx.total(String(args[0]));
        if (MATH_FNS[node.name]) return MATH_FNS[node.name](args);
        throw new Error('Непозната функција: ' + node.name);
      }
      default: throw new Error('Неважечки јазол');
    }
  }

  // Валидација на формула (за админ панелот): враќа null или порака за грешка.
  function validate(formula, knownVars, knownCodes) {
    try {
      const ast = parse(formula);
      const errs = [];
      (function walk(n) {
        if (n.op === 'var' && knownVars && !knownVars.includes(n.name)) errs.push('Непозната променлива: ' + n.name);
        if (n.op === 'call' && (n.name === 'qty' || n.name === 'total')) {
          const arg = n.args[0];
          if (knownCodes && arg && arg.op === 'str' && !knownCodes.includes(arg.v)) errs.push('Непознат код: ' + arg.v);
        }
        if (n.l) walk(n.l);
        if (n.r) walk(n.r);
        if (n.args) n.args.forEach(walk);
      })(ast);
      return errs.length ? errs.join('; ') : null;
    } catch (e) {
      return e.message;
    }
  }

  /*
   * compute(db, state) → резултат од пресметката.
   * db: { settings, inputs, categories, materials }
   * state: { inputs: {клуч: вредност}, windows: [{name, qty, priceEur}], discountEur }
   */
  function compute(db, state) {
    state = state || {};
    const rate = db.settings.eurRate || 62;
    const vat = 1 + (db.settings.vatPct || 18) / 100;
    const windows = state.windows || [];
    const errors = [];

    // Влезни променливи: стандардни вредности + прегазени од state
    const vars = {};
    for (const inp of db.inputs) {
      if (inp.type === 'derived') continue;
      let v = state.inputs && state.inputs[inp.key] != null ? state.inputs[inp.key] : inp.def;
      vars[inp.key] = Number(v) || 0;
    }

    // Ексклузивни групи: во иста група смее да биде вклучен само еден прекинувач.
    // Ако се вклучени повеќе, првиот по редослед победува — спречува двојно наплаќање
    // (пр. КАМЕНА и СИП, ЛИМ и ПУР кров, ламинат и плочки).
    const exWinner = {};
    for (const inp of db.inputs) {
      if (inp.type !== 'boolean' || !inp.exclusive || !vars[inp.key]) continue;
      if (exWinner[inp.exclusive]) {
        vars[inp.key] = 0;
        errors.push('Ексклузивна група „' + inp.exclusive + '": ' + inp.key +
          ' е игнориран бидејќи ' + exWinner[inp.exclusive] + ' е веќе вклучен.');
      } else {
        exWinner[inp.exclusive] = inp.key;
      }
    }

    // Условени полиња: количината/цената важи само ако придружниот прекинувач е вклучен.
    // Внесената вредност се чува во state — само пресметката ја гледа како 0.
    for (const inp of db.inputs) {
      if (inp.gate && !vars[inp.gate]) vars[inp.key] = 0;
    }

    vars.WINDOWS_QTY = windows.reduce((s, w) => s + (Number(w.qty) || 0), 0);
    // Изведени променливи (по редослед на дефинирање)
    for (const inp of db.inputs) {
      if (inp.type !== 'derived') continue;
      try {
        vars[inp.key] = evalAst(parse(inp.formula || '0'), { vars, qty: () => 0, total: () => 0 });
      } catch (e) {
        vars[inp.key] = 0;
        errors.push('Параметар ' + inp.key + ': ' + e.message);
      }
    }

    const matMap = {};
    for (const mat of db.materials) matMap[mat.code] = mat;

    // Мемоизирана рекурзија со детекција на циклуси
    const qtyCache = {}, priceCache = {}, visiting = {};
    function qtyOf(code) {
      if (code in qtyCache) return qtyCache[code];
      const mat = matMap[code];
      if (!mat) { errors.push('Непознат код: ' + code); return 0; }
      if (mat.active === false) return (qtyCache[code] = 0);
      if (visiting['q' + code]) { errors.push('Циклична формула кај ' + code); return 0; }
      visiting['q' + code] = true;
      let q = 0;
      try {
        if (mat.formula) q = evalAst(parse(mat.formula), ctx);
        else q = Number(mat.defQty) || 0;
      } catch (e) {
        errors.push(code + ' (' + mat.name + '): ' + e.message);
      }
      delete visiting['q' + code];
      if (!isFinite(q)) q = 0;
      return (qtyCache[code] = q);
    }
    function priceOf(code) {
      if (code in priceCache) return priceCache[code];
      const mat = matMap[code];
      if (!mat) return 0;
      if (visiting['p' + code]) { errors.push('Циклична формула за цена кај ' + code); return 0; }
      visiting['p' + code] = true;
      let p = Number(mat.price) || 0;
      if (mat.priceFormula) {
        // Во формулата за цена, PRICE е основната цена на ставката — така коефициентите
        // (пр. боја на лим) се пишуваат како `PRICE * BOJA_LIM` без да се повторува бројот.
        const priceCtx = { vars: Object.assign({}, vars, { PRICE: p }), qty: qtyOf, total: totalOf };
        try { p = evalAst(parse(mat.priceFormula), priceCtx); }
        catch (e) { errors.push(code + ' цена: ' + e.message); }
      }
      delete visiting['p' + code];
      if (!isFinite(p)) p = 0;
      return (priceCache[code] = p);
    }
    const totalOf = (code) => qtyOf(code) * priceOf(code);
    const ctx = { vars, qty: qtyOf, total: totalOf };

    // Редови по ставка
    const rows = [];
    for (const mat of db.materials) {
      if (mat.active === false) continue;
      const qty = qtyOf(mat.code);
      const price = priceOf(mat.code);
      const totalMkd = qty * price;
      rows.push({
        code: mat.code, cat: mat.cat, name: mat.name, unit: mat.unit,
        qty, price, totalMkd, eur: totalMkd / rate, grey: mat.grey || 0,
      });
    }
    // Коефициенти што важат за целата дограма (пр. боја надвор/внатре).
    // Секој параметар со target:'windows' се множи во цената на прозорите.
    let winFactor = 1;
    for (const inp of db.inputs) {
      if (inp.target !== 'windows') continue;
      const f = vars[inp.key];
      if (f > 0) winFactor *= f;
    }

    // Динамички редови за прозори → во ДОГРАМА
    for (const w of windows) {
      const qty = Number(w.qty) || 0;
      const priceMkd = (Number(w.priceEur) || 0) * rate * winFactor;
      const totalMkd = qty * priceMkd;
      rows.push({
        code: null, cat: 'DOGRAMA', name: w.name || 'прозор', unit: 'кол',
        qty, price: priceMkd, totalMkd, eur: totalMkd / rate, grey: 1, isWindow: true,
      });
    }

    // Збирови по категорија и вкупно
    const byCat = {};
    for (const c of db.categories) byCat[c.id] = { id: c.id, name: c.name, eur: 0, mkd: 0 };
    let totalMkd = 0, greyEur = 0;
    for (const r of rows) {
      if (byCat[r.cat]) { byCat[r.cat].eur += r.eur; byCat[r.cat].mkd += r.totalMkd; }
      totalMkd += r.totalMkd;
      greyEur += r.eur * (r.grey || 0);
    }
    const totalEur = totalMkd / rate;
    const discountEur = Number(state.discountEur) || 0;
    const finalEur = totalEur - discountEur;
    const area = vars.AREA || (vars.AREA_HOUSE + vars.AREA_TERRACE) || 1;

    return {
      rows,
      byCat: db.categories.map((c) => byCat[c.id]),
      totalMkd,
      totalEur,
      taxEur: totalEur - totalEur / vat,
      perM2: totalEur / area,
      greyEur,
      greyPerM2: greyEur / area,
      discountEur,
      finalEur,
      finalPerM2: finalEur / area,
      area,
      vars,
      errors,
    };
  }

  return { tokenize, parse, validate, compute };
});
