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

if (res.errors.length) {
  console.log('\nГрешки од моторот:');
  res.errors.forEach((e) => console.log('  -', e));
  fail++;
}

console.log(fail ? `\n${fail} ПРОВЕРКИ ПАДНАА` : '\nСИТЕ ПРОВЕРКИ ПОМИНАА ✓');
process.exit(fail ? 1 : 0);
