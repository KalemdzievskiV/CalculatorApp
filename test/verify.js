// Верификација: моторот мора да ги даде истите бројки како PRESMETKA 26.03.2026.xlsx
const engine = require('../public/js/engine.js');
const seed = require('../data/seed.js');

const res = engine.compute(seed, { windows: seed.windowsDefaults });

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
const inp = {};
seed.inputs.forEach((i) => { if (i.type !== 'derived') inp[i.key] = i.def; });
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

console.log(fail ? `\n${fail} ПРОВЕРКИ ПАДНАА` : '\nСИТЕ ПРОВЕРКИ ПОМИНАА ✓');
process.exit(fail ? 1 : 0);
