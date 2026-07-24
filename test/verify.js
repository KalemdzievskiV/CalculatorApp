// Верификација: моторот мора да ги даде истите бројки како PRESMETKA 26.03.2026.xlsx
const engine = require('../public/js/engine.js');
const seed = require('../data/seed.js');

/*
 * Ставките што порано имаа фиксна количина (санитарии, ОСБ, гаражни плочки, скеле,
 * метална конструкција) сега се управуваат од калкулаторот и стандардно се ИСКЛУЧЕНИ.
 * За да се спореди со Excel-от, тука се вклучуваат со истите количини како порано —
 * ако сите проверки поминат, значи параметризацијата не ја смени пресметката.
 */
const EXCEL_SCENARIO = {
  WC_SANITARY: 3,      // беше фиксно 3 кај V03–V06 (и 18 = 3×6 кај V07/V08)
  OSB_POD: 90,         // беше фиксно 90 кај PD02
  GARAZA_PLOCHKI: 18,  // беше фиксно 18 кај PD16
  SKELE: 1,            // беше фиксно 1 кај L10
  METALNA: 1,          // беше фиксно 1 кај X01
};

const defaults = {};
seed.inputs.forEach((i) => { if (i.type !== 'derived') defaults[i.key] = i.def; });
const excelInputs = Object.assign({}, defaults, EXCEL_SCENARIO);

const res = engine.compute(seed, { inputs: excelInputs, windows: seed.windowsDefaults });

const EXPECTED = {
  totalEur: 112640.33747476709,
  taxEur: 17182.424360557692,
  perM2: 631.3566362578729,
  greyEur: 67520.13000788921,
  area: 178.41,
};

let fail = 0;
function check(name, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: got ${got.toFixed(4)}, expected ${want.toFixed(4)}`);
}

check('TOTAL EUR', res.totalEur, EXPECTED.totalEur);
check('TAX EUR', res.taxEur, EXPECTED.taxEur);
check('PRICE PER m2', res.perM2, EXPECTED.perM2);
check('GREY PHASE EUR', res.greyEur, EXPECTED.greyEur);
check('AREA', res.area, EXPECTED.area);

// Проверка по категорија наспроти RECAPITLAR листот (ЕУР)
const RECAP = {
  KONSTRUKCIJA: 18183.488911290326,
  ZASHTITA: 1570.233870967742,
  FASADA: 8429.208669354839,
  IZOLACIJA: 3401.4596774193556,
  SHTRAFOVI: 1597.1771572580644,
  GIPS_KARTON: 12048.182624327957,
  VODOVOD: 3677.4193548387098,
  ELEKTRIKA: 221.5268817204301,
  PODOVI: 8283.052396313366,
  DOGRAMA: 6979.8387096774195,
  POKRIVANJE: 6812.874221598879,
  DOPOLNITELNI: 3108.3064516129034,
};
for (const c of res.byCat) {
  if (RECAP[c.id] != null) check('  ' + c.name, c.eur, RECAP[c.id]);
}

// ── ПОНУДА (листови PONUDA (2) и PONUDA СИВА) ──
const offer = require('../data/offer.js');
const inp = excelInputs;
const areaWithSims = inp.AREA_HOUSE + inp.SIMS + inp.AREA_TERRACE; // 166 + 11 + 12.41
console.log('\nПОНУДА:');
check('  Вкупна површина со симсови', areaWithSims, 189.41);
check('  Клуч на рака — цена/m² со симсови', res.totalEur / areaWithSims, 594.6905521079515);
check('  Сива фаза — вкупно ЕУР', res.greyEur, 67520.13000788921);
check('  Сива фаза — цена/m² со симсови', res.greyEur / areaWithSims, 356.47605727199834);
check('  Сива фаза — вкупно ДЕН', res.greyEur * seed.settings.eurRate, 4186248.060489131);
const payExpected = [4888590.646404892, 1047555.1385153336, 349185.0461717779, 349185.0461717779, 349185.0461717779];
offer.payment.forEach((p, i) => check(`  Плаќање ${(p.pct * 100).toFixed(0)}% ${p.desc}`, res.totalMkd * p.pct, payExpected[i]));
check('  Плаќање — збир на проценти', offer.payment.reduce((s, p) => s + p.pct, 0), 1);

if (res.errors.length) {
  console.log('\nГрешки од моторот:');
  res.errors.forEach((e) => console.log('  -', e));
  fail++;
}

// ── Новите можности на моторот ──
console.log('\nПАРАМЕТРИЗАЦИЈА:');
const run = (over) => engine.compute(seed, { inputs: Object.assign({}, defaults, over), windows: seed.windowsDefaults });
const qtyOf = (r, code) => { const x = r.rows.find((z) => z.code === code); return x ? x.qty : 0; };
const priceOf = (r, code) => { const x = r.rows.find((z) => z.code === code); return x ? x.price : 0; };

// Стандардно сè е исклучено — ниту една од порано фиксните ставки не се наплаќа
const off = run({});
['V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'PD02', 'PD16', 'L10', 'X01'].forEach((c) =>
  check('  стандардно исклучено ' + c, qtyOf(off, c), 0));

// Условено поле: количината важи само ако придружниот прекинувач е вклучен
check('  условено — премиум фасада исклучена', qtyOf(run({ PREMIUM_FAS: 0, PREMIUM_FAS_M2: 40 }), 'F18'), 0);
check('  условено — премиум фасада вклучена', qtyOf(run({ PREMIUM_FAS: 1, PREMIUM_FAS_M2: 40 }), 'F18'), 40);

// Ексклузивност: не смее и камена и СИП да се пресметаат истовремено
const both = run({ KAMENA: 1, SIP: 1 });
check('  ексклузивно — СИП игнориран кога камена е вклучена', qtyOf(both, 'S01'), 0);
if (!both.errors.some((e) => e.includes('Ексклузивна група'))) {
  console.log('FAIL   ексклузивно — недостига предупредување за двоен избор');
  fail++;
} else {
  console.log('OK     ексклузивно — предупредување за двоен избор');
}

// Коефициент за цена преку PRICE
check('  коефициент — боја на лим ×1', priceOf(run({ BOJA_LIM: 1 }), 'R03'), 1450);
check('  коефициент — боја на лим ×1.4', priceOf(run({ BOJA_LIM: 1.4 }), 'R03'), 2030);

// Цена по проект наместо глобална
check('  цена по проект — метална конструкција', priceOf(run({ METALNA: 1, METALNA_CENA: 250000 }), 'X01'), 250000);

// Коефициент врз дограмата (target: 'windows')
const w1 = run({}).rows.find((r) => r.isWindow);
const w2 = run({ BOJA_PROZ_NADV: 1.2 }).rows.find((r) => r.isWindow);
check('  коефициент — боја на прозори ×1.2', w2.price, w1.price * 1.2);

// Санитариите следат „без галантерија"
check('  без галантерија — санитарии', qtyOf(run({ WC_SANITARY: 3, BEZ_GALANT: 1 }), 'V03'), 0);
check('  без галантерија — електрика', qtyOf(run({ ELEKTRIKA: 1, EL_BEZ_GALANT: 1 }), 'E37'), 0);

console.log(fail ? `\n${fail} ПРОВЕРКИ ПАДНАА` : '\nСИТЕ ПРОВЕРКИ ПОМИНАА ✓');
process.exit(fail ? 1 : 0);
